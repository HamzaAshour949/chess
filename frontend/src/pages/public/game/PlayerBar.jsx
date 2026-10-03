import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { defaultPieces } from "react-chessboard";
import Avatar from "../../../components/Avatar";
import { clockText, nameOf } from "../../../lib/format";

/** A row of captured pieces, drawn in the colour they had on the board. */
function Captured({ pieces, color }) {
  if (!pieces?.length) return null;
  return (
    <span className="inline-flex items-center -space-x-1.5 rtl:space-x-reverse" aria-hidden="true">
      {pieces.map((type, index) => {
        const Piece = defaultPieces[`${color}${type.toUpperCase()}`];
        return (
          <span key={`${type}${index}`} className="w-4 h-4 inline-block">
            <Piece svgStyle={{ width: 16, height: 16 }} />
          </span>
        );
      })}
    </span>
  );
}

/**
 * One side of the board: who is playing, what they have taken, their clock.
 *
 * `captured` are the opponent's pieces this side has taken, so they are drawn
 * in the opponent's colour.
 */
export default function PlayerBar({ user, side, clock, ticking, lowTime, captured, advantage, isYou, result }) {
  const { t } = useTranslation();
  const opponentColor = side === "white" ? "b" : "w";

  return (
    <div
      className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border transition ${
        ticking ? "bg-amber-500/[0.07] border-amber-400/40" : "bg-white/[0.03] border-white/[0.06]"
      }`}
    >
      <Avatar user={user} size={36} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-base leading-none" aria-hidden="true">
            {side === "white" ? "♔" : "♚"}
          </span>
          {user && !user.is_deleted ? (
            <Link
              to={`/u/${user.username}`}
              className="text-white font-semibold truncate hover:text-amber-300 transition"
            >
              <bdi>{nameOf(user, t)}</bdi>
            </Link>
          ) : (
            <span className="text-slate-300 font-semibold truncate"><bdi>{nameOf(user, t)}</bdi></span>
          )}
          {isYou && <span className="chip chip-slate !text-[10px] !py-0">{t("you")}</span>}
          {result && (
            <span
              className={`chip !text-[10px] !py-0 ${
                result === "win" ? "chip-green" : result === "loss" ? "chip-red" : "chip-slate"
              }`}
            >
              {t(`result_${result}`)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-400 mt-0.5 min-h-[16px]">
          <span className="tabular-nums">
            {user?.online_rating ?? "—"}
            {user?.is_provisional && "?"}
          </span>
          <Captured pieces={captured} color={opponentColor} />
          {advantage > 0 && (
            <span className="text-slate-300 font-semibold" dir="ltr">
              +{advantage}
            </span>
          )}
        </div>
      </div>
      {clock != null && (
        <div
          className={`px-3 py-1.5 rounded-lg text-xl font-mono font-bold tabular-nums min-w-[5.5rem] text-center ${
            lowTime
              ? "bg-rose-500/25 text-rose-100 ring-1 ring-rose-400/50"
              : ticking
                ? "bg-amber-400 text-slate-950"
                : "bg-white/5 text-slate-300"
          }`}
          role="timer"
          aria-label={t("clock_for", { side: t(side === "white" ? "color_white" : "color_black") })}
          dir="ltr"
        >
          {clockText(clock)}
        </div>
      )}
    </div>
  );
}
