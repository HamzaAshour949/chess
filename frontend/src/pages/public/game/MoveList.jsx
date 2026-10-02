import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";

/**
 * The game's moves as numbered pairs. Every move is a button: clicking one
 * shows that position, and the arrow keys step through them.
 */
export default function MoveList({ plies, viewPly, onSelect }) {
  const { t } = useTranslation();
  const container = useRef(null);
  const last = plies.length - 1;

  // Keep the shown move in view, without scrolling the whole page.
  useEffect(() => {
    const box = container.current;
    const active = box?.querySelector('[aria-current="true"]');
    if (!box || !active) return;
    const top = active.offsetTop - box.offsetTop;
    if (top < box.scrollTop || top > box.scrollTop + box.clientHeight - active.offsetHeight) {
      box.scrollTop = top - box.clientHeight / 2;
    }
  }, [viewPly, plies.length]);

  const rows = [];
  for (let ply = 1; ply <= last; ply += 2) rows.push(ply);

  const navButton = "flex-1 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-white/5 text-slate-200";

  return (
    <div className="surface-elev p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-white uppercase tracking-wider">{t("moves")}</h3>
        {viewPly !== last && (
          <button type="button" onClick={() => onSelect(last)} className="chip chip-gold hover:bg-amber-500/30">
            {t("back_to_live")}
          </button>
        )}
      </div>

      {last === 0 ? (
        <p className="text-xs text-slate-500">{t("no_moves_yet")}</p>
      ) : (
        <ol
          ref={container}
          className="grid grid-cols-[2.25rem_1fr_1fr] gap-x-1 gap-y-0.5 text-sm font-mono max-h-64 overflow-y-auto pe-1"
          dir="ltr"
        >
          {rows.map((ply) => (
            <li key={ply} className="contents">
              <span className="text-slate-500 py-1 text-end pe-1">{(ply + 1) / 2}.</span>
              {[ply, ply + 1].map((n) =>
                n <= last ? (
                  <button
                    key={n}
                    type="button"
                    onClick={() => onSelect(n)}
                    aria-current={n === viewPly ? "true" : undefined}
                    className={`text-start px-2 py-1 rounded-md transition ${
                      n === viewPly ? "bg-amber-400 text-slate-950 font-bold" : "text-slate-200 hover:bg-white/10"
                    }`}
                  >
                    {plies[n].san}
                  </button>
                ) : (
                  <span key={n} />
                ),
              )}
            </li>
          ))}
        </ol>
      )}

      <div className="flex gap-1.5 mt-3" dir="ltr">
        <button type="button" className={navButton} onClick={() => onSelect(0)} disabled={viewPly === 0} aria-label={t("first_move")}>
          ⏮
        </button>
        <button
          type="button"
          className={navButton}
          onClick={() => onSelect(Math.max(0, viewPly - 1))}
          disabled={viewPly === 0}
          aria-label={t("previous_move")}
        >
          ◀
        </button>
        <button
          type="button"
          className={navButton}
          onClick={() => onSelect(Math.min(last, viewPly + 1))}
          disabled={viewPly === last}
          aria-label={t("next_move")}
        >
          ▶
        </button>
        <button type="button" className={navButton} onClick={() => onSelect(last)} disabled={viewPly === last} aria-label={t("last_move")}>
          ⏭
        </button>
      </div>
    </div>
  );
}
