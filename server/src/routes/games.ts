import { Router } from 'express';
import { z } from 'zod';
import { BlockedUser, FINISHED_STATUSES, Game, GameMessage, User } from '../models/index.js';
import { asyncHandler } from '../lib/async-handler.js';
import { HttpError } from '../lib/http-error.js';
import { objectId, parseBody, parseQuery } from '../lib/validate.js';
import { serializeGame, serializeGameMessage, serializeUser } from '../lib/serializers.js';
import { IllegalMoveError, playMove, turnFromFen } from '../lib/chess.js';
import { sanitizeChat } from '../lib/sanitize.js';
import { currentUser, optionalUser, requireUser } from '../middleware/auth.js';
import { chatLimiter, moveLimiter, writeLimiter } from '../middleware/rate-limit.js';
import {
  consumeClock,
  enforceClock,
  finishGame,
  isFinished,
  sideOf,
} from '../services/game-service.js';
import { publishGame, publishGameMessage } from '../realtime/publish.js';

export const gamesRouter: Router = Router();

const PLAYER_FIELDS = 'username displayName avatarUrl country onlineRating gamesPlayed gamesWon gamesLost gamesDrawn linkedPlayerId isBanned createdAt';

/** Populating both sides keeps a list of games to one query, not one per row. */
function withPlayers<Q extends { populate: (path: string, select: string) => Q }>(query: Q): Q {
  return query
    .populate('whiteUserId', PLAYER_FIELDS)
    .populate('blackUserId', PLAYER_FIELDS)
    .populate('creatorUserId', PLAYER_FIELDS);
}

async function loadGame(id: string) {
  const game = await withPlayers(Game.findById(id));
  if (!game) throw HttpError.notFound('Game not found');
  return game;
}

/** Re-read with both sides populated, for a response after a write. */
async function reload(id: string) {
  return loadGame(id);
}

// ------------------------------------------------------------------ public

const lobbyQuery = z.object({
  rated: z.enum(['all', 'true', 'false', '1', '0', 'yes', 'no']).default('all'),
  color: z.enum(['any', 'white', 'black', 'random']).default('any'),
  min_tc: z.coerce.number().int().min(0).default(0),
  max_tc: z.coerce.number().int().min(0).default(0),
  viewer_rating: z.coerce.number().int().min(0).default(0),
});

gamesRouter.get(
  '/lobby',
  asyncHandler(async (req, res) => {
    const query = parseQuery(lobbyQuery, req);

    const filter: Record<string, unknown> = { status: 'open' };
    if (['true', '1', 'yes'].includes(query.rated)) filter.rated = true;
    if (['false', '0', 'no'].includes(query.rated)) filter.rated = false;
    if (query.color !== 'any') filter.creatorColor = query.color;

    if (query.min_tc > 0 || query.max_tc > 0) {
      const range: Record<string, number> = {};
      if (query.min_tc > 0) range.$gte = query.min_tc;
      if (query.max_tc > 0) range.$lte = query.max_tc;
      filter.timeControlSeconds = range;
    }

    // Hide challenges the viewer's rating excludes them from, in the query
    // rather than by filtering the page after the fact — otherwise a page of
    // 50 could come back with two visible rows.
    if (query.viewer_rating > 0) {
      filter.$and = [
        { $or: [{ minOppRating: null }, { minOppRating: { $lte: query.viewer_rating } }] },
        { $or: [{ maxOppRating: null }, { maxOppRating: { $gte: query.viewer_rating } }] },
      ];
    }

    const games = await withPlayers(Game.find(filter)).sort({ createdAt: -1 }).limit(50);
    res.json(games.map(serializeGame));
  }),
);

gamesRouter.get(
  '/recent',
  asyncHandler(async (_req, res) => {
    const games = await withPlayers(Game.find({ status: { $in: FINISHED_STATUSES } }))
      .sort({ endedAt: -1 })
      .limit(20);
    res.json(games.map(serializeGame));
  }),
);

const liveQuery = z.object({
  min_rating: z.coerce.number().int().min(0).default(0),
  max_rating: z.coerce.number().int().min(0).default(0),
});

gamesRouter.get(
  '/live',
  asyncHandler(async (req, res) => {
    const { min_rating: minRating, max_rating: maxRating } = parseQuery(liveQuery, req);

    const games = await withPlayers(Game.find({ status: 'active' }))
      .sort({ lastMoveAt: -1 })
      .limit(100);

    const inRange = games.filter((game) => {
      const white = (game.whiteUserId as unknown as { onlineRating?: number })?.onlineRating ?? 0;
      const black = (game.blackUserId as unknown as { onlineRating?: number })?.onlineRating ?? 0;
      if (minRating && Math.max(white, black) < minRating) return false;
      if (maxRating && Math.min(white, black) > maxRating) return false;
      return true;
    });

    res.json(inRange.map(serializeGame));
  }),
);

gamesRouter.get(
  '/leaderboard',
  asyncHandler(async (_req, res) => {
    const players = await User.find({ isVerified: true, isBanned: false, gamesPlayed: { $gt: 0 } })
      .sort({ onlineRating: -1 })
      .limit(50)
      .populate('linkedPlayerId', 'nameEn title');

    res.json(players.map(serializeUser));
  }),
);

/**
 * A single game. Open to spectators, including anonymous ones.
 *
 * The clock is enforced here, so an abandoned game resolves as soon as anyone
 * looks at it rather than sitting active forever.
 */
gamesRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = objectId.parse(req.params.id);
    const game = await loadGame(id);

    const flagged = await enforceClock(game);
    if (flagged) {
      const fresh = await reload(id);
      publishGame(fresh);
      res.json(serializeGame(fresh));
      return;
    }

    res.json(serializeGame(game));
  }),
);

// ------------------------------------------------------------- challenges

const createSchema = z.object({
  color: z.enum(['white', 'black', 'random']).default('random'),
  rated: z.boolean().default(true),
  time_control_seconds: z.coerce.number().int().min(0).max(3 * 60 * 60).default(0),
  increment_seconds: z.coerce.number().int().min(0).max(180).default(0),
  min_opp_rating: z.coerce.number().int().min(0).max(4000).nullish(),
  max_opp_rating: z.coerce.number().int().min(0).max(4000).nullish(),
});

gamesRouter.post(
  '/',
  requireUser,
  writeLimiter,
  asyncHandler(async (req, res) => {
    const body = parseBody(createSchema, req);
    const user = currentUser(req);

    let min = body.min_opp_rating ?? null;
    let max = body.max_opp_rating ?? null;
    if (min !== null && max !== null && min > max) [min, max] = [max, min];

    // One open challenge per player. The old API silently returned the
    // existing one with a 200, so a player who changed the time control just
    // got their stale challenge back with no indication why.
    const existing = await Game.findOne({ creatorUserId: user._id, status: 'open' });
    if (existing) {
      throw HttpError.conflict(
        'You already have an open challenge. Cancel it before posting another.',
        { game_id: String(existing._id) },
      );
    }

    const game = await Game.create({
      creatorUserId: user._id,
      creatorColor: body.color,
      rated: body.rated,
      timeControlSeconds: body.time_control_seconds,
      incrementSeconds: body.increment_seconds,
      minOppRating: min,
      maxOppRating: max,
      status: 'open',
      // Fix the creator's side now when they chose one, so the lobby can show it.
      whiteUserId: body.color === 'white' ? user._id : null,
      blackUserId: body.color === 'black' ? user._id : null,
    });

    const created = await reload(String(game._id));
    publishGame(created, 'lobby');
    res.status(201).json(serializeGame(created));
  }),
);

gamesRouter.post(
  '/:id/cancel',
  requireUser,
  asyncHandler(async (req, res) => {
    const id = objectId.parse(req.params.id);
    const user = currentUser(req);

    const cancelled = await Game.findOneAndUpdate(
      { _id: id, status: 'open', creatorUserId: user._id },
      { $set: { status: 'aborted', endedAt: new Date() }, $inc: { version: 1 } },
      { returnDocument: 'after' },
    );
    if (!cancelled) throw HttpError.badRequest('That challenge is no longer open');

    const game = await reload(id);
    publishGame(game, 'lobby');
    res.json(serializeGame(game));
  }),
);

gamesRouter.post(
  '/:id/accept',
  requireUser,
  writeLimiter,
  asyncHandler(async (req, res) => {
    const id = objectId.parse(req.params.id);
    const user = currentUser(req);

    const challenge = await Game.findById(id);
    if (!challenge || challenge.status !== 'open') {
      throw HttpError.badRequest('That challenge is no longer open');
    }
    if (String(challenge.creatorUserId) === String(user._id)) {
      throw HttpError.badRequest('You cannot accept your own challenge');
    }
    if (challenge.minOppRating != null && user.onlineRating < challenge.minOppRating) {
      throw HttpError.forbidden(`This challenge is for players rated ${challenge.minOppRating}+`);
    }
    if (challenge.maxOppRating != null && user.onlineRating > challenge.maxOppRating) {
      throw HttpError.forbidden(`This challenge is for players rated up to ${challenge.maxOppRating}`);
    }

    const blocked = await BlockedUser.exists({
      $or: [
        { blockerId: challenge.creatorUserId, blockedId: user._id },
        { blockerId: user._id, blockedId: challenge.creatorUserId },
      ],
    });
    if (blocked) throw HttpError.forbidden('You cannot play against this player');

    const creatorIsWhite =
      challenge.creatorColor === 'white' ||
      (challenge.creatorColor === 'random' && Math.random() < 0.5);

    const now = new Date();
    const budget = challenge.timeControlSeconds * 1000;

    // Guarded on `open`, so two players hitting Accept at the same instant
    // cannot both join: the second update matches nothing.
    const started = await Game.findOneAndUpdate(
      { _id: id, status: 'open' },
      {
        $set: {
          status: 'active',
          whiteUserId: creatorIsWhite ? challenge.creatorUserId : user._id,
          blackUserId: creatorIsWhite ? user._id : challenge.creatorUserId,
          startedAt: now,
          lastMoveAt: now,
          whiteTimeMs: challenge.timeControlSeconds ? budget : null,
          blackTimeMs: challenge.timeControlSeconds ? budget : null,
        },
        $inc: { version: 1 },
      },
      { returnDocument: 'after' },
    );
    if (!started) throw HttpError.conflict('Someone else just accepted that challenge');

    const game = await reload(id);
    publishGame(game, 'lobby');
    res.json(serializeGame(game));
  }),
);

// ------------------------------------------------------------------- moves

const moveSchema = z.object({
  move: z.string().trim().min(4).max(5),
});

gamesRouter.post(
  '/:id/move',
  requireUser,
  moveLimiter,
  asyncHandler(async (req, res) => {
    const id = objectId.parse(req.params.id);
    const { move: uci } = parseBody(moveSchema, req);
    const user = currentUser(req);

    const game = await Game.findById(id);
    if (!game) throw HttpError.notFound('Game not found');
    if (game.status !== 'active') throw HttpError.badRequest('This game is not in progress');

    const side = sideOf(game, String(user._id));
    if (!side) throw HttpError.forbidden('You are not playing in this game');

    // Check the clock first: a player whose flag has already fallen does not
    // get to save themselves by moving.
    const flagged = await enforceClock(game);
    if (flagged) {
      const fresh = await reload(id);
      publishGame(fresh);
      res.json(serializeGame(fresh));
      return;
    }

    if (turnFromFen(game.fen) !== side) throw HttpError.badRequest('It is not your turn');

    let next;
    try {
      // Validated against the replayed move list, never against the stored FEN.
      next = playMove(game.moves, uci);
    } catch (error) {
      if (error instanceof IllegalMoveError) throw HttpError.badRequest(error.message);
      throw error;
    }

    const clocks = consumeClock(game);

    // The version guard is the concurrency control: if anything changed
    // between the read above and this write, the update matches nothing and
    // the move is rejected instead of being applied to a stale position.
    const applied = await Game.findOneAndUpdate(
      { _id: id, status: 'active', version: game.version },
      {
        $set: {
          moves: next.moves,
          fen: next.fen,
          pgn: next.pgn,
          moveCount: next.moveCount,
          lastMoveAt: new Date(),
          drawOfferBy: null,
          ...(clocks ?? {}),
        },
        $inc: { version: 1 },
      },
      { returnDocument: 'after' },
    );
    if (!applied) throw HttpError.conflict('The game moved on; refresh and try again');

    if (next.outcome) {
      await finishGame(id, next.outcome.result, next.outcome.termination);
    }

    const fresh = await reload(id);
    publishGame(fresh, undefined, { san: next.san, uci: next.uci });
    res.json(serializeGame(fresh));
  }),
);

// ----------------------------------------------------------- game controls

/** Load a game the caller is actually playing in, and require it to be live. */
async function activeGameFor(req: Parameters<typeof currentUser>[0], id: string) {
  const user = currentUser(req);
  const game = await Game.findById(id);
  if (!game) throw HttpError.notFound('Game not found');

  const side = sideOf(game, String(user._id));
  if (!side) throw HttpError.forbidden('You are not playing in this game');
  if (game.status !== 'active') throw HttpError.badRequest('This game is not in progress');

  return { game, side, user };
}

gamesRouter.post(
  '/:id/resign',
  requireUser,
  asyncHandler(async (req, res) => {
    const id = objectId.parse(req.params.id);
    const { side } = await activeGameFor(req, id);

    await finishGame(id, side === 'white' ? '0-1' : '1-0', 'resignation');

    const game = await reload(id);
    publishGame(game);
    res.json(serializeGame(game));
  }),
);

gamesRouter.post(
  '/:id/claim-time',
  requireUser,
  asyncHandler(async (req, res) => {
    const id = objectId.parse(req.params.id);
    const { game } = await activeGameFor(req, id);

    const flagged = await enforceClock(game);
    if (!flagged) throw HttpError.badRequest('Your opponent still has time on the clock');

    const fresh = await reload(id);
    publishGame(fresh);
    res.json(serializeGame(fresh));
  }),
);

gamesRouter.post(
  '/:id/draw-offer',
  requireUser,
  asyncHandler(async (req, res) => {
    const id = objectId.parse(req.params.id);
    const { user } = await activeGameFor(req, id);

    // Bumping the version is what makes the offer visible to the opponent —
    // previously the version came from the move count alone, so an offer went
    // unnoticed until somebody played a move.
    await Game.updateOne(
      { _id: id, status: 'active' },
      { $set: { drawOfferBy: user._id }, $inc: { version: 1 } },
    );

    const game = await reload(id);
    publishGame(game);
    res.json(serializeGame(game));
  }),
);

gamesRouter.post(
  '/:id/draw-accept',
  requireUser,
  asyncHandler(async (req, res) => {
    const id = objectId.parse(req.params.id);
    const { game, user } = await activeGameFor(req, id);

    if (!game.drawOfferBy) throw HttpError.badRequest('There is no draw offer to accept');
    if (String(game.drawOfferBy) === String(user._id)) {
      throw HttpError.badRequest('You cannot accept your own draw offer');
    }

    await finishGame(id, '1/2-1/2', 'agreement');

    const fresh = await reload(id);
    publishGame(fresh);
    res.json(serializeGame(fresh));
  }),
);

gamesRouter.post(
  '/:id/draw-decline',
  requireUser,
  asyncHandler(async (req, res) => {
    const id = objectId.parse(req.params.id);
    await activeGameFor(req, id);

    await Game.updateOne(
      { _id: id, status: 'active' },
      { $set: { drawOfferBy: null }, $inc: { version: 1 } },
    );

    const game = await reload(id);
    publishGame(game);
    res.json(serializeGame(game));
  }),
);

// --------------------------------------------------------------- my games

const myGamesQuery = z.object({
  status: z.enum(['active', 'finished', 'all']).default('all'),
});

gamesRouter.get(
  '/me/games',
  requireUser,
  asyncHandler(async (req, res) => {
    const { status } = parseQuery(myGamesQuery, req);
    const user = currentUser(req);

    const filter: Record<string, unknown> = {
      $or: [{ whiteUserId: user._id }, { blackUserId: user._id }, { creatorUserId: user._id }],
    };
    if (status === 'active') filter.status = { $in: ['open', 'active'] };
    if (status === 'finished') filter.status = { $in: [...FINISHED_STATUSES, 'aborted'] };

    const games = await withPlayers(Game.find(filter)).sort({ createdAt: -1 }).limit(50);
    res.json(games.map(serializeGame));
  }),
);

export { isFinished };

// -------------------------------------------------------------- game chat

const CHAT_MAX = 500;

gamesRouter.get(
  '/:id/chat',
  optionalUser,
  asyncHandler(async (req, res) => {
    const id = objectId.parse(req.params.id);

    const exists = await Game.exists({ _id: id });
    if (!exists) throw HttpError.notFound('Game not found');

    const messages = await GameMessage.find({ gameId: id })
      .sort({ createdAt: 1 })
      .limit(200)
      .populate('userId', 'username displayName');

    res.json(messages.map(serializeGameMessage));
  }),
);

const chatSchema = z.object({
  content: z.string().min(1, 'Message is empty').max(2000),
});

gamesRouter.post(
  '/:id/chat',
  requireUser,
  chatLimiter,
  asyncHandler(async (req, res) => {
    const id = objectId.parse(req.params.id);
    const { content } = parseBody(chatSchema, req);
    const user = currentUser(req);

    const game = await Game.findById(id);
    if (!game) throw HttpError.notFound('Game not found');
    if (game.chatDisabled) throw HttpError.forbidden('Chat is disabled for this game');
    if (user.chatMuted) throw HttpError.forbidden('You are muted from chat');
    if (!sideOf(game, String(user._id))) {
      throw HttpError.forbidden('Only the players can chat in this game');
    }

    // Links are stripped before truncation, so replacing one can never push the
    // message back over the limit.
    const clean = sanitizeChat(content, CHAT_MAX);
    if (!clean) throw HttpError.badRequest('Message is empty');

    const message = await GameMessage.create({ gameId: id, userId: user._id, content: clean });
    await message.populate('userId', 'username displayName');

    const payload = serializeGameMessage(message);
    publishGameMessage(id, payload);
    res.status(201).json(payload);
  }),
);
