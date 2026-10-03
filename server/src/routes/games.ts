import { randomInt } from 'node:crypto';
import { Router, type Request } from 'express';
import { z } from 'zod';
import { env } from '../config/env.js';
import {
  FINISHED_STATUSES,
  Game,
  GameMessage,
  User,
  type GameDoc,
  type UserDoc,
} from '../models/index.js';
import { asyncHandler } from '../lib/async-handler.js';
import { HttpError } from '../lib/http-error.js';
import { objectId, pagination, parseBody, parseQuery } from '../lib/validate.js';
import {
  paginationMeta,
  serializeGame,
  serializeGameMessage,
  serializeUser,
} from '../lib/serializers.js';
import {
  IllegalMoveError,
  buildPgnDocument,
  playMove,
  replayGame,
  turnFromFen,
} from '../lib/chess.js';
import { FREE_PLIES, clockAfterMove, deadlineFor } from '../lib/clock.js';
import { sanitizeChat } from '../lib/sanitize.js';
import { currentUser, optionalUser, requireUser } from '../middleware/auth.js';
import { chatLimiter, moveLimiter, offerLimiter, writeLimiter } from '../middleware/rate-limit.js';
import {
  abortGame,
  announce,
  enforceClock,
  finishGame,
  isFinished,
  loadGame,
  notifyChallengeClosed,
  refId,
  sideOf,
  withPlayers,
} from '../services/game-service.js';
import { blockedBetween } from '../services/blocks.js';
import { notifyUser, publishGameMessage } from '../realtime/publish.js';

export const gamesRouter: Router = Router();

/** Games that were actually played, as opposed to challenges that lapsed. */
const PLAYED_STATUSES = [...FINISHED_STATUSES];

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

    // Direct challenges are private invitations, never lobby entries.
    const filter: Record<string, unknown> = { status: 'open', direct: { $ne: true } };
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
    const games = await withPlayers(Game.find({ status: { $in: PLAYED_STATUSES } }))
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

const leaderboardQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

gamesRouter.get(
  '/leaderboard',
  asyncHandler(async (req, res) => {
    const { limit } = parseQuery(leaderboardQuery, req);
    const players = await User.find({
      isVerified: true,
      isBanned: false,
      deletedAt: null,
      gamesPlayed: { $gt: 0 },
    })
      .sort({ onlineRating: -1, gamesPlayed: -1 })
      .limit(limit)
      .populate('linkedPlayerId', 'nameEn title');

    res.json(players.map(serializeUser));
  }),
);

// ---------------------------------------------------------------- my games

const myGamesQuery = pagination(20, 50).extend({
  status: z.enum(['active', 'finished', 'all']).default('all'),
});

gamesRouter.get(
  '/me/games',
  requireUser,
  asyncHandler(async (req, res) => {
    const { status, page, per_page: perPage } = parseQuery(myGamesQuery, req);
    const user = currentUser(req);

    const filter: Record<string, unknown> = {
      $or: [{ whiteUserId: user._id }, { blackUserId: user._id }, { creatorUserId: user._id }],
    };
    if (status === 'active') filter.status = { $in: ['open', 'active'] };
    // Lapsed challenges were never games; "finished" lists what was played.
    if (status === 'finished') {
      filter.$and = [
        { status: { $in: [...PLAYED_STATUSES, 'aborted'] } },
        { startedAt: { $ne: null } },
      ];
    }

    const [games, total] = await Promise.all([
      withPlayers(Game.find(filter))
        .sort({ createdAt: -1 })
        .skip((page - 1) * perPage)
        .limit(perPage),
      Game.countDocuments(filter),
    ]);

    res.json({ games: games.map(serializeGame), ...paginationMeta({ page, perPage, total }) });
  }),
);

/** Open challenges addressed to me, and the ones I have out. */
gamesRouter.get(
  '/me/challenges',
  requireUser,
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const [incoming, outgoing] = await Promise.all([
      withPlayers(Game.find({ status: 'open', invitedUserId: user._id })).sort({ createdAt: -1 }),
      withPlayers(Game.find({ status: 'open', creatorUserId: user._id })).sort({ createdAt: -1 }),
    ]);
    res.json({ incoming: incoming.map(serializeGame), outgoing: outgoing.map(serializeGame) });
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

    if (await enforceClock(game)) {
      res.json(serializeGame(await announce(id, { lobby: true })));
      return;
    }

    res.json(serializeGame(game));
  }),
);

/** Download the game as a standard PGN file, for any chess GUI or database. */
gamesRouter.get(
  '/:id/pgn',
  asyncHandler(async (req, res) => {
    const id = objectId.parse(req.params.id);
    const game = await loadGame(id);
    if (!game.startedAt) throw HttpError.badRequest('This challenge was never played');

    const white = game.whiteUserId as unknown as UserDoc | null;
    const black = game.blackUserId as unknown as UserDoc | null;
    const finished = isFinished(game);

    const pgn = buildPgnDocument(
      {
        event: `Chess Hub ${game.rated ? 'rated' : 'casual'} game`,
        site: `${env.APP_URL.replace(/\/$/, '')}/play/${id}`,
        date: game.startedAt,
        white: white?.username ?? '?',
        black: black?.username ?? '?',
        result: finished ? (game.result ?? null) : null,
        whiteElo: finished ? game.whiteRatingBefore : white?.onlineRating,
        blackElo: finished ? game.blackRatingBefore : black?.onlineRating,
        timeControlSeconds: game.timeControlSeconds,
        incrementSeconds: game.incrementSeconds,
        termination: game.termination,
      },
      replayGame(game.moves).history(),
    );

    res
      .type('application/x-chess-pgn')
      .attachment(`chesshub-${id}.pgn`)
      .send(pgn);
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
  /** Challenge one player directly instead of posting to the lobby. */
  opponent_id: objectId.nullish(),
});

/** Someone who can currently be challenged. */
async function challengeableOpponent(me: UserDoc, opponentId: string): Promise<UserDoc> {
  if (opponentId === String(me._id)) throw HttpError.badRequest('You cannot challenge yourself');
  const opponent = await User.findById(opponentId);
  if (!opponent || opponent.deletedAt || !opponent.isVerified) {
    throw HttpError.notFound('Player not found');
  }
  if (opponent.isBanned) throw HttpError.forbidden('This player is unavailable');
  if (await blockedBetween(me._id, opponent._id)) {
    throw HttpError.forbidden('You cannot play against this player');
  }
  return opponent;
}

gamesRouter.post(
  '/',
  requireUser,
  writeLimiter,
  asyncHandler(async (req, res) => {
    const body = parseBody(createSchema, req);
    const user = currentUser(req);

    const opponent = body.opponent_id ? await challengeableOpponent(user, body.opponent_id) : null;

    let min = opponent ? null : (body.min_opp_rating ?? null);
    let max = opponent ? null : (body.max_opp_rating ?? null);
    if (min !== null && max !== null && min > max) [min, max] = [max, min];

    if (!opponent) {
      // One open lobby challenge per player. The old API silently returned
      // the existing one with a 200, so a player who changed the time control
      // just got their stale challenge back with no indication why.
      const existing = await Game.findOne({
        creatorUserId: user._id,
        status: 'open',
        direct: { $ne: true },
      });
      if (existing) {
        throw HttpError.conflict(
          'You already have an open challenge. Cancel it before posting another.',
          { game_id: String(existing._id) },
        );
      }
    }

    let game: GameDoc;
    try {
      game = await Game.create({
        creatorUserId: user._id,
        creatorColor: body.color,
        rated: body.rated,
        timeControlSeconds: body.time_control_seconds,
        incrementSeconds: body.increment_seconds,
        minOppRating: min,
        maxOppRating: max,
        invitedUserId: opponent?._id ?? null,
        direct: Boolean(opponent),
        status: 'open',
        // Fix the creator's side now when they chose one, so the lobby can show it.
        whiteUserId: body.color === 'white' ? user._id : null,
        blackUserId: body.color === 'black' ? user._id : null,
      });
    } catch (error) {
      if ((error as { code?: number }).code === 11000) {
        throw HttpError.conflict(
          opponent
            ? 'You already have a challenge waiting for this player.'
            : 'You already have an open challenge. Cancel it before posting another.',
        );
      }
      throw error;
    }

    const created = await announce(String(game._id), { lobby: true });
    const payload = serializeGame(created);
    if (opponent) notifyUser(String(opponent._id), 'challenge:received', payload);
    res.status(201).json(payload);
  }),
);

/** Can this player take this open challenge? Throws the reason if not. */
async function assertCanAccept(challenge: GameDoc, user: UserDoc): Promise<void> {
  if (challenge.status !== 'open') throw HttpError.badRequest('That challenge is no longer open');
  if (refId(challenge.creatorUserId) === String(user._id)) {
    throw HttpError.badRequest('You cannot accept your own challenge');
  }

  if (challenge.invitedUserId) {
    if (refId(challenge.invitedUserId) !== String(user._id)) {
      throw HttpError.forbidden('This challenge was sent to another player');
    }
  } else {
    if (challenge.minOppRating != null && user.onlineRating < challenge.minOppRating) {
      throw HttpError.forbidden(`This challenge is for players rated ${challenge.minOppRating}+`);
    }
    if (challenge.maxOppRating != null && user.onlineRating > challenge.maxOppRating) {
      throw HttpError.forbidden(`This challenge is for players rated up to ${challenge.maxOppRating}`);
    }
  }

  if (await blockedBetween(challenge.creatorUserId, user._id)) {
    throw HttpError.forbidden('You cannot play against this player');
  }
}

/**
 * Turn an open challenge into a live game.
 *
 * Guarded on `open`, so two players accepting at the same instant cannot both
 * join: the second update matches nothing and gets null back. Once a game is
 * on, both players' other lobby seeks are withdrawn — nobody should be paired
 * into a second game while already playing one.
 */
async function startChallenge(challenge: GameDoc, acceptor: UserDoc): Promise<GameDoc | null> {
  const creatorId = refId(challenge.creatorUserId) as string;
  const creatorIsWhite =
    challenge.creatorColor === 'white' || (challenge.creatorColor === 'random' && randomInt(2) === 0);

  const now = new Date();
  const budget = challenge.timeControlSeconds ? challenge.timeControlSeconds * 1000 : null;

  const started = await Game.findOneAndUpdate(
    { _id: challenge._id, status: 'open' },
    {
      $set: {
        status: 'active',
        whiteUserId: creatorIsWhite ? creatorId : acceptor._id,
        blackUserId: creatorIsWhite ? acceptor._id : creatorId,
        startedAt: now,
        lastMoveAt: now,
        whiteTimeMs: budget,
        blackTimeMs: budget,
        // White's first move is free, but it has to come.
        deadlineAt: new Date(now.getTime() + env.firstMoveTimeoutMs),
      },
      $inc: { version: 1 },
    },
    { returnDocument: 'after' },
  );
  if (!started) return null;

  const otherSeeks = await Game.find({
    _id: { $ne: challenge._id },
    status: 'open',
    direct: { $ne: true },
    creatorUserId: { $in: [creatorId, acceptor._id] },
  }).select('_id');
  for (const { _id } of otherSeeks) {
    if (await abortGame(String(_id), 'cancelled', { from: ['open'] })) {
      await announce(String(_id), { lobby: true });
    }
  }

  return started;
}

/** Announce a freshly started game, and call the challenger to the board. */
async function announceStart(gameId: string): Promise<GameDoc> {
  const game = await announce(gameId, { lobby: true });
  const payload = serializeGame(game);
  const creatorId = refId(game.creatorUserId);
  if (creatorId) notifyUser(creatorId, 'game:started', payload);
  return game;
}

gamesRouter.post(
  '/:id/accept',
  requireUser,
  writeLimiter,
  asyncHandler(async (req, res) => {
    const id = objectId.parse(req.params.id);
    const user = currentUser(req);

    const challenge = await Game.findById(id);
    if (!challenge) throw HttpError.notFound('Challenge not found');
    await assertCanAccept(challenge, user);

    const started = await startChallenge(challenge, user);
    if (!started) throw HttpError.conflict('Someone else just accepted that challenge');

    res.json(serializeGame(await announceStart(id)));
  }),
);

gamesRouter.post(
  '/:id/cancel',
  requireUser,
  asyncHandler(async (req, res) => {
    const id = objectId.parse(req.params.id);
    const user = currentUser(req);

    const cancelled = await abortGame(id, 'cancelled', {
      from: ['open'],
      where: { creatorUserId: user._id },
    });
    if (!cancelled) throw HttpError.badRequest('That challenge is no longer open');

    const game = await announce(id, { lobby: true });
    notifyChallengeClosed(game, String(user._id));
    res.json(serializeGame(game));
  }),
);

gamesRouter.post(
  '/:id/decline',
  requireUser,
  asyncHandler(async (req, res) => {
    const id = objectId.parse(req.params.id);
    const user = currentUser(req);

    const declined = await abortGame(id, 'declined', {
      from: ['open'],
      where: { invitedUserId: user._id },
    });
    if (!declined) throw HttpError.badRequest('That challenge is no longer open');

    const game = await announce(id);
    notifyChallengeClosed(game, String(user._id));
    res.json(serializeGame(game));
  }),
);

const quickSchema = z.object({
  time_control_seconds: z.coerce.number().int().min(0).max(3 * 60 * 60),
  increment_seconds: z.coerce.number().int().min(0).max(180).default(0),
  rated: z.boolean().default(true),
});

/**
 * Quick pairing: join the oldest compatible challenge for this time control,
 * or post one and wait.
 *
 * Done on the server so the search and the join are one step: a client that
 * listed the lobby and then accepted would lose most races for a popular time
 * control. Returns `matched: true` with a live game, or `matched: false` with
 * the caller's own open challenge.
 */
gamesRouter.post(
  '/quick',
  requireUser,
  writeLimiter,
  asyncHandler(async (req, res) => {
    const body = parseBody(quickSchema, req);
    const user = currentUser(req);

    const mine = await Game.findOne({ creatorUserId: user._id, status: 'open', direct: { $ne: true } });
    const sameSeek =
      mine &&
      mine.timeControlSeconds === body.time_control_seconds &&
      mine.incrementSeconds === body.increment_seconds &&
      mine.rated === body.rated;

    if (!sameSeek) {
      const candidates = await Game.find({
        status: 'open',
        direct: { $ne: true },
        creatorUserId: { $ne: user._id },
        timeControlSeconds: body.time_control_seconds,
        incrementSeconds: body.increment_seconds,
        rated: body.rated,
        $and: [
          { $or: [{ minOppRating: null }, { minOppRating: { $lte: user.onlineRating } }] },
          { $or: [{ maxOppRating: null }, { maxOppRating: { $gte: user.onlineRating } }] },
        ],
      })
        .sort({ createdAt: 1 })
        .limit(10);

      for (const candidate of candidates) {
        if (await blockedBetween(candidate.creatorUserId, user._id)) continue;
        if (await startChallenge(candidate, user)) {
          const game = await announceStart(String(candidate._id));
          res.json({ matched: true, game: serializeGame(game) });
          return;
        }
      }
    }

    // Nobody to play yet. Keep an identical seek; replace a different one.
    if (sameSeek) {
      res.json({ matched: false, game: serializeGame(await loadGame(String(mine._id))) });
      return;
    }
    if (mine && (await abortGame(String(mine._id), 'cancelled', { from: ['open'] }))) {
      await announce(String(mine._id), { lobby: true });
    }

    const game = await Game.create({
      creatorUserId: user._id,
      creatorColor: 'random',
      rated: body.rated,
      timeControlSeconds: body.time_control_seconds,
      incrementSeconds: body.increment_seconds,
      status: 'open',
    });
    const created = await announce(String(game._id), { lobby: true });
    res.status(201).json({ matched: false, game: serializeGame(created) });
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
    if (await enforceClock(game)) {
      res.json(serializeGame(await announce(id, { lobby: true })));
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

    const now = Date.now();
    const clocks = clockAfterMove(game, now);
    const deadlineAt = deadlineFor({
      status: 'active',
      fen: next.fen,
      moveCount: next.moveCount,
      timeControlSeconds: game.timeControlSeconds,
      incrementSeconds: game.incrementSeconds,
      whiteTimeMs: clocks?.whiteTimeMs ?? game.whiteTimeMs,
      blackTimeMs: clocks?.blackTimeMs ?? game.blackTimeMs,
      lastMoveAt: new Date(now),
    });

    // Moving answers an opponent's draw offer with a "no"; an offer the mover
    // made themselves stands until the opponent replies.
    const drawOfferBy = refId(game.drawOfferBy) === String(user._id) ? game.drawOfferBy : null;

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
          lastMoveAt: new Date(now),
          drawOfferBy,
          deadlineAt,
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

    const fresh = await announce(id, {
      lobby: Boolean(next.outcome),
      move: { san: next.san, uci: next.uci },
    });
    res.json(serializeGame(fresh));
  }),
);

// ----------------------------------------------------------- game controls

/** Load a game the caller is actually playing in, and require it to be live. */
async function activeGameFor(req: Request, id: string) {
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
    res.json(serializeGame(await announce(id, { lobby: true })));
  }),
);

/**
 * Abort a game that has not really begun: allowed until both players have
 * made their first move, and costs nobody any rating.
 */
gamesRouter.post(
  '/:id/abort',
  requireUser,
  asyncHandler(async (req, res) => {
    const id = objectId.parse(req.params.id);
    const { game } = await activeGameFor(req, id);
    if (game.moveCount >= FREE_PLIES) {
      throw HttpError.badRequest('Both players have moved; resign or offer a draw instead');
    }

    // Guarded on the move count too, so a move landing at the same moment wins.
    const aborted = await abortGame(id, 'aborted', {
      from: ['active'],
      where: { moveCount: { $lt: FREE_PLIES } },
    });
    if (!aborted) throw HttpError.conflict('The game moved on; refresh and try again');

    res.json(serializeGame(await announce(id, { lobby: true })));
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

    res.json(serializeGame(await announce(id, { lobby: true })));
  }),
);

gamesRouter.post(
  '/:id/draw-offer',
  requireUser,
  offerLimiter,
  asyncHandler(async (req, res) => {
    const id = objectId.parse(req.params.id);
    const { game, user } = await activeGameFor(req, id);
    const offeredBy = refId(game.drawOfferBy);

    // Offering when the opponent has already offered is agreeing.
    if (offeredBy && offeredBy !== String(user._id)) {
      await finishGame(id, '1/2-1/2', 'agreement');
      res.json(serializeGame(await announce(id, { lobby: true })));
      return;
    }

    if (!offeredBy) {
      // Bumping the version is what makes the offer visible to the opponent —
      // previously the version came from the move count alone, so an offer
      // went unnoticed until somebody played a move.
      await Game.updateOne(
        { _id: id, status: 'active', drawOfferBy: null },
        { $set: { drawOfferBy: user._id }, $inc: { version: 1 } },
      );
    }

    res.json(serializeGame(await announce(id)));
  }),
);

gamesRouter.post(
  '/:id/draw-accept',
  requireUser,
  asyncHandler(async (req, res) => {
    const id = objectId.parse(req.params.id);
    const { game, user } = await activeGameFor(req, id);

    if (!game.drawOfferBy) throw HttpError.badRequest('There is no draw offer to accept');
    if (refId(game.drawOfferBy) === String(user._id)) {
      throw HttpError.badRequest('You cannot accept your own draw offer');
    }

    await finishGame(id, '1/2-1/2', 'agreement');
    res.json(serializeGame(await announce(id, { lobby: true })));
  }),
);

/** Decline the opponent's offer — or withdraw your own. */
gamesRouter.post(
  '/:id/draw-decline',
  requireUser,
  asyncHandler(async (req, res) => {
    const id = objectId.parse(req.params.id);
    const { game } = await activeGameFor(req, id);
    if (!game.drawOfferBy) throw HttpError.badRequest('There is no draw offer to decline');

    await Game.updateOne(
      { _id: id, status: 'active', drawOfferBy: { $ne: null } },
      { $set: { drawOfferBy: null }, $inc: { version: 1 } },
    );

    res.json(serializeGame(await announce(id)));
  }),
);

/**
 * Offer a rematch: a direct challenge to the same opponent, same settings,
 * colours swapped. If the opponent already offered one, this accepts it.
 */
gamesRouter.post(
  '/:id/rematch',
  requireUser,
  offerLimiter,
  asyncHandler(async (req, res) => {
    const id = objectId.parse(req.params.id);
    const user = currentUser(req);

    const game = await Game.findById(id);
    if (!game) throw HttpError.notFound('Game not found');
    const side = sideOf(game, String(user._id));
    if (!side) throw HttpError.forbidden('You did not play in this game');
    if (!game.startedAt || game.status === 'active' || game.status === 'open') {
      throw HttpError.badRequest('A rematch can be offered once the game is over');
    }

    const opponentId = refId(side === 'white' ? game.blackUserId : game.whiteUserId) as string;

    // Both players pressed "rematch": the second press starts the game.
    const theirs = await Game.findOne({
      status: 'open',
      creatorUserId: opponentId,
      invitedUserId: user._id,
      rematchOfGameId: game._id,
    });
    if (theirs) {
      if (!(await startChallenge(theirs, user))) {
        throw HttpError.conflict('That rematch is no longer open');
      }
      const started = await announceStart(String(theirs._id));
      res.json(serializeGame(started));
      return;
    }

    const existing = await Game.findOne({
      status: 'open',
      creatorUserId: user._id,
      invitedUserId: opponentId,
    });
    if (existing) {
      res.json(serializeGame(await loadGame(String(existing._id))));
      return;
    }

    const opponent = await challengeableOpponent(user, opponentId);
    const created = await Game.create({
      creatorUserId: user._id,
      invitedUserId: opponent._id,
      direct: true,
      rematchOfGameId: game._id,
      creatorColor: side === 'white' ? 'black' : 'white',
      rated: game.rated,
      timeControlSeconds: game.timeControlSeconds,
      incrementSeconds: game.incrementSeconds,
      status: 'open',
      whiteUserId: side === 'white' ? null : user._id,
      blackUserId: side === 'white' ? user._id : null,
    });

    const offer = await announce(String(created._id));
    const payload = serializeGame(offer);
    notifyUser(String(opponent._id), 'challenge:received', payload);
    res.status(201).json(payload);
  }),
);

// -------------------------------------------------------------- game chat

const CHAT_MAX = 500;
const CHAT_HISTORY = 200;

gamesRouter.get(
  '/:id/chat',
  optionalUser,
  asyncHandler(async (req, res) => {
    const id = objectId.parse(req.params.id);

    const exists = await Game.exists({ _id: id });
    if (!exists) throw HttpError.notFound('Game not found');

    // The newest messages, shown oldest-first. Sorting ascending with a limit
    // returned the *first* 200, so a long game's chat stopped updating.
    const messages = await GameMessage.find({ gameId: id })
      .sort({ createdAt: -1 })
      .limit(CHAT_HISTORY)
      .populate('userId', 'username displayName deletedAt');

    res.json(messages.reverse().map(serializeGameMessage));
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

    const side = sideOf(game, String(user._id));
    if (!side) throw HttpError.forbidden('Only the players can chat in this game');
    if (!user.notifGameChat) {
      throw HttpError.forbidden('You turned game chat off in your settings');
    }
    const opponentId = refId(side === 'white' ? game.blackUserId : game.whiteUserId);
    const opponent = opponentId ? await User.findById(opponentId).select('notifGameChat') : null;
    if (opponent && !opponent.notifGameChat) {
      throw HttpError.forbidden('Your opponent has game chat turned off');
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
