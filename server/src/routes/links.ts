import { Router } from 'express';
import { z } from 'zod';
import { LinkRequest, Player, User } from '../models/index.js';
import { asyncHandler } from '../lib/async-handler.js';
import { HttpError } from '../lib/http-error.js';
import { langQuery, objectId, pagination, parseBody, parseQuery } from '../lib/validate.js';
import {
  normalizeLang,
  paginationMeta,
  serializePlayer,
  serializeUser,
  serializeUserPrivate,
  type Lang,
} from '../lib/serializers.js';
import { escapeRegex, trimToNull } from '../lib/sanitize.js';
import { currentAdmin, currentUser, requireAdmin, requireUser } from '../middleware/auth.js';
import { linkRequestLimiter } from '../middleware/rate-limit.js';
import { notifyUser } from '../realtime/publish.js';

export const linksRouter: Router = Router();

function serializeLinkRequest(
  request: {
    _id: unknown;
    userId: unknown;
    playerId: unknown;
    message?: string | null;
    status: string;
    adminNote?: string | null;
    reviewedAt?: Date | null;
    createdAt?: Date;
  },
  lang: Lang,
) {
  const user = request.userId as unknown;
  const player = request.playerId as unknown;
  const isDoc = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && '_id' in value && Object.keys(value).length > 1;

  return {
    id: String(request._id),
    user_id: isDoc(user) ? String(user._id) : String(user),
    user: isDoc(user) ? serializeUser(user as never) : null,
    player_id: isDoc(player) ? String(player._id) : String(player),
    player: isDoc(player) ? serializePlayer(player as never, lang) : null,
    message: request.message ?? null,
    status: request.status,
    admin_note: request.adminNote ?? null,
    reviewed_at: request.reviewedAt ? new Date(request.reviewedAt).toISOString() : null,
    created_at: request.createdAt ? new Date(request.createdAt).toISOString() : null,
  };
}

// -------------------------------------------------------------------- user

const requestSchema = z.object({
  player_id: objectId,
  message: z.string().max(1000).optional(),
});

linksRouter.post(
  '/request',
  requireUser,
  linkRequestLimiter,
  asyncHandler(async (req, res) => {
    const { player_id: playerId, message } = parseBody(requestSchema, req);
    const user = currentUser(req);

    if (user.linkedPlayerId) throw HttpError.badRequest('Your account is already linked to a profile');

    const player = await Player.findById(playerId);
    if (!player) throw HttpError.notFound('Player not found');

    if (await User.exists({ linkedPlayerId: playerId })) {
      throw HttpError.conflict('That profile is already linked to another account');
    }

    try {
      const request = await LinkRequest.create({
        userId: user._id,
        playerId,
        message: trimToNull(message, 1000),
        status: 'pending',
      });
      await request.populate('playerId');
      res.status(201).json(serializeLinkRequest(request, normalizeLang(req.query.lang)));
    } catch (error) {
      // The unique partial index is what actually enforces one open request
      // per user, so two simultaneous submissions cannot both get through.
      if ((error as { code?: number }).code === 11000) {
        throw HttpError.conflict('You already have a pending link request');
      }
      throw error;
    }
  }),
);

linksRouter.get(
  '/my-requests',
  requireUser,
  asyncHandler(async (req, res) => {
    const { lang } = parseQuery(langQuery, req);
    const requests = await LinkRequest.find({ userId: currentUser(req)._id })
      .sort({ createdAt: -1 })
      .limit(50)
      .populate('playerId');

    res.json(requests.map((request) => serializeLinkRequest(request, lang)));
  }),
);

// --------------------------------------------------------- admin: requests

const adminListQuery = z.object({
  status: z.enum(['pending', 'approved', 'rejected', 'all']).default('all'),
  lang: z.enum(['en', 'ar']).default('en'),
});

linksRouter.get(
  '/admin/requests',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { status, lang } = parseQuery(adminListQuery, req);

    const requests = await LinkRequest.find(status === 'all' ? {} : { status })
      .sort({ createdAt: -1 })
      .limit(200)
      .populate('userId')
      .populate('playerId');

    res.json(requests.map((request) => serializeLinkRequest(request, lang)));
  }),
);

const reviewSchema = z.object({ admin_note: z.string().max(1000).optional() });

linksRouter.post(
  '/admin/requests/:id/approve',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const id = objectId.parse(req.params.id);
    const { admin_note: note } = parseBody(reviewSchema, req);
    const admin = currentAdmin(req);

    const request = await LinkRequest.findById(id);
    if (!request) throw HttpError.notFound('Request not found');
    if (request.status !== 'pending') throw HttpError.badRequest('That request has already been reviewed');

    // The link is what grants identity, so set it first and only record the
    // approval if the write succeeds. The unique index on linkedPlayerId means
    // a profile can never end up backing two accounts.
    const linked = await User.updateOne(
      { _id: request.userId, linkedPlayerId: null },
      { $set: { linkedPlayerId: request.playerId } },
    );

    if (linked.modifiedCount === 0) {
      const already = await User.findById(request.userId).select('linkedPlayerId');
      if (already?.linkedPlayerId) {
        throw HttpError.conflict('That account is already linked to a profile');
      }
      throw HttpError.conflict('Could not link that account');
    }

    request.status = 'approved';
    request.adminNote = trimToNull(note, 1000);
    request.reviewedByAdminId = admin._id;
    request.reviewedAt = new Date();
    await request.save();

    await request.populate('userId');
    await request.populate('playerId');

    notifyUser(String(request.userId), 'link:reviewed', { status: 'approved' });
    res.json(serializeLinkRequest(request, normalizeLang(req.query.lang)));
  }),
);

linksRouter.post(
  '/admin/requests/:id/reject',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const id = objectId.parse(req.params.id);
    const { admin_note: note } = parseBody(reviewSchema, req);

    const request = await LinkRequest.findById(id);
    if (!request) throw HttpError.notFound('Request not found');
    if (request.status !== 'pending') throw HttpError.badRequest('That request has already been reviewed');

    request.status = 'rejected';
    request.adminNote = trimToNull(note, 1000);
    request.reviewedByAdminId = currentAdmin(req)._id;
    request.reviewedAt = new Date();
    await request.save();

    await request.populate('userId');
    await request.populate('playerId');

    notifyUser(String(request.userId), 'link:reviewed', { status: 'rejected' });
    res.json(serializeLinkRequest(request, normalizeLang(req.query.lang)));
  }),
);

// ------------------------------------------------------------ admin: users

const usersQuery = pagination(25).extend({
  status: z.enum(['all', 'active', 'banned', 'unverified']).default('all'),
  search: z.string().max(100).optional(),
});

linksRouter.get(
  '/admin/users',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { page, per_page: perPage, status, search } = parseQuery(usersQuery, req);

    const filter: Record<string, unknown> = {};
    if (status === 'banned') filter.isBanned = true;
    if (status === 'active') Object.assign(filter, { isBanned: false, isVerified: true });
    if (status === 'unverified') filter.isVerified = false;

    if (search?.trim()) {
      const pattern = new RegExp(escapeRegex(search.trim()), 'i');
      filter.$or = [{ username: pattern }, { email: pattern }, { displayName: pattern }];
    }

    const [users, total] = await Promise.all([
      User.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * perPage)
        .limit(perPage)
        .populate('linkedPlayerId', 'nameEn title'),
      User.countDocuments(filter),
    ]);

    res.json({
      users: users.map(serializeUserPrivate),
      ...paginationMeta({ page, perPage, total }),
    });
  }),
);

/** Apply a moderation change and return the updated account. */
async function moderate(userId: string, update: Record<string, unknown>) {
  const user = await User.findByIdAndUpdate(userId, update, { returnDocument: 'after' }).populate(
    'linkedPlayerId',
    'nameEn title',
  );
  if (!user) throw HttpError.notFound('Player not found');
  return user;
}

const banSchema = z.object({ reason: z.string().max(1000).optional() });

linksRouter.post(
  '/admin/users/:id/ban',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const id = objectId.parse(req.params.id);
    const { reason } = parseBody(banSchema, req);

    const user = await moderate(id, {
      $set: { isBanned: true, bannedAt: new Date(), banReason: trimToNull(reason, 1000) },
    });

    notifyUser(id, 'account:banned', { reason: user.banReason });
    res.json(serializeUserPrivate(user));
  }),
);

linksRouter.post(
  '/admin/users/:id/unban',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const id = objectId.parse(req.params.id);
    const user = await moderate(id, {
      $set: { isBanned: false, bannedAt: null, banReason: null },
    });
    res.json(serializeUserPrivate(user));
  }),
);

linksRouter.post(
  '/admin/users/:id/verify',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const id = objectId.parse(req.params.id);
    const user = await moderate(id, {
      $set: { isVerified: true, otpCodeHash: null, otpExpiresAt: null, otpAttempts: 0 },
    });
    res.json(serializeUserPrivate(user));
  }),
);

linksRouter.post(
  '/admin/users/:id/mute',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const id = objectId.parse(req.params.id);
    res.json(serializeUserPrivate(await moderate(id, { $set: { chatMuted: true } })));
  }),
);

linksRouter.post(
  '/admin/users/:id/unmute',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const id = objectId.parse(req.params.id);
    res.json(serializeUserPrivate(await moderate(id, { $set: { chatMuted: false } })));
  }),
);

linksRouter.post(
  '/admin/users/:id/unlink',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const id = objectId.parse(req.params.id);
    res.json(serializeUserPrivate(await moderate(id, { $set: { linkedPlayerId: null } })));
  }),
);
