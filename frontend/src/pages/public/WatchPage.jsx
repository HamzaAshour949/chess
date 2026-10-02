import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import api from "../../api";
import { useLiveLobby } from "../../hooks/useLive";
import { useDocumentTitle } from "../../hooks/useDocumentTitle";
import Avatar from "../../components/Avatar";
import MiniBoard from "../../components/MiniBoard";
import { nameOf, speedOf, tcLabel } from "../../lib/format";

function Side({ user, symbol }) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-2 min-w-0">
      <span className="text-sm" aria-hidden="true">
        {symbol}
      </span>
      <Avatar user={user} size={20} />
      <span className="text-sm text-white font-medium truncate flex-1"><bdi>{nameOf(user, t)}</bdi></span>
      <span className="text-xs text-slate-400 tabular-nums">{user?.online_rating ?? "—"}</span>
    </div>
  );
}

export default function WatchPage() {
  const { t } = useTranslation();
  const [games, setGames] = useState(null);
  const [filters, setFilters] = useState({ min_rating: "", max_rating: "", speed: "any" });
  useDocumentTitle(t("live_games"));

  const load = useCallback(() => {
    const params = new URLSearchParams();
    if (filters.min_rating) params.set("min_rating", filters.min_rating);
    if (filters.max_rating) params.set("max_rating", filters.max_rating);
    api
      .get(`/games/live?${params}`)
      .then((r) => setGames(r.data || []))
      .catch(() => setGames((current) => current ?? []));
  }, [filters.min_rating, filters.max_rating]);

  useEffect(() => {
    const handle = setTimeout(load, 250);
    return () => clearTimeout(handle);
  }, [load]);

  // A game starting or ending is announced on the lobby channel.
  useLiveLobby(load);

  const visible = (games ?? []).filter(
    (g) => filters.speed === "any" || speedOf(g.time_control_seconds, g.increment_seconds) === filters.speed,
  );

  const input = "bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 text-slate-200 text-sm";

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
      <div className="mb-6">
        <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight flex items-center gap-3">
          <span className="inline-block w-3 h-3 rounded-full bg-rose-400 animate-pulse" aria-hidden="true" />
          {t("live_games")}
        </h1>
        <p className="text-slate-400 mt-1">{t("watch_live_intro")}</p>
      </div>

      <div className="surface p-3 mb-5 flex flex-wrap gap-2 items-center">
        <input
          type="number"
          inputMode="numeric"
          placeholder={t("min_rating")}
          aria-label={t("min_rating")}
          value={filters.min_rating}
          onChange={(e) => setFilters({ ...filters, min_rating: e.target.value })}
          className={`${input} w-32`}
        />
        <input
          type="number"
          inputMode="numeric"
          placeholder={t("max_rating")}
          aria-label={t("max_rating")}
          value={filters.max_rating}
          onChange={(e) => setFilters({ ...filters, max_rating: e.target.value })}
          className={`${input} w-32`}
        />
        <select
          aria-label={t("time_control")}
          value={filters.speed}
          onChange={(e) => setFilters({ ...filters, speed: e.target.value })}
          className={input}
        >
          <option value="any">{t("any_tc")}</option>
          {["bullet", "blitz", "rapid", "classical", "unlimited"].map((speed) => (
            <option key={speed} value={speed}>
              {t(`speed_${speed}`)}
            </option>
          ))}
        </select>
        <span className="ms-auto text-sm text-slate-500">{t("n_live_games", { count: visible.length })}</span>
      </div>

      {games === null ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="surface aspect-[4/5] shimmer" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <div className="surface-elev p-12 text-center text-slate-400">
          <div className="text-4xl mb-3 text-slate-600" aria-hidden="true">
            ♜
          </div>
          <p className="mb-4">{t("no_live_games")}</p>
          <Link to="/play" className="btn btn-primary">
            {t("play_now")}
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {visible.map((g) => (
            <Link key={g.id} to={`/play/${g.id}`} className="surface p-3 hover:border-amber-500/30 transition block group">
              <Side user={g.black_user} symbol="♚" />
              <MiniBoard fen={g.fen} lastMove={g.moves?.split(" ").at(-1)} className="my-2" />
              <Side user={g.white_user} symbol="♔" />
              <div className="mt-2 flex items-center justify-between text-xs">
                <span className="chip chip-slate">{tcLabel(g.time_control_seconds, g.increment_seconds, t)}</span>
                <span className={`chip ${g.rated ? "chip-gold" : "chip-slate"}`}>{g.rated ? t("rated") : t("casual")}</span>
                <span className="text-slate-500">{t("move_n", { n: Math.ceil(g.move_count / 2) || 1 })}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
