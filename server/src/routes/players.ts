import { Router } from 'express';
import { z } from 'zod';
import { Player, User } from '../models/index.js';
import { asyncHandler } from '../lib/async-handler.js';
import { HttpError } from '../lib/http-error.js';
import { langQuery, objectId, pagination, parseBody, parseQuery } from '../lib/validate.js';
import { normalizeLang, paginationMeta, serializePlayer } from '../lib/serializers.js';
import { escapeRegex } from '../lib/sanitize.js';
import { requireAdmin } from '../middleware/auth.js';
import { writeLimiter } from '../middleware/rate-limit.js';

export const playersRouter: Router = Router();

const TITLES = ['GM', 'IM', 'FM', 'CM', 'WGM', 'WIM', 'WFM', 'WCM', 'NM', ''] as const;

const playerBody = z.object({
  name_en: z.string().trim().min(1, 'English name is required').max(200),
  name_ar: z.string().trim().min(1, 'Arabic name is required').max(200),
  bio_en: z.string().max(20_000).nullish(),
  bio_ar: z.string().max(20_000).nullish(),
  country: z.string().max(100).nullish(),
  rating: z.coerce.number().int().min(0).max(4000).nullish(),
  title: z.enum(TITLES).nullish(),
  image_url: z.string().max(500).nullish(),
  date_of_birth: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date of birth must be YYYY-MM-DD')
    .nullish(),
  is_player_of_month: z.boolean().optional(),
  is_tournament_winner: z.boolean().optional(),
});

type PlayerBody = z.infer<typeof playerBody>;

/** Map the API payload onto model fields, leaving absent keys untouched. */
function toAttrs(body: Partial<PlayerBody>) {
  const attrs: Record<string, unknown> = {};
  if (body.name_en !== undefined) attrs.nameEn = body.name_en;
  if (body.name_ar !== undefined) attrs.nameAr = body.name_ar;
  if (body.bio_en !== undefined) attrs.bioEn = body.bio_en || null;
  if (body.bio_ar !== undefined) attrs.bioAr = body.bio_ar || null;
  if (body.country !== undefined) attrs.country = body.country || null;
  if (body.rating !== undefined) attrs.rating = body.rating ?? null;
  if (body.title !== undefined) attrs.title = body.title || null;
  if (body.image_url !== undefined) attrs.imageUrl = body.image_url || null;
  if (body.date_of_birth !== undefined) {
    // Parsed as UTC midnight so the stored day never shifts with server timezone.
    attrs.dateOfBirth = body.date_of_birth ? new Date(`${body.date_of_birth}T00:00:00.000Z`) : null;
  }
  return attrs;
}

/** Only one player may hold a spotlight flag; clear it everywhere else. */
async function makeExclusive(field: 'isPlayerOfMonth' | 'isTournamentWinner', keepId: string) {
  await Player.updateMany({ _id: { $ne: keepId }, [field]: true }, { $set: { [field]: false } });
}

// ------------------------------------------------------------------ public

playersRouter.get(
  '/homepage',
  asyncHandler(async (req, res) => {
    const { lang } = parseQuery(langQuery, req);
    const [playerOfMonth, tournamentWinner] = await Promise.all([
      Player.findOne({ isPlayerOfMonth: true }),
      Player.findOne({ isTournamentWinner: true }),
    ]);

    res.json({
      player_of_month: playerOfMonth ? serializePlayer(playerOfMonth, lang) : null,
      tournament_winner: tournamentWinner ? serializePlayer(tournamentWinner, lang) : null,
    });
  }),
);

const listQuery = pagination(12).extend({
  lang: z.enum(['en', 'ar']).default('en'),
  search: z.string().max(100).optional(),
});

playersRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const { page, per_page: perPage, lang, search } = parseQuery(listQuery, req);

    const filter: Record<string, unknown> = {};
    if (search?.trim()) {
      const pattern = new RegExp(escapeRegex(search.trim()), 'i');
      filter.$or = [{ nameEn: pattern }, { nameAr: pattern }];
    }

    // Descending rating puts unrated players (null) last, which is what the
    // catalogue wants. Counting and fetching in parallel halves the latency.
    const [players, total] = await Promise.all([
      Player.find(filter)
        .sort({ rating: -1, nameEn: 1 })
        .skip((page - 1) * perPage)
        .limit(perPage),
      Player.countDocuments(filter),
    ]);

    res.json({
      players: players.map((player) => serializePlayer(player, lang)),
      ...paginationMeta({ page, perPage, total }),
    });
  }),
);

playersRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = objectId.parse(req.params.id);
    const { lang } = parseQuery(langQuery, req);

    const player = await Player.findById(id);
    if (!player) throw HttpError.notFound('Player not found');

    res.json(serializePlayer(player, lang));
  }),
);

// ------------------------------------------------------------------- admin

playersRouter.post(
  '/',
  requireAdmin,
  writeLimiter,
  asyncHandler(async (req, res) => {
    const body = parseBody(playerBody, req);
    const player = await Player.create({
      ...toAttrs(body),
      isPlayerOfMonth: body.is_player_of_month ?? false,
      isTournamentWinner: body.is_tournament_winner ?? false,
    });

    if (player.isPlayerOfMonth) await makeExclusive('isPlayerOfMonth', String(player._id));
    if (player.isTournamentWinner) await makeExclusive('isTournamentWinner', String(player._id));

    res.status(201).json(serializePlayer(player, normalizeLang(req.query.lang)));
  }),
);

playersRouter.put(
  '/:id',
  requireAdmin,
  writeLimiter,
  asyncHandler(async (req, res) => {
    const id = objectId.parse(req.params.id);
    const body = parseBody(playerBody.partial(), req);

    const player = await Player.findById(id);
    if (!player) throw HttpError.notFound('Player not found');

    player.set(toAttrs(body));
    if (body.is_player_of_month !== undefined) player.isPlayerOfMonth = body.is_player_of_month;
    if (body.is_tournament_winner !== undefined) {
      player.isTournamentWinner = body.is_tournament_winner;
    }
    await player.save();

    if (player.isPlayerOfMonth) await makeExclusive('isPlayerOfMonth', id);
    if (player.isTournamentWinner) await makeExclusive('isTournamentWinner', id);

    res.json(serializePlayer(player, normalizeLang(req.query.lang)));
  }),
);

playersRouter.delete(
  '/:id',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const id = objectId.parse(req.params.id);

    const player = await Player.findById(id);
    if (!player) throw HttpError.notFound('Player not found');

    // Break any account link first, so no user is left pointing at a profile
    // that no longer exists.
    await User.updateMany({ linkedPlayerId: id }, { $set: { linkedPlayerId: null } });
    await player.deleteOne();

    res.json({ message: 'Player deleted' });
  }),
);
