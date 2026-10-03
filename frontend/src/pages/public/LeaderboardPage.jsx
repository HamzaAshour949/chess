import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import api from "../../api";
import { useUserAuth } from "../../context/UserAuthContext";
import { useDocumentTitle } from "../../hooks/useDocumentTitle";
import Avatar from "../../components/Avatar";
import { nameOf } from "../../lib/format";

const MEDALS = ["🥇", "🥈", "🥉"];

export default function LeaderboardPage() {
  const { t } = useTranslation();
  const { user } = useUserAuth();
  const [users, setUsers] = useState(null);
  const [failed, setFailed] = useState(false);
  useDocumentTitle(t("leaderboard"));

  useEffect(() => {
    api
      .get("/games/leaderboard?limit=100")
      .then((r) => setUsers(r.data || []))
      .catch(() => {
        setFailed(true);
        setUsers([]);
      });
  }, []);

  const myRank = user && users ? users.findIndex((u) => u.id === user.id) : -1;

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">{t("leaderboard_title")}</h1>
          <p className="text-slate-400 mt-1">{t("leaderboard_subtitle")}</p>
        </div>
        {myRank >= 0 && <span className="chip chip-gold">{t("your_rank", { rank: myRank + 1 })}</span>}
      </div>

      <div className="surface-elev overflow-hidden">
        {users === null ? (
          <div className="p-6 space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-14 rounded-xl shimmer" />
            ))}
          </div>
        ) : users.length === 0 ? (
          <div className="p-12 text-center text-slate-400">
            <p className="mb-4">{failed ? t("load_failed") : t("leaderboard_empty")}</p>
            {!failed && (
              <Link to="/play" className="btn btn-primary">
                {t("play_now")}
              </Link>
            )}
          </div>
        ) : (
          <ol>
            {users.map((u, i) => {
              const me = u.id === user?.id;
              const decided = u.games_won + u.games_lost + u.games_drawn;
              return (
                <li key={u.id} className="border-b border-white/5 last:border-b-0">
                  <Link
                    to={`/u/${u.username}`}
                    className={`flex items-center gap-3 sm:gap-4 px-4 sm:px-5 py-3.5 transition ${
                      me ? "bg-amber-500/10" : i < 3 ? "bg-white/[0.02] hover:bg-white/[0.05]" : "hover:bg-white/[0.04]"
                    }`}
                  >
                    <span className="w-8 text-center font-extrabold text-lg text-slate-500 tabular-nums" aria-label={t("rank_n", { rank: i + 1 })}>
                      {MEDALS[i] ?? i + 1}
                    </span>
                    <Avatar user={u} size={40} />
                    <div className="flex-1 min-w-0">
                      <div className="text-white font-semibold truncate flex items-center gap-2">
                        <bdi>{nameOf(u, t)}</bdi>
                        {me && <span className="chip chip-gold !text-[10px] !py-0">{t("you")}</span>}
                        {u.linked_player_id && (
                          <span className="chip chip-gold !text-[10px] !py-0 hidden sm:inline-flex">
                            {u.linked_player_title ? `${u.linked_player_title} · ` : ""}
                            {u.linked_player_name}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-500 truncate">
                        <bdi>@{u.username}</bdi> · {t("n_games", { count: u.games_played })}
                        {decided > 0 && ` · ${Math.round((u.games_won / decided) * 100)}% ${t("win_rate").toLowerCase()}`}
                      </div>
                    </div>
                    <div className="text-end">
                      <div className="text-xl sm:text-2xl font-extrabold text-amber-400 tabular-nums">
                        {u.online_rating}
                        {u.is_provisional && <span className="text-slate-500 text-base">?</span>}
                      </div>
                      <div className="text-[11px] text-slate-500 tabular-nums" dir="ltr">
                        {u.games_won}W · {u.games_lost}L · {u.games_drawn}D
                      </div>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ol>
        )}
      </div>
      <p className="text-xs text-slate-500 mt-4">{t("provisional_note")}</p>
    </div>
  );
}
