import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import api from "../../api";

export default function LeaderboardPage() {
  const { t } = useTranslation();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/games/leaderboard")
      .then((r) => setUsers(r.data || []))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <div className="mb-8">
        <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">{t("leaderboard_title")}</h1>
        <p className="text-slate-400 mt-1">{t("leaderboard_subtitle")}</p>
      </div>

      <div className="surface-elev overflow-hidden">
        {loading ? (
          <div className="p-8"><div className="h-72 shimmer rounded-xl" /></div>
        ) : users.length === 0 ? (
          <div className="p-12 text-center text-slate-500">{t("no_results")}</div>
        ) : (
          <ol>
            {users.map((u, i) => (
              <li key={u.id}
                  className={`flex items-center gap-4 px-5 py-4 border-b border-white/5 last:border-b-0 ${i < 3 ? "bg-amber-500/5" : ""}`}>
                <span className={`w-9 text-center font-extrabold text-lg ${i === 0 ? "text-amber-400" : i === 1 ? "text-slate-300" : i === 2 ? "text-amber-700" : "text-slate-500"}`}>
                  {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : i + 1}
                </span>
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-slate-700 to-slate-800 flex items-center justify-center font-bold text-slate-200">
                  {(u.display_name || u.username || "?").charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-white font-semibold truncate flex items-center gap-2">
                    {u.display_name || u.username}
                    {u.linked_player_id && (
                      <Link to={`/players/${u.linked_player_id}`} className="chip chip-gold !text-[10px]">
                        {u.linked_player_title || "FIDE"} · {u.linked_player_name}
                      </Link>
                    )}
                  </div>
                  <div className="text-xs text-slate-500">@{u.username} · {u.games_played} {t("games_played")}</div>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-extrabold text-amber-400">{u.online_rating}</div>
                  <div className="text-xs text-slate-500">{u.is_provisional ? "?" : ""} {u.games_won}W / {u.games_lost}L / {u.games_drawn}D</div>
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
