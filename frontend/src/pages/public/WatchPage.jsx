import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import api from "../../api";

function tcLabel(sec, t) {
  if (!sec || sec === 0) return t("tc_unlimited");
  if (sec >= 60) return `${Math.round(sec / 60)} min`;
  return `${sec}s`;
}

export default function WatchPage() {
  const { t } = useTranslation();
  const [games, setGames] = useState([]);
  const [filters, setFilters] = useState({ min_rating: "", max_rating: "" });

  const load = useCallback(() => {
    const params = new URLSearchParams();
    if (filters.min_rating) params.set("min_rating", filters.min_rating);
    if (filters.max_rating) params.set("max_rating", filters.max_rating);
    api.get(`/games/live?${params.toString()}`).then((r) => setGames(r.data || []));
  }, [filters]);

  useEffect(() => {
    load();
    const i = setInterval(load, 4000);
    return () => clearInterval(i);
  }, [load]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <div className="mb-8">
        <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight flex items-center gap-3">
          <span className="inline-block w-3 h-3 rounded-full bg-rose-400 animate-pulse" />
          {t("live_games")}
        </h1>
        <p className="text-slate-400 mt-1">{t("watch_live_intro")}</p>
      </div>

      <div className="surface p-3 mb-4 flex flex-wrap gap-2 items-center text-xs">
        <input type="number" placeholder={t("min_rating")} value={filters.min_rating}
          onChange={(e) => setFilters({ ...filters, min_rating: e.target.value })}
          className="bg-white/5 border border-white/10 rounded px-2 py-1.5 text-slate-200 w-28" />
        <input type="number" placeholder={t("max_rating")} value={filters.max_rating}
          onChange={(e) => setFilters({ ...filters, max_rating: e.target.value })}
          className="bg-white/5 border border-white/10 rounded px-2 py-1.5 text-slate-200 w-28" />
        <span className="ms-auto text-slate-500">{games.length} {t("active_games").toLowerCase()}</span>
      </div>

      {games.length === 0 ? (
        <div className="surface-elev p-12 text-center text-slate-400">{t("no_live_games")}</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {games.map((g) => {
            const avg = Math.round(((g.white_user?.online_rating || 1200) + (g.black_user?.online_rating || 1200)) / 2);
            return (
              <Link key={g.id} to={`/play/${g.id}`}
                className="surface p-4 hover:border-amber-500/30 transition block">
                <div className="flex items-center justify-between mb-2 text-xs">
                  <span className="chip chip-slate">{tcLabel(g.time_control_seconds, t)}{g.increment_seconds > 0 ? ` +${g.increment_seconds}` : ""}</span>
                  <span className={`chip ${g.rated ? "chip-gold" : "chip-slate"}`}>{g.rated ? t("rated") : t("casual")}</span>
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-white font-semibold truncate flex items-center gap-1">♔ {g.white_user?.display_name || "—"}</span>
                    <span className="text-xs text-slate-400">{g.white_user?.online_rating || "—"}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-white font-semibold truncate flex items-center gap-1">♚ {g.black_user?.display_name || "—"}</span>
                    <span className="text-xs text-slate-400">{g.black_user?.online_rating || "—"}</span>
                  </div>
                </div>
                <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
                  <span>{g.move_count} ply</span>
                  <span>avg {avg}</span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
