import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { defaultPieces } from "react-chessboard";

const CHOICES = [
  { type: "q", key: "piece_queen" },
  { type: "r", key: "piece_rook" },
  { type: "b", key: "piece_bishop" },
  { type: "n", key: "piece_knight" },
];

/**
 * Choose the piece a pawn becomes. Under-promotion is rare but real — a knight
 * that gives check, a rook that avoids stalemate — and the old board could
 * only ever make a queen.
 */
export default function PromotionPicker({ color, onPick, onCancel }) {
  const { t } = useTranslation();
  const first = useRef(null);

  useEffect(() => {
    first.current?.focus();
    const onKey = (event) => {
      if (event.key === "Escape") onCancel();
      const shortcut = { q: "q", r: "r", b: "b", n: "n" }[event.key.toLowerCase()];
      if (shortcut) onPick(shortcut);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onPick, onCancel]);

  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/55 backdrop-blur-[2px] rounded-xl">
      <div role="dialog" aria-label={t("choose_promotion")} className="surface-elev p-4 text-center" style={{ background: "#0f1628" }}>
        <p className="text-sm font-semibold text-white mb-3">{t("choose_promotion")}</p>
        <div className="flex gap-2">
          {CHOICES.map((choice, index) => {
            const Piece = defaultPieces[`${color}${choice.type.toUpperCase()}`];
            return (
              <button
                key={choice.type}
                ref={index === 0 ? first : undefined}
                type="button"
                onClick={() => onPick(choice.type)}
                className="w-16 h-16 rounded-xl bg-white/5 hover:bg-amber-400/20 border border-white/10 hover:border-amber-400/50 transition p-1.5"
                aria-label={t(choice.key)}
                title={`${t(choice.key)} (${choice.type.toUpperCase()})`}
              >
                <Piece svgStyle={{ width: "100%", height: "100%" }} />
              </button>
            );
          })}
        </div>
        <button type="button" onClick={onCancel} className="mt-3 text-xs text-slate-400 hover:text-white">
          {t("cancel")}
        </button>
      </div>
    </div>
  );
}
