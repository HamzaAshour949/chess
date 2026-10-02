import { memo } from "react";
import { defaultPieces } from "react-chessboard";

const FILES = "abcdefgh";

/** Board squares from the placement field of a FEN: rank 8 first. */
function parsePlacement(fen) {
  const rows = (fen || "").split(" ")[0].split("/");
  return rows.map((row) => {
    const squares = [];
    for (const char of row) {
      if (/\d/.test(char)) {
        for (let i = 0; i < Number(char); i += 1) squares.push(null);
      } else {
        squares.push(char === char.toUpperCase() ? `w${char}` : `b${char.toUpperCase()}`);
      }
    }
    return squares;
  });
}

/**
 * A static board for lists and cards.
 *
 * Deliberately not a full <Chessboard>: a live-games page can show dozens of
 * these, and each interactive board carries drag-and-drop machinery and a
 * context provider. This is a plain grid using the same piece artwork.
 */
function MiniBoard({ fen, orientation = "white", lastMove, size = "100%", className = "" }) {
  const rows = parsePlacement(fen);
  const ordered = orientation === "black" ? rows.map((row) => [...row].reverse()).reverse() : rows;
  const highlight = new Set(lastMove ? [lastMove.slice(0, 2), lastMove.slice(2, 4)] : []);

  return (
    <div
      className={`grid grid-cols-8 aspect-square overflow-hidden rounded-lg ring-1 ring-white/10 ${className}`}
      style={{ width: size }}
      dir="ltr"
      role="img"
      aria-label="Chess position"
    >
      {ordered.map((row, r) =>
        row.map((piece, c) => {
          const file = orientation === "black" ? 7 - c : c;
          const rank = orientation === "black" ? r + 1 : 8 - r;
          const square = `${FILES[file]}${rank}`;
          const light = (file + rank) % 2 === 1;
          const Piece = piece ? defaultPieces[piece] : null;
          return (
            <div
              key={square}
              className="relative"
              style={{
                background: highlight.has(square)
                  ? light
                    ? "#e8d27a"
                    : "#b39a3a"
                  : light
                    ? "#e9dfc8"
                    : "#8b7a5e",
              }}
            >
              {Piece && (
                <div className="absolute inset-0">
                  <Piece svgStyle={{ width: "100%", height: "100%" }} />
                </div>
              )}
            </div>
          );
        }),
      )}
    </div>
  );
}

export default memo(MiniBoard);
