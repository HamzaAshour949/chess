import { Chess } from "chess.js";

export const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

/**
 * Every position of a game, from its UCI move list.
 *
 * Index 0 is the starting position; index n is the position after ply n. The
 * server's move list is the source of truth, and replaying it is what lets a
 * player step back through the game without another request.
 */
export function replayPlies(moves) {
  const chess = new Chess();
  const plies = [{ fen: START_FEN, san: null, uci: null, color: null }];
  for (const uci of (moves || "").trim().split(/\s+/).filter(Boolean)) {
    const move = chess.move({
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
      ...(uci.length === 5 ? { promotion: uci[4] } : {}),
    });
    plies.push({ fen: chess.fen(), san: move.san, uci, color: move.color });
  }
  return plies;
}

/** Legal moves from a square, as { to, promotion } entries. */
export function legalTargets(fen, square) {
  try {
    const chess = new Chess(fen);
    return chess.moves({ square, verbose: true });
  } catch {
    return [];
  }
}

/** The move from → to in this position, or null. Promotion defaults to queen. */
export function findMove(fen, from, to, promotion) {
  const candidates = legalTargets(fen, from).filter((move) => move.to === to);
  if (candidates.length === 0) return null;
  const needsPromotion = candidates.some((move) => move.promotion);
  if (needsPromotion && !promotion) return { needsPromotion: true, from, to };
  const move = candidates.find((m) => (promotion ? m.promotion === promotion : true));
  return move ? { needsPromotion: false, move } : null;
}

/** The position after playing a move, for an optimistic board update. */
export function positionAfter(fen, from, to, promotion) {
  try {
    const chess = new Chess(fen);
    const move = chess.move({ from, to, ...(promotion ? { promotion } : {}) });
    return { fen: chess.fen(), san: move.san };
  } catch {
    return null;
  }
}

/** Square of the king that is in check in this position, if any. */
export function checkedKingSquare(fen) {
  try {
    const chess = new Chess(fen);
    if (!chess.isCheck()) return null;
    const color = chess.turn();
    for (const row of chess.board()) {
      for (const cell of row) {
        if (cell && cell.type === "k" && cell.color === color) return cell.square;
      }
    }
  } catch {
    /* malformed FEN: no highlight */
  }
  return null;
}

const VALUES = { p: 1, n: 3, b: 3, r: 5, q: 9 };
const START_COUNTS = { p: 8, n: 2, b: 2, r: 2, q: 1 };

/**
 * What each side has captured, and the material balance, from a position.
 *
 * Counted against the starting set, so a promoted pawn shows up as the piece
 * it became; that is the convention the big chess sites use too.
 */
export function materialFromFen(fen) {
  const placement = (fen || "").split(" ")[0];
  const counts = { w: { p: 0, n: 0, b: 0, r: 0, q: 0 }, b: { p: 0, n: 0, b: 0, r: 0, q: 0 } };
  for (const char of placement) {
    const type = char.toLowerCase();
    if (!(type in VALUES)) continue;
    counts[char === type ? "b" : "w"][type] += 1;
  }

  const captured = { w: [], b: [] }; // pieces each colour has taken
  let score = 0; // positive: white is ahead
  for (const type of ["q", "r", "b", "n", "p"]) {
    for (let i = counts.b[type]; i < START_COUNTS[type]; i += 1) captured.w.push(type);
    for (let i = counts.w[type]; i < START_COUNTS[type]; i += 1) captured.b.push(type);
    score += (counts.w[type] - counts.b[type]) * VALUES[type];
  }
  return { captured, score };
}
