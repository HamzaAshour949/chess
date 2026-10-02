import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import Avatar from "./Avatar";
import { formatDate, nameOf, outcomeFor, tcLabel, terminationKey } from "../lib/format";

/**
 * One game in a history list, from the point of view of `perspectiveId`:
 * the opponent, the result for this player, how it ended and when.
 */
export default function GameRow({ game, perspectiveId }) {
  const { t, i18n } = useTranslation();
  const side = game.white_user?.id === perspectiveId ? "white" : "black";
  const opponent = side === "white" ? game.black_user : game.white_user;
  const outcome = outcomeFor(game, perspectiveId);
  const before = side === "white" ? game.white_rating_before : game.black_rating_before;
  const after = side === "white" ? game.white_rating_after : game.black_rating_after;
  const delta = game.rated && !game.voided && before != null && after != null ? after - before : null;
  const live = game.status === "active";
  const reason = terminationKey(game);

  const badge = live
    ? { cls: "chip-green", label: t("live_now") }
    : outcome === "win"
      ? { cls: "chip-green", label: t("result_win") }
      : outcome === "loss"
        ? { cls: "chip-red", label: t("result_loss") }
        : outcome === "draw"
          ? { cls: "chip-slate", label: t("result_draw") }
          : { cls: "chip-slate", label: t(reason ?? "term_aborted") };

  return (
    <li>
      <Link
        to={`/play/${game.id}`}
        className="flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-white/[0.04] transition"
      >
        <span className="text-lg w-5 text-center" aria-label={t(side === "white" ? "color_white" : "color_black")}>
          {side === "white" ? "♔" : "♚"}
        </span>
        <Avatar user={opponent} size={32} />
        <span className="flex-1 min-w-0">
          <span className="block text-white font-medium truncate">
            {t("vs")} <bdi>{nameOf(opponent, t)}</bdi>
            {opponent?.online_rating && <span className="text-slate-500 text-xs ms-1.5 tabular-nums">({opponent.online_rating})</span>}
          </span>
          <span className="block text-xs text-slate-400 truncate">
            {tcLabel(game.time_control_seconds, game.increment_seconds, t)} · {game.rated ? t("rated") : t("casual")}
            {reason && !live && ` · ${t(reason)}`} · {formatDate(game.ended_at || game.created_at, i18n.language)}
          </span>
        </span>
        {delta !== null && (
          <span className={`text-xs font-bold tabular-nums ${delta >= 0 ? "text-emerald-400" : "text-rose-400"}`} dir="ltr">
            {delta > 0 ? "+" : ""}
            {delta}
          </span>
        )}
        <span className={`chip ${badge.cls}`}>{badge.label}</span>
      </Link>
    </li>
  );
}
