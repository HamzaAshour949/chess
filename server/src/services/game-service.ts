import type { ClientSession } from 'mongoose';
import { mongoose, supportsTransactions } from '../db/mongoose.js';
import { Game, User, type GameDoc, type UserDoc } from '../models/index.js';
import { calculateRatings } from '../lib/elo.js';
import { canMate, turnFromFen, type Termination } from '../lib/chess.js';
import { HttpError } from '../lib/http-error.js';
import { logger } from '../lib/logger.js';

export type Side = 'white' | 'black';

/** Which side of the board this user is on, or null for a spectator. */
export function sideOf(game: GameDoc, userId: string): Side | null {
  if (String(game.whiteUserId) === userId) return 'white';
  if (String(game.blackUserId) === userId) return 'black';
  return null;
}

export function isFinished(game: GameDoc): boolean {
  return game.status === 'white_wins' || game.status === 'black_wins' || game.status === 'draw';
}

function statusFor(result: string): 'white_wins' | 'black_wins' | 'draw' {
  if (result === '1-0') return 'white_wins';
  if (result === '0-1') return 'black_wins';
  return 'draw';
}

/**
 * Milliseconds the side to move has left right now.
 *
 * The stored value only changes when a move is played, so the time spent on
 * the move in progress has to be subtracted on read.
 */
export function remainingMs(game: GameDoc, now = Date.now()): { white: number; black: number } | null {
  if (game.whiteTimeMs == null || game.blackTimeMs == null) return null;

  let { whiteTimeMs: white, blackTimeMs: black } = game;
  if (game.status === 'active') {
    const since = game.lastMoveAt ?? game.startedAt;
    if (since) {
      const elapsed = Math.max(0, now - new Date(since).getTime());
      if (turnFromFen(game.fen) === 'white') white = Math.max(0, white - elapsed);
      else black = Math.max(0, black - elapsed);
    }
  }
  return { white, black };
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
  if (isFinished(game)) return game;

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
          { $inc: { gamesPlayed: 1, [`games${cap(whiteResult)}`]: 1, onlineRating: whiteDelta } },
          options,
        ),
        User.updateOne(
          { _id: black._id },
          { $inc: { gamesPlayed: 1, [`games${cap(blackResult)}`]: 1, onlineRating: blackDelta } },
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

function cap(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/**
 * End the game if the side to move has run out of time.
 *
 * Returns the updated game when a flag fell, otherwise null. Called lazily on
 * every read and every move attempt, so a clock runs out even if neither
 * player is looking.
 */
export async function enforceClock(game: GameDoc): Promise<GameDoc | null> {
  if (game.status !== 'active' || !game.timeControlSeconds) return null;

  const remaining = remainingMs(game);
  if (!remaining) return null;

  const side = turnFromFen(game.fen);
  if (remaining[side] > 0) return null;

  const winner: Side = side === 'white' ? 'black' : 'white';

  // FIDE: running out of time is only a loss if the opponent could still mate.
  // With a bare king, or king and one minor piece, it is a draw instead.
  const result = canMate(game.fen, winner) ? (winner === 'white' ? '1-0' : '0-1') : '1/2-1/2';

  await Game.updateOne(
    { _id: game._id, status: 'active' },
    { $set: { [side === 'white' ? 'whiteTimeMs' : 'blackTimeMs']: 0 } },
  );

  logger.debug({ gameId: String(game._id), side }, 'Flag fell');
  return finishGame(String(game._id), result, 'timeout');
}

/**
 * Deduct the time spent on this move and add the Fischer increment.
 *
 * Returns the new clock values in milliseconds, or null for an untimed game.
 */
export function consumeClock(
  game: GameDoc,
  now = Date.now(),
): { whiteTimeMs: number; blackTimeMs: number } | null {
  if (!game.timeControlSeconds || game.whiteTimeMs == null || game.blackTimeMs == null) {
    return null;
  }

  const since = game.lastMoveAt ?? game.startedAt;
  const elapsed = since ? Math.max(0, now - new Date(since).getTime()) : 0;
  const increment = game.incrementSeconds * 1000;
  const side = turnFromFen(game.fen);

  // Milliseconds throughout: whole-second budgets accumulate rounding drift
  // across a long increment game, always in the mover's favour.
  return side === 'white'
    ? {
        whiteTimeMs: Math.max(0, game.whiteTimeMs - elapsed + increment),
        blackTimeMs: game.blackTimeMs,
      }
    : {
        whiteTimeMs: game.whiteTimeMs,
        blackTimeMs: Math.max(0, game.blackTimeMs - elapsed + increment),
      };
}

/** Both participants of a game, for notification fan-out. */
export function participantIds(game: GameDoc): string[] {
  return [game.whiteUserId, game.blackUserId].filter(Boolean).map(String);
}

export type { GameDoc, UserDoc };
