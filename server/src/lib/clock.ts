import { env } from '../config/env.js';
import { turnFromFen } from './chess.js';

/**
 * Clock arithmetic, in one place for the service, the serializers and the
 * sweeper.
 *
 * Rules, as on the major chess sites:
 *  - Each side's first move is free. The clocks start once both players have
 *    moved, so a player who accepted a challenge and is still loading the
 *    board does not lose time to it.
 *  - Instead, each side must make that first move within
 *    FIRST_MOVE_TIMEOUT_SECONDS, or the game is aborted without a result.
 *  - After that, the side to move loses time continuously, and gains the
 *    Fischer increment when it moves.
 */

export interface ClockState {
  status: string;
  fen: string;
  moveCount: number;
  timeControlSeconds: number;
  incrementSeconds: number;
  whiteTimeMs?: number | null;
  blackTimeMs?: number | null;
  lastMoveAt?: Date | null;
  startedAt?: Date | null;
}

export type Side = 'white' | 'black';

/** Plies before the clocks start: one free move each. */
export const FREE_PLIES = 2;

export function isTimed(game: Pick<ClockState, 'timeControlSeconds' | 'whiteTimeMs' | 'blackTimeMs'>) {
  return game.timeControlSeconds > 0 && game.whiteTimeMs != null && game.blackTimeMs != null;
}

/** Is the side to move losing time right now? */
export function isClockRunning(game: ClockState): boolean {
  return game.status === 'active' && isTimed(game) && game.moveCount >= FREE_PLIES;
}

/** Still inside the free first moves, where the only limit is the no-show timer. */
export function awaitingFirstMoves(game: Pick<ClockState, 'status' | 'moveCount'>): boolean {
  return game.status === 'active' && game.moveCount < FREE_PLIES;
}

function since(game: ClockState): number | null {
  const at = game.lastMoveAt ?? game.startedAt;
  return at ? new Date(at).getTime() : null;
}

/**
 * Milliseconds each side has left right now.
 *
 * The stored values only change when a move is played, so the time spent on
 * the move in progress is subtracted on read.
 */
export function remainingMs(game: ClockState, now = Date.now()): Record<Side, number> | null {
  if (game.whiteTimeMs == null || game.blackTimeMs == null) return null;

  let white = game.whiteTimeMs;
  let black = game.blackTimeMs;

  const from = since(game);
  if (isClockRunning(game) && from !== null) {
    const elapsed = Math.max(0, now - from);
    if (turnFromFen(game.fen) === 'white') white = Math.max(0, white - elapsed);
    else black = Math.max(0, black - elapsed);
  }
  return { white, black };
}

/**
 * The mover's clock after the move just played: the thinking time deducted
 * and the increment added. Null for an untimed game.
 *
 * Milliseconds throughout: whole-second budgets accumulate rounding drift
 * across a long increment game, always in the mover's favour.
 */
export function clockAfterMove(
  game: ClockState,
  now = Date.now(),
): { whiteTimeMs: number; blackTimeMs: number } | null {
  if (!isTimed(game)) return null;

  const white = game.whiteTimeMs as number;
  const black = game.blackTimeMs as number;

  // A free first move: nothing deducted, nothing added.
  if (game.moveCount < FREE_PLIES) return { whiteTimeMs: white, blackTimeMs: black };

  const from = since(game);
  const elapsed = from === null ? 0 : Math.max(0, now - from);
  const increment = game.incrementSeconds * 1000;

  return turnFromFen(game.fen) === 'white'
    ? { whiteTimeMs: Math.max(0, white - elapsed + increment), blackTimeMs: black }
    : { whiteTimeMs: white, blackTimeMs: Math.max(0, black - elapsed + increment) };
}

/**
 * When the side to move forfeits if it does nothing: the first-move deadline
 * during the free moves, its flag after that, or never for an untimed game.
 *
 * `game` is the state *after* the latest change, with `lastMoveAt` set to the
 * moment the new side's turn began.
 */
export function deadlineFor(game: ClockState): Date | null {
  if (game.status !== 'active') return null;
  const from = since(game);
  if (from === null) return null;

  if (game.moveCount < FREE_PLIES) return new Date(from + env.firstMoveTimeoutMs);
  if (!isTimed(game)) return null;

  const side = turnFromFen(game.fen);
  const left = side === 'white' ? game.whiteTimeMs : game.blackTimeMs;
  return new Date(from + (left ?? 0));
}

/** Has the side to move run past its deadline (first-move or flag)? */
export function isOverdue(game: ClockState, now = Date.now()): 'first_move' | 'flag' | null {
  if (game.status !== 'active') return null;

  if (game.moveCount < FREE_PLIES) {
    const from = since(game);
    return from !== null && now - from > env.firstMoveTimeoutMs ? 'first_move' : null;
  }

  const remaining = remainingMs(game, now);
  if (!remaining || !isClockRunning(game)) return null;
  return remaining[turnFromFen(game.fen)] <= 0 ? 'flag' : null;
}
