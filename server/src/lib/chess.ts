import { Chess, type Move as ChessJsMove } from 'chess.js';

export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

const UCI_RE = /^[a-h][1-8][a-h][1-8][qrbn]?$/;

export type Termination =
  | 'checkmate'
  | 'stalemate'
  | 'insufficient_material'
  | 'threefold_repetition'
  | 'fifty_moves'
  | 'resignation'
  | 'timeout'
  | 'agreement'
  | 'abandoned';

export interface Outcome {
  /** "1-0" | "0-1" | "1/2-1/2" */
  result: string;
  termination: Termination;
}

export class IllegalMoveError extends Error {
  constructor(message = 'Illegal move') {
    super(message);
    this.name = 'IllegalMoveError';
  }
}

/** Split a stored move list into individual UCI moves. */
export function splitMoves(moves: string | null | undefined): string[] {
  const trimmed = (moves ?? '').trim();
  return trimmed === '' ? [] : trimmed.split(/\s+/);
}

/**
 * Rebuild a game by replaying its move list from the starting position.
 *
 * Replaying rather than loading the stored FEN is deliberate and load-bearing:
 * threefold repetition is only detectable when the engine has seen every
 * position in the game, and a FEN carries no history. It also means the stored
 * FEN is a pure cache — if it were ever tampered with or went stale, the
 * replayed position still governs, so no illegal position can take hold.
 *
 * Replaying a 200-ply game costs well under a millisecond, so this runs on
 * every move request.
 */
export function replayGame(moves: string | null | undefined): Chess {
  const chess = new Chess();
  for (const uci of splitMoves(moves)) {
    if (!applyUci(chess, uci)) {
      // Only reachable if the stored history was corrupted; better to fail
      // loudly than to silently continue from a divergent position.
      throw new IllegalMoveError(`Stored game history contains an illegal move: ${uci}`);
    }
  }
  return chess;
}

/** Play one UCI move on the given board. Returns the move, or null if illegal. */
export function applyUci(chess: Chess, uci: string): ChessJsMove | null {
  const normalized = uci.trim().toLowerCase();
  if (!UCI_RE.test(normalized)) return null;

  const from = normalized.slice(0, 2);
  const to = normalized.slice(2, 4);
  const promotion = normalized.length === 5 ? normalized[4] : undefined;

  try {
    // chess.js throws on an illegal move rather than returning null.
    return chess.move(promotion ? { from, to, promotion } : { from, to });
  } catch {
    // chess.js insists on an explicit promotion piece. A client that omits it
    // means a queen, which is what the previous API accepted; the retry only
    // succeeds if the queen promotion is genuinely legal.
    if (!promotion) {
      try {
        return chess.move({ from, to, promotion: 'q' });
      } catch {
        return null;
      }
    }
    return null;
  }
}

/**
 * The board result, if the game is over.
 *
 * Threefold repetition and the fifty-move rule are applied automatically
 * rather than left as a claim the players must make, which is how casual
 * online play works and matches the behaviour the SPA expects.
 */
export function describeOutcome(chess: Chess): Outcome | null {
  if (chess.isCheckmate()) {
    // The side to move has been mated, so the other side won.
    return { result: chess.turn() === 'w' ? '0-1' : '1-0', termination: 'checkmate' };
  }
  if (chess.isStalemate()) {
    return { result: '1/2-1/2', termination: 'stalemate' };
  }
  if (chess.isInsufficientMaterial()) {
    return { result: '1/2-1/2', termination: 'insufficient_material' };
  }
  if (chess.isThreefoldRepetition()) {
    return { result: '1/2-1/2', termination: 'threefold_repetition' };
  }
  if (chess.isDrawByFiftyMoves()) {
    return { result: '1/2-1/2', termination: 'fifty_moves' };
  }
  return null;
}

export interface MoveResult {
  /** Updated space-separated UCI move list. */
  moves: string;
  fen: string;
  /** Movetext only — no PGN headers. */
  pgn: string;
  moveCount: number;
  /** SAN of the move just played. */
  san: string;
  uci: string;
  outcome: Outcome | null;
  /** "white" | "black" — whose turn it now is. */
  turn: 'white' | 'black';
  isCheck: boolean;
}

/**
 * Validate and apply a move against a stored move list.
 *
 * Everything the caller persists is derived here, so a game's FEN and PGN can
 * never drift from its move list.
 *
 * @throws IllegalMoveError when the move is not legal in the resulting position
 */
export function playMove(storedMoves: string | null | undefined, uci: string): MoveResult {
  const chess = replayGame(storedMoves);

  if (chess.isGameOver()) {
    throw new IllegalMoveError('The game has already finished');
  }

  const move = applyUci(chess, uci);
  if (!move) {
    throw new IllegalMoveError('Illegal move');
  }

  const history = splitMoves(storedMoves);
  history.push(toUci(move));

  return {
    moves: history.join(' '),
    fen: chess.fen(),
    pgn: chess.pgn(),
    moveCount: history.length,
    san: move.san,
    uci: toUci(move),
    outcome: describeOutcome(chess),
    turn: chess.turn() === 'w' ? 'white' : 'black',
    isCheck: chess.isCheck(),
  };
}

/** Canonical UCI for a chess.js move, including the promotion suffix. */
export function toUci(move: ChessJsMove): string {
  return `${move.from}${move.to}${move.promotion ?? ''}`;
}

/** Whose turn it is in a stored position, without replaying the whole game. */
export function turnFromFen(fen: string): 'white' | 'black' {
  return fen.split(' ')[1] === 'b' ? 'black' : 'white';
}

/** Legal moves in the current position, as UCI, for clients that want hints. */
export function legalMovesUci(chess: Chess): string[] {
  return chess.moves({ verbose: true }).map(toUci);
}
