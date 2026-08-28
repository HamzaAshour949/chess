import { describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import {
  IllegalMoveError,
  START_FEN,
  describeOutcome,
  legalMovesUci,
  playMove,
  replayGame,
  splitMoves,
  turnFromFen,
} from '../../src/lib/chess.js';

/**
 * Perft (node counts at a fixed depth) is the standard correctness proof for a
 * move generator: one missing or spurious move anywhere in the tree changes the
 * total. Move legality is the whole security model of a chess server, so it is
 * verified here rather than taken on trust from the dependency.
 *
 * Reference values: https://www.chessprogramming.org/Perft_Results
 */
function perft(chess: Chess, depth: number): number {
  if (depth === 0) return 1;
  const moves = chess.moves({ verbose: true });
  if (depth === 1) return moves.length;

  let nodes = 0;
  for (const move of moves) {
    chess.move(move);
    nodes += perft(chess, depth - 1);
    chess.undo();
  }
  return nodes;
}

describe('move generation (perft)', () => {
  const positions: Array<[string, string, number[]]> = [
    ['initial', START_FEN, [20, 400, 8902]],
    ['kiwipete', 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1', [48, 2039]],
    ['endgame', '8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1', [14, 191, 2812]],
    ['promotions', 'r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1', [6, 264, 9467]],
    ['talkchess', 'rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8', [44, 1486]],
    ['steven', 'r4rk1/1pp1qppp/p1np1n2/2b1p1B1/2B1P1b1/P1NP1N2/1PP1QPPP/R4RK1 w - - 0 10', [46, 2079]],
  ];

  for (const [name, fen, expected] of positions) {
    it.each(expected.map((count, i) => [i + 1, count]))(
      `${name} depth %i yields %i nodes`,
      (depth, count) => {
        const chess = new Chess(fen);
        expect(perft(chess, depth as number)).toBe(count);
        // make/undo must leave the board exactly as it was.
        expect(chess.fen()).toBe(fen);
      },
    );
  }
});

describe('splitMoves', () => {
  it('tolerates empty and padded input', () => {
    expect(splitMoves(null)).toEqual([]);
    expect(splitMoves(undefined)).toEqual([]);
    expect(splitMoves('   ')).toEqual([]);
    expect(splitMoves('  e2e4   e7e5\n')).toEqual(['e2e4', 'e7e5']);
  });
});

describe('playMove', () => {
  it('derives every stored field from the move list', () => {
    let state = playMove('', 'e2e4');
    state = playMove(state.moves, 'e7e5');
    state = playMove(state.moves, 'g1f3');

    expect(state.moves).toBe('e2e4 e7e5 g1f3');
    expect(state.moveCount).toBe(3);
    expect(state.san).toBe('Nf3');
    expect(state.turn).toBe('black');
    expect(state.fen).toBe('rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2');
    expect(state.pgn).toContain('1. e4 e5 2. Nf3');
    expect(state.outcome).toBeNull();
  });

  it('rejects an illegal move', () => {
    expect(() => playMove('', 'e2e5')).toThrow(IllegalMoveError);
  });

  it('rejects a move by the wrong side', () => {
    expect(() => playMove('e2e4', 'd2d4')).toThrow(IllegalMoveError);
  });

  it('rejects malformed input rather than passing it to the engine', () => {
    for (const bad of ['', 'e2', 'z9z9', '<script>alert(1)</script>', 'e2e4e5', 'e2e4k']) {
      expect(() => playMove('', bad)).toThrow(IllegalMoveError);
    }
  });

  it('records a promotion piece', () => {
    const state = playMove(
      'e2e4 d7d5 e4d5 c7c6 d5c6 g8f6 c6b7 f6g8',
      'b7a8q',
    );
    expect(state.uci).toBe('b7a8q');
    expect(state.san).toContain('=Q');
  });

  it('defaults an unspecified promotion to a queen', () => {
    const state = playMove('e2e4 d7d5 e4d5 c7c6 d5c6 g8f6 c6b7 f6g8', 'b7a8');
    expect(state.uci).toBe('b7a8q');
  });
});

describe('outcome detection', () => {
  it("detects Fool's mate", () => {
    let state = playMove('', 'f2f3');
    state = playMove(state.moves, 'e7e5');
    state = playMove(state.moves, 'g2g4');
    state = playMove(state.moves, 'd8h4');

    expect(state.outcome).toEqual({ result: '0-1', termination: 'checkmate' });
  });

  it('refuses further moves once the game is over', () => {
    expect(() => playMove('f2f3 e7e5 g2g4 d8h4', 'e1f2')).toThrow(IllegalMoveError);
  });

  it('detects stalemate as a draw', () => {
    const chess = new Chess('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1');
    expect(describeOutcome(chess)).toEqual({ result: '1/2-1/2', termination: 'stalemate' });
  });

  it('detects insufficient material', () => {
    const chess = new Chess('8/8/4k3/8/8/8/4K3/7B w - - 0 1');
    expect(describeOutcome(chess)).toEqual({
      result: '1/2-1/2',
      termination: 'insufficient_material',
    });
  });

  it('detects threefold repetition, which needs the full replayed history', () => {
    // Knights shuffle back and forth, restoring the start position twice.
    const moves = 'g1f3 g8f6 f3g1 f6g8 g1f3 g8f6 f3g1 f6g8';
    const chess = replayGame(moves);
    expect(describeOutcome(chess)).toEqual({
      result: '1/2-1/2',
      termination: 'threefold_repetition',
    });

    // Two occurrences are not yet a draw.
    expect(describeOutcome(replayGame('g1f3 g8f6 f3g1 f6g8'))).toBeNull();
  });

  it('detects the fifty-move rule', () => {
    const chess = new Chess('7k/8/8/3B4/8/8/8/6KN w - - 99 80');
    chess.move({ from: 'g1', to: 'g2' });
    expect(describeOutcome(chess)).toEqual({ result: '1/2-1/2', termination: 'fifty_moves' });
  });
});

describe('replayGame', () => {
  it('reproduces the position from the move list alone', () => {
    const chess = replayGame('e2e4 e7e5 g1f3 b8c6 f1b5');
    expect(chess.fen()).toBe('r1bqkbnr/pppp1ppp/2n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3');
  });

  it('throws when the stored history is corrupt', () => {
    expect(() => replayGame('e2e4 z9z9')).toThrow(IllegalMoveError);
  });
});

describe('helpers', () => {
  it('reads the side to move from a FEN', () => {
    expect(turnFromFen(START_FEN)).toBe('white');
    expect(turnFromFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR b KQkq - 0 1')).toBe('black');
  });

  it('lists legal moves as UCI', () => {
    const moves = legalMovesUci(new Chess());
    expect(moves).toHaveLength(20);
    expect(moves).toContain('e2e4');
    expect(moves).toContain('g1f3');
  });
});
