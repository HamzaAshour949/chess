import type { ClientSession } from 'mongoose';
import { env } from '../config/env.js';
import { mongoose, supportsTransactions } from '../db/mongoose.js';
import { Game, User, type GameDoc, type UserDoc } from '../models/index.js';
import { calculateRatings } from '../lib/elo.js';
import { canMate, turnFromFen, type Termination } from '../lib/chess.js';
import { deadlineFor, isOverdue, type Side } from '../lib/clock.js';
import { HttpError } from '../lib/http-error.js';
import { logger } from '../lib/logger.js';
import { serializeGame } from '../lib/serializers.js';
import { notifyUser, publishGame, type MoveInfo } from '../realtime/publish.js';

export type { Side };

/** The public fields of a player, for populating the sides of a game. */
export const PLAYER_FIELDS =
  'username displayName avatarUrl country onlineRating gamesPlayed gamesWon gamesLost gamesDrawn linkedPlayerId isBanned deletedAt createdAt';

interface Populatable<Q> {
  populate: (path: string, select: string) => Q;
}

/** Populating every side keeps a list of games to one query, not one per row. */
export function withPlayers<Q extends Populatable<Q>>(query: Q): Q {
  return query
    .populate('whiteUserId', PLAYER_FIELDS)
    .populate('blackUserId', PLAYER_FIELDS)
    .populate('creatorUserId', PLAYER_FIELDS)
    .populate('invitedUserId', PLAYER_FIELDS);
}

export async function loadGame(id: string): Promise<GameDoc> {
  const game = await withPlayers(Game.findById(id));
  if (!game) throw HttpError.notFound('Game not found');
  return game;
}

/** Which side of the board this user is on, or null for a spectator. */
export function sideOf(game: GameDoc, userId: string): Side | null {
  if (refId(game.whiteUserId) === userId) return 'white';
  if (refId(game.blackUserId) === userId) return 'black';
  return null;
}

/** The id behind a reference, whether or not it has been populated. */
export function refId(ref: unknown): string | null {
  if (!ref) return null;
  if (typeof ref === 'object' && '_id' in ref) return String((ref as { _id: unknown })._id);
  return String(ref);
}

export function isFinished(game: Pick<GameDoc, 'status'>): boolean {
  return game.status === 'white_wins' || game.status === 'black_wins' || game.status === 'draw';
}

/** Both participants, for notification fan-out. */
export function participantIds(game: GameDoc): string[] {
  return [refId(game.whiteUserId), refId(game.blackUserId)].filter((id): id is string => !!id);
}

function statusFor(result: string): 'white_wins' | 'black_wins' | 'draw' {
  if (result === '1-0') return 'white_wins';
  if (result === '0-1') return 'black_wins';
  return 'draw';
}

function capitalise(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/**
 * End a game once, applying ratings and player stats atomically.
 *
 * Idempotent by construction: the update is guarded on the game still being
 * active, and the rating write on `ratingsApplied` being false, so a retry, a
 * double-submit or two racing requests can never double-count a result.
 */
export async function finishGame(
  gameId: string,
  result: string,
  termination: Termination,
): Promise<GameDoc> {
  const game = await Game.findById(gameId);
  if (!game) throw HttpError.notFound('Game not found');
  if (game.status !== 'active') return game;

  const status = statusFor(result);
  const endedAt = new Date();

  const white = game.whiteUserId ? await User.findById(game.whiteUserId) : null;
  const black = game.blackUserId ? await User.findById(game.blackUserId) : null;

  const whiteBefore = white?.onlineRating ?? null;
  const blackBefore = black?.onlineRating ?? null;

  let whiteAfter = whiteBefore;
  let blackAfter = blackBefore;
  let whiteDelta = 0;
  let blackDelta = 0;

  if (game.rated && white && black) {
    const change = calculateRatings(
      white.onlineRating,
      black.onlineRating,
      white.gamesPlayed,
      black.gamesPlayed,
      result,
    );
    whiteAfter = change.whiteAfter;
    blackAfter = change.blackAfter;
    whiteDelta = change.whiteDelta;
    blackDelta = change.blackDelta;
  }

  const apply = async (session?: ClientSession) => {
    const options = session ? { session } : {};

    // Guarded on `active`, so only one caller ever performs the transition.
    const updated = await Game.findOneAndUpdate(
      { _id: gameId, status: 'active' },
      {
        $set: {
          status,
          result,
          termination,
          endedAt,
          deadlineAt: null,
          drawOfferBy: null,
          whiteRatingBefore: whiteBefore,
          blackRatingBefore: blackBefore,
          whiteRatingAfter: whiteAfter,
          blackRatingAfter: blackAfter,
          ratingsApplied: Boolean(white && black),
        },
        $inc: { version: 1 },
      },
      { ...options, returnDocument: 'after' },
    );

    if (!updated) return null;

    if (white && black) {
      const whiteResult = result === '1-0' ? 'won' : result === '0-1' ? 'lost' : 'drawn';
      const blackResult = result === '1-0' ? 'lost' : result === '0-1' ? 'won' : 'drawn';

      await Promise.all([
        User.updateOne(
          { _id: white._id },
          {
            $inc: {
              gamesPlayed: 1,
              [`games${capitalise(whiteResult)}`]: 1,
              onlineRating: whiteDelta,
            },
          },
          options,
        ),
        User.updateOne(
          { _id: black._id },
          {
            $inc: {
              gamesPlayed: 1,
              [`games${capitalise(blackResult)}`]: 1,
              onlineRating: blackDelta,
            },
          },
          options,
        ),
      ]);
    }

    return updated;
  };

  // The game and both player records must move together. On a standalone
  // MongoDB there are no transactions, so fall back to sequential writes —
  // the `active` guard still prevents double-application.
  if (await supportsTransactions()) {
    const session = await mongoose.startSession();
    try {
      let finished: GameDoc | null = null;
      await session.withTransaction(async () => {
        finished = await apply(session);
      });
      if (finished) return finished;
    } finally {
      await session.endSession();
    }
  } else {
    const updated = await apply();
    if (updated) return updated;
  }

  // Another request finished it first; return whatever it settled on.
  const settled = await Game.findById(gameId);
  if (!settled) throw HttpError.notFound('Game not found');
  return settled;
}

/**
 * End a challenge or a game without a result: no rating change, no stats.
 *
 * Guarded on the statuses it may leave, so it can never overwrite a result.
 * Returns null if the game had already moved on.
 */
export async function abortGame(
  gameId: string,
  termination: Termination,
  options: {
    from?: Array<'open' | 'active'>;
    reason?: string | null;
    /** Extra conditions the game must still meet, checked in the same write. */
    where?: Record<string, unknown>;
  } = {},
): Promise<GameDoc | null> {
  const from = options.from ?? ['open', 'active'];
  return Game.findOneAndUpdate(
    { ...options.where, _id: gameId, status: { $in: from } },
    {
      $set: {
        status: 'aborted',
        termination,
        endedAt: new Date(),
        deadlineAt: null,
        drawOfferBy: null,
        ...(options.reason !== undefined ? { voidReason: options.reason } : {}),
      },
      $inc: { version: 1 },
    },
    { returnDocument: 'after' },
  );
}

/**
 * Settle the game if the side to move is past its deadline.
 *
 * During the free first moves that means a no-show, and the game is aborted.
 * After that it is a flag: a loss on time — or, per FIDE, a draw when the
 * opponent has too little material left to ever mate.
 *
 * Returns the settled game, or null when there was nothing to do. Called on
 * every read, every move attempt and by the sweeper, so a clock runs out even
 * when neither player is looking.
 */
export async function enforceClock(game: GameDoc, now = Date.now()): Promise<GameDoc | null> {
  const overdue = isOverdue(game, now);
  if (!overdue) return null;

  if (overdue === 'first_move') {
    const aborted = await abortGame(String(game._id), 'abandoned', { from: ['active'] });
    logger.debug({ gameId: String(game._id) }, 'No first move; game aborted');
    return aborted ?? (await Game.findById(game._id));
  }

  const side = turnFromFen(game.fen);
  const winner: Side = side === 'white' ? 'black' : 'white';
  const result = canMate(game.fen, winner) ? (winner === 'white' ? '1-0' : '0-1') : '1/2-1/2';

  await Game.updateOne(
    { _id: game._id, status: 'active' },
    { $set: { [side === 'white' ? 'whiteTimeMs' : 'blackTimeMs']: 0 } },
  );

  logger.debug({ gameId: String(game._id), side }, 'Flag fell');
  return finishGame(String(game._id), result, 'timeout');
}

/**
 * Re-read a game with its players and push it to everyone watching.
 *
 * `lobby` also nudges the lobby and live-game lists, for any change of status:
 * a challenge posted, withdrawn or taken, a game started or finished.
 */
export async function announce(
  gameId: string,
  options: { lobby?: boolean; move?: MoveInfo } = {},
): Promise<GameDoc> {
  const game = await loadGame(gameId);
  // Private invitations are nobody else's business until they become a game.
  const lobby = options.lobby && !(game.status === 'open' && game.direct);
  publishGame(game, lobby ? 'lobby' : undefined, options.move);
  return game;
}

/** Tell the other party that an open challenge is gone, and why. */
export function notifyChallengeClosed(game: GameDoc, exceptUserId?: string): void {
  const payload = serializeGame(game);
  for (const id of [refId(game.creatorUserId), refId(game.invitedUserId)]) {
    if (id && id !== exceptUserId) notifyUser(id, 'challenge:closed', payload);
  }
}

// ------------------------------------------------------------------ sweeper

/**
 * One pass of housekeeping.
 *
 *  1. Live games whose deadline passed are settled and announced, so a flag
 *     falls — and the opponent is told — even if nobody has the board open.
 *  2. Live games from before deadlines were stored get one computed.
 *  3. Challenges nobody accepted within CHALLENGE_TTL_MINUTES are withdrawn,
 *     so the lobby never fills with seeks from players who left hours ago.
 *
 * Every write is a guarded update, so two server instances sweeping at the
 * same moment cannot double-apply anything.
 */
export async function sweepGames(now = new Date()): Promise<{ settled: number; expired: number }> {
  let settled = 0;
  let expired = 0;

  const overdue = await Game.find({ status: 'active', deadlineAt: { $lte: now } }).limit(200);
  for (const game of overdue) {
    const result = await enforceClock(game, now.getTime());
    if (result) {
      settled += 1;
      await announce(String(game._id), { lobby: true });
    } else {
      // The stored deadline was stale; recompute it from the live state.
      await Game.updateOne(
        { _id: game._id, version: game.version },
        { $set: { deadlineAt: deadlineFor(game) } },
      );
    }
  }

  const missing = await Game.find({
    status: 'active',
    deadlineAt: null,
    $or: [{ moveCount: { $lt: 2 } }, { timeControlSeconds: { $gt: 0 } }],
  }).limit(200);
  for (const game of missing) {
    await Game.updateOne(
      { _id: game._id, version: game.version },
      { $set: { deadlineAt: deadlineFor(game) } },
    );
  }

  const stale = await Game.find({
    status: 'open',
    createdAt: { $lt: new Date(now.getTime() - env.challengeTtlMs) },
  })
    .select('_id')
    .limit(200);
  for (const { _id } of stale) {
    const closed = await abortGame(String(_id), 'expired', { from: ['open'] });
    if (!closed) continue;
    expired += 1;
    const game = await announce(String(_id), { lobby: true });
    notifyChallengeClosed(game);
  }

  return { settled, expired };
}

/** Run the sweeper every `intervalMs`. Returns a function that stops it. */
export function startSweeper(intervalMs = 3000): () => void {
  let running = false;
  const timer = setInterval(() => {
    if (running) return;
    running = true;
    sweepGames()
      .then(({ settled, expired }) => {
        if (settled || expired) logger.debug({ settled, expired }, 'Sweeper pass');
      })
      .catch((error) => logger.error({ err: error }, 'Game sweeper failed'))
      .finally(() => {
        running = false;
      });
  }, intervalMs);
  timer.unref?.();
  return () => clearInterval(timer);
}

export type { GameDoc, UserDoc };
