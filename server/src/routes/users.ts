import { Router } from 'express';
import { z } from 'zod';
import { FINISHED_STATUSES, Game, USERNAME_COLLATION, User, type UserDoc } from '../models/index.js';
import { asyncHandler } from '../lib/async-handler.js';
import { HttpError } from '../lib/http-error.js';
import { pagination, parseQuery } from '../lib/validate.js';
import { paginationMeta, serializeGame, serializeUser } from '../lib/serializers.js';
import { escapeRegex } from '../lib/sanitize.js';
import { optionalUser } from '../middleware/auth.js';
import { searchLimiter } from '../middleware/rate-limit.js';
import { isOnline } from '../realtime/publish.js';
import { hasBlocked } from '../services/blocks.js';
import { withPlayers } from '../services/game-service.js';

/**
 * Public player profiles, mounted at /api/users.
 *
 * Everything here is what the leaderboard and any game page already show; no
 * email, no settings. The signed-in viewer additionally learns their own
 * relationship to the profile (blocked, can message) so the page can offer the
 * right buttons.
 */
export const usersRouter: Router = Router();

/** Accounts that exist publicly: verified, not banned, not deleted. */
const VISIBLE = { isVerified: true, isBanned: false, deletedAt: null } as const;

async function findVisible(username: string): Promise<UserDoc> {
  const user = await User.findOne({ username, ...VISIBLE })
    .collation(USERNAME_COLLATION)
    .populate('linkedPlayerId', 'nameEn nameAr title imageUrl');
  if (!user) throw HttpError.notFound('Player not found');
  return user;
}

const usernameParam = z.string().trim().min(1).max(40);

const searchQuery = z.object({
  search: z.string().trim().max(40).default(''),
  limit: z.coerce.number().int().min(1).max(20).default(10),
});

/** Find players by username or display name, for "new message" and "challenge". */
usersRouter.get(
  '/',
  searchLimiter,
  asyncHandler(async (req, res) => {
    const { search, limit } = parseQuery(searchQuery, req);
    if (!search) {
      res.json([]);
      return;
    }

    const prefix = new RegExp(`^${escapeRegex(search)}`, 'i');
    const users = await User.find({ ...VISIBLE, $or: [{ username: prefix }, { displayName: prefix }] })
      .sort({ gamesPlayed: -1 })
      .limit(limit);

    res.json(users.map((user) => ({ ...serializeUser(user), online: isOnline(String(user._id)) })));
  }),
);

usersRouter.get(
  '/:username',
  optionalUser,
  asyncHandler(async (req, res) => {
    const user = await findVisible(usernameParam.parse(req.params.username));
    const viewer = req.currentUser;
    const isMe = Boolean(viewer && String(viewer._id) === String(user._id));

    const played = { status: { $in: FINISHED_STATUSES } };
    const [recent, active] = await Promise.all([
      withPlayers(
        Game.find({ ...played, $or: [{ whiteUserId: user._id }, { blackUserId: user._id }] }),
      )
        .sort({ endedAt: -1 })
        .limit(10),
      withPlayers(
        Game.find({ status: 'active', $or: [{ whiteUserId: user._id }, { blackUserId: user._id }] }),
      )
        .sort({ lastMoveAt: -1 })
        .limit(5),
    ]);

    let relationship = null;
    if (viewer && !isMe) {
      const [blockedByMe, blockedMe] = await Promise.all([
        hasBlocked(viewer._id, user._id),
        hasBlocked(user._id, viewer._id),
      ]);
      relationship = {
        blocked_by_me: blockedByMe,
        can_message: !blockedByMe && !blockedMe && user.notifDm,
        can_challenge: !blockedByMe && !blockedMe,
      };
    }

    const linked = user.linkedPlayerId as unknown as {
      _id: unknown;
      nameEn: string;
      nameAr: string;
      title: string | null;
      imageUrl: string | null;
    } | null;

    res.json({
      user: serializeUser(user),
      online: isOnline(String(user._id)),
      is_me: isMe,
      relationship,
      linked_player:
        linked && typeof linked === 'object' && 'nameEn' in linked
          ? {
              id: String(linked._id),
              name_en: linked.nameEn,
              name_ar: linked.nameAr,
              title: linked.title,
              image_url: linked.imageUrl,
            }
          : null,
      recent_games: recent.map(serializeGame),
      active_games: active.map(serializeGame),
    });
  }),
);

const gamesQuery = pagination(20, 50);

usersRouter.get(
  '/:username/games',
  asyncHandler(async (req, res) => {
    const user = await findVisible(usernameParam.parse(req.params.username));
    const { page, per_page: perPage } = parseQuery(gamesQuery, req);

    const filter = {
      status: { $in: FINISHED_STATUSES },
      $or: [{ whiteUserId: user._id }, { blackUserId: user._id }],
    };
    const [games, total] = await Promise.all([
      withPlayers(Game.find(filter))
        .sort({ endedAt: -1 })
        .skip((page - 1) * perPage)
        .limit(perPage),
      Game.countDocuments(filter),
    ]);

    res.json({ games: games.map(serializeGame), ...paginationMeta({ page, perPage, total }) });
  }),
);

/**
 * Rating after each rated game, oldest first, for the profile chart. Voided
 * games are left out because their rating change was reversed.
 */
usersRouter.get(
  '/:username/rating-history',
  asyncHandler(async (req, res) => {
    const user = await findVisible(usernameParam.parse(req.params.username));

    const games = await Game.find({
      status: { $in: FINISHED_STATUSES },
      rated: true,
      voidedAt: null,
      ratingsApplied: true,
      $or: [{ whiteUserId: user._id }, { blackUserId: user._id }],
    })
      .sort({ endedAt: -1 })
      .limit(200)
      .select('whiteUserId whiteRatingAfter blackRatingAfter endedAt');

    const points = games
      .reverse()
      .map((game) => ({
        at: game.endedAt ? game.endedAt.toISOString() : null,
        rating:
          String(game.whiteUserId) === String(user._id) ? game.whiteRatingAfter : game.blackRatingAfter,
      }))
      .filter((point) => point.at && point.rating != null);

    res.json({ current: user.onlineRating, points });
  }),
);
