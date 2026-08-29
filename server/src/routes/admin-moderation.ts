import { Router } from 'express';
import { z } from 'zod';
import {
  DirectMessage,
  FINISHED_STATUSES,
  Game,
  GameMessage,
  LinkRequest,
  News,
  Player,
  User,
} from '../models/index.js';
import { asyncHandler } from '../lib/async-handler.js';
import { HttpError } from '../lib/http-error.js';
import { objectId, pagination, parseBody, parseQuery } from '../lib/validate.js';
import {
  paginationMeta,
  serializeDirectMessage,
  serializeGame,
  serializeGameMessage,
} from '../lib/serializers.js';
import { escapeRegex, trimToNull } from '../lib/sanitize.js';
import { currentAdmin, requireAdmin } from '../middleware/auth.js';
import { publishGame } from '../realtime/publish.js';

/** Mounted at /api/games/admin. */
export const adminGamesRouter: Router = Router();
/** Mounted at /api/messages/admin. */
export const adminMessagesRouter: Router = Router();

adminGamesRouter.use(requireAdmin);
adminMessagesRouter.use(requireAdmin);

const PLAYER_FIELDS = 'username displayName avatarUrl country onlineRating gamesPlayed isBanned';

// ------------------------------------------------------------------- stats

/**
 * Dashboard counters.
 *
 * Counted in the database. The dashboard used to fetch *every* news article
 * just to count how many were published, which grew linearly with the archive.
 */
adminGamesRouter.get(
  '/stats',
  asyncHandler(async (_req, res) => {
    const [players, news, publishedNews, featured, users, bannedUsers, unverified, openGames, activeGames, finishedGames, pendingLinks, gameMessages, directMessages] =
      await Promise.all([
        Player.countDocuments(),
        News.countDocuments(),
        News.countDocuments({ published: true }),
        News.countDocuments({ isFeatured: true }),
        User.countDocuments(),
        User.countDocuments({ isBanned: true }),
        User.countDocuments({ isVerified: false }),
        Game.countDocuments({ status: 'open' }),
        Game.countDocuments({ status: 'active' }),
        Game.countDocuments({ status: { $in: FINISHED_STATUSES } }),
        LinkRequest.countDocuments({ status: 'pending' }),
        GameMessage.countDocuments({ isDeleted: false }),
        DirectMessage.countDocuments({ isDeleted: false }),
      ]);

    res.json({
      players,
      news,
      published_news: publishedNews,
      draft_news: news - publishedNews,
      featured_news: featured,
      users,
      banned_users: bannedUsers,
      unverified_users: unverified,
      open_games: openGames,
      active_games: activeGames,
      finished_games: finishedGames,
      pending_link_requests: pendingLinks,
      game_messages: gameMessages,
      direct_messages: directMessages,
    });
  }),
);

// ------------------------------------------------------------------- games

const gamesQuery = pagination(25).extend({
  status: z.enum(['all', 'open', 'active', 'finished', 'voided']).default('all'),
  search: z.string().max(100).optional(),
});

adminGamesRouter.get(
  '/games',
  asyncHandler(async (req, res) => {
    const { page, per_page: perPage, status, search } = parseQuery(gamesQuery, req);

    const filter: Record<string, unknown> = {};
    if (status === 'open') filter.status = 'open';
    if (status === 'active') filter.status = 'active';
    if (status === 'finished') filter.status = { $in: FINISHED_STATUSES };
    if (status === 'voided') filter.voidedAt = { $ne: null };

    if (search?.trim()) {
      const pattern = new RegExp(escapeRegex(search.trim()), 'i');
      const ids = await User.find({ $or: [{ username: pattern }, { displayName: pattern }] })
        .select('_id')
        .limit(200);
      const userIds = ids.map((user) => user._id);
      filter.$or = [{ whiteUserId: { $in: userIds } }, { blackUserId: { $in: userIds } }];
    }

    const [games, total] = await Promise.all([
      Game.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * perPage)
        .limit(perPage)
        .populate('whiteUserId', PLAYER_FIELDS)
        .populate('blackUserId', PLAYER_FIELDS)
        .populate('creatorUserId', PLAYER_FIELDS),
      Game.countDocuments(filter),
    ]);

    res.json({
      games: games.map(serializeGame),
      ...paginationMeta({ page, perPage, total }),
    });
  }),
);

const reasonSchema = z.object({ reason: z.string().max(500).optional() });

/** Stop a game in progress. No rating change, because none was applied yet. */
adminGamesRouter.post(
  '/games/:id/abort',
  asyncHandler(async (req, res) => {
    const id = objectId.parse(req.params.id);
    const { reason } = parseBody(reasonSchema, req);

    const aborted = await Game.findOneAndUpdate(
      { _id: id, status: { $in: ['open', 'active'] } },
      {
        $set: {
          status: 'aborted',
          endedAt: new Date(),
          termination: 'abandoned',
          // Aborting is recorded on its own fields. The Flask version wrote
          // the abort into voided_by_admin_id, conflating two different acts.
          voidReason: trimToNull(reason, 500),
        },
        $inc: { version: 1 },
      },
      { returnDocument: 'after' },
    );
    if (!aborted) throw HttpError.badRequest('That game is already finished');

    const game = await Game.findById(id)
      .populate('whiteUserId', PLAYER_FIELDS)
      .populate('blackUserId', PLAYER_FIELDS);
    if (game) publishGame(game);

    res.json(serializeGame(aborted));
  }),
);

/** Void a finished game, reversing its rating and record effects. */
adminGamesRouter.post(
  '/games/:id/void',
  asyncHandler(async (req, res) => {
    const id = objectId.parse(req.params.id);
    const { reason } = parseBody(reasonSchema, req);
    const admin = currentAdmin(req);

    const game = await Game.findById(id);
    if (!game) throw HttpError.notFound('Game not found');
    if (!FINISHED_STATUSES.includes(game.status as (typeof FINISHED_STATUSES)[number])) {
      throw HttpError.badRequest('Only a finished game can be voided');
    }

    // Guarded on not-yet-voided, so a double click cannot reverse twice.
    const voided = await Game.findOneAndUpdate(
      { _id: id, voidedAt: null },
      {
        $set: {
          voidedAt: new Date(),
          voidedByAdminId: admin._id,
          voidReason: trimToNull(reason, 500),
          ratingsApplied: false,
        },
        $inc: { version: 1 },
      },
      { returnDocument: 'after' },
    );
    if (!voided) throw HttpError.badRequest('That game has already been voided');

    if (game.ratingsApplied && game.whiteUserId && game.blackUserId) {
      const whiteDelta = (game.whiteRatingAfter ?? 0) - (game.whiteRatingBefore ?? 0);
      const blackDelta = (game.blackRatingAfter ?? 0) - (game.blackRatingBefore ?? 0);
      const outcome = game.result;

      const field = (side: 'white' | 'black') => {
        if (outcome === '1/2-1/2') return 'gamesDrawn';
        const won = outcome === '1-0' ? 'white' : 'black';
        return side === won ? 'gamesWon' : 'gamesLost';
      };

      await Promise.all([
        User.updateOne(
          { _id: game.whiteUserId },
          { $inc: { onlineRating: -whiteDelta, gamesPlayed: -1, [field('white')]: -1 } },
        ),
        User.updateOne(
          { _id: game.blackUserId },
          { $inc: { onlineRating: -blackDelta, gamesPlayed: -1, [field('black')]: -1 } },
        ),
      ]);

      // Counters are unsigned in spirit; clamp in case of historical drift.
      await User.updateMany(
        { _id: { $in: [game.whiteUserId, game.blackUserId] }, gamesPlayed: { $lt: 0 } },
        { $set: { gamesPlayed: 0 } },
      );
    }

    res.json(serializeGame(voided));
  }),
);

adminGamesRouter.post(
  '/games/:id/chat-toggle',
  asyncHandler(async (req, res) => {
    const id = objectId.parse(req.params.id);

    const game = await Game.findById(id);
    if (!game) throw HttpError.notFound('Game not found');

    const updated = await Game.findByIdAndUpdate(
      id,
      { $set: { chatDisabled: !game.chatDisabled }, $inc: { version: 1 } },
      { returnDocument: 'after' },
    );
    if (updated) publishGame(updated);

    res.json(serializeGame(updated!));
  }),
);

// ----------------------------------------------------------- game messages

const messagesQuery = pagination(50).extend({
  only: z.enum(['all', 'active', 'deleted']).default('all'),
  search: z.string().max(100).optional(),
});

adminGamesRouter.get(
  '/messages',
  asyncHandler(async (req, res) => {
    const { page, per_page: perPage, only, search } = parseQuery(messagesQuery, req);

    const filter: Record<string, unknown> = {};
    if (only === 'active') filter.isDeleted = false;
    if (only === 'deleted') filter.isDeleted = true;
    if (search?.trim()) filter.content = new RegExp(escapeRegex(search.trim()), 'i');

    const [messages, total] = await Promise.all([
      GameMessage.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * perPage)
        .limit(perPage)
        .populate('userId', 'username displayName'),
      GameMessage.countDocuments(filter),
    ]);

    res.json({
      messages: messages.map(serializeGameMessage),
      ...paginationMeta({ page, perPage, total }),
    });
  }),
);

adminGamesRouter.delete(
  '/messages/:id',
  asyncHandler(async (req, res) => {
    const id = objectId.parse(req.params.id);

    const message = await GameMessage.findByIdAndUpdate(
      id,
      { $set: { isDeleted: true, deletedByAdminId: currentAdmin(req)._id } },
      { returnDocument: 'after' },
    ).populate('userId', 'username displayName');
    if (!message) throw HttpError.notFound('Message not found');

    res.json(serializeGameMessage(message));
  }),
);

// --------------------------------------------------------- direct messages

adminMessagesRouter.get(
  '/dms',
  asyncHandler(async (req, res) => {
    const { page, per_page: perPage, only, search } = parseQuery(messagesQuery, req);

    const filter: Record<string, unknown> = {};
    if (only === 'active') filter.isDeleted = false;
    if (only === 'deleted') filter.isDeleted = true;
    if (search?.trim()) filter.content = new RegExp(escapeRegex(search.trim()), 'i');

    const [messages, total] = await Promise.all([
      DirectMessage.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * perPage)
        .limit(perPage)
        .populate('senderId', 'username displayName')
        .populate('recipientId', 'username displayName'),
      DirectMessage.countDocuments(filter),
    ]);

    res.json({
      messages: messages.map((message) => serializeDirectMessage(message)),
      ...paginationMeta({ page, perPage, total }),
    });
  }),
);

adminMessagesRouter.delete(
  '/dms/:id',
  asyncHandler(async (req, res) => {
    const id = objectId.parse(req.params.id);

    const message = await DirectMessage.findByIdAndUpdate(
      id,
      { $set: { isDeleted: true, deletedByAdminId: currentAdmin(req)._id } },
      { returnDocument: 'after' },
    )
      .populate('senderId', 'username displayName')
      .populate('recipientId', 'username displayName');
    if (!message) throw HttpError.notFound('Message not found');

    res.json(serializeDirectMessage(message));
  }),
);
