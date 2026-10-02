import { describe, expect, it } from 'bun:test';
import { START_FEN } from '../../src/lib/chess.js';
import {
  clockAfterMove,
  deadlineFor,
  isClockRunning,
  isOverdue,
  remainingMs,
  type ClockState,
} from '../../src/lib/clock.js';

const t0 = Date.parse('2026-01-01T12:00:00Z');
const AFTER_E4_E5 = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2';

function state(overrides: Partial<ClockState> = {}): ClockState {
  return {
    status: 'active',
    fen: START_FEN,
    moveCount: 0,
    timeControlSeconds: 60,
    incrementSeconds: 2,
    whiteTimeMs: 60_000,
    blackTimeMs: 60_000,
    lastMoveAt: new Date(t0),
    startedAt: new Date(t0),
    ...overrides,
  };
}

describe('clock rules', () => {
  it('keeps the clocks still during the free first moves', () => {
    const game = state();
    expect(isClockRunning(game)).toBe(false);
    expect(remainingMs(game, t0 + 10_000)).toEqual({ white: 60_000, black: 60_000 });
    expect(clockAfterMove(game, t0 + 10_000)).toEqual({ whiteTimeMs: 60_000, blackTimeMs: 60_000 });
  });

  it('runs the side to move once both have moved', () => {
    const game = state({ moveCount: 2, fen: AFTER_E4_E5 });
    expect(isClockRunning(game)).toBe(true);
    expect(remainingMs(game, t0 + 1_500)).toEqual({ white: 58_500, black: 60_000 });
    expect(clockAfterMove(game, t0 + 1_500)).toEqual({ whiteTimeMs: 60_500, blackTimeMs: 60_000 });
  });

  it('never counts an untimed game', () => {
    const game = state({ timeControlSeconds: 0, whiteTimeMs: null, blackTimeMs: null, moveCount: 4 });
    expect(isClockRunning(game)).toBe(false);
    expect(remainingMs(game)).toBeNull();
    expect(clockAfterMove(game)).toBeNull();
    expect(deadlineFor(game)).toBeNull();
  });

  it('sets the first-move deadline, then the flag', () => {
    expect(deadlineFor(state())?.getTime()).toBe(t0 + 45_000);
    expect(deadlineFor(state({ moveCount: 2, fen: AFTER_E4_E5, whiteTimeMs: 12_000 }))?.getTime()).toBe(
      t0 + 12_000,
    );
  });

  it('reports what is overdue', () => {
    expect(isOverdue(state(), t0 + 44_000)).toBeNull();
    expect(isOverdue(state(), t0 + 46_000)).toBe('first_move');
    const running = state({ moveCount: 2, fen: AFTER_E4_E5 });
    expect(isOverdue(running, t0 + 59_000)).toBeNull();
    expect(isOverdue(running, t0 + 60_000)).toBe('flag');
    expect(isOverdue(state({ status: 'draw' }), t0 + 99_000)).toBeNull();
  });
});
