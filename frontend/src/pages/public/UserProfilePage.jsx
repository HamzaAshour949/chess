import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import api, { apiError } from "../../api";
import { useUserAuth } from "../../context/UserAuthContext";
import { useDocumentTitle } from "../../hooks/useDocumentTitle";
import { useFetch } from "../../hooks/useFetch";
import { useToast } from "../../components/ui/Toaster";
import { useConfirm } from "../../components/ui/Dialog";
import Avatar from "../../components/Avatar";
import GameRow from "../../components/GameRow";
import MiniBoard from "../../components/MiniBoard";
import RatingChart from "../../components/RatingChart";
import { formatDate, isolate, nameOf } from "../../lib/format";
import NotFoundPage from "./NotFoundPage";

function Stat({ label, value, sub }) {
  return (
    <div className="surface-2 p-4">
      <div className="text-xs text-slate-400 uppercase tracking-wider">{label}</div>
      <div className="text-2xl font-extrabold text-white tabular-nums mt-1">{value}</div>
      {sub && <div className="text-xs text-slate-500 mt-0.5">{sub}</div>}
    </div>
  );
}

/** A player's public page: record, rating history, live and recent games. */
export default function UserProfilePage() {
  const { username } = useParams();
  const { t, i18n } = useTranslation();
  const { user: viewer } = useUserAuth();
  const { toast } = useToast();
  const confirm = useConfirm();
  const navigate = useNavigate();

  const base = `/users/${encodeURIComponent(username)}`;
  const [gamesPage, setGamesPage] = useState({ for: username, page: 1 });
  const page = gamesPage.for === username ? gamesPage.page : 1;
  const { data: profile, status, reload } = useFetch(base);
  const { data: history } = useFetch(`${base}/rating-history`);
  const { data: gamesData } = useFetch(`${base}/games?page=${page}&per_page=10`);
  const games = gamesData ?? { games: [], page: 1, pages: 1 };
  const missing = status === 404;
  const loadGames = (next) => setGamesPage({ for: username, page: next });
  const load = reload;

  const person = profile?.user;
  useDocumentTitle(person ? nameOf(person, t) : t("profile"));

  if (missing) return <NotFoundPage title={t("player_not_found")} body={t("player_not_found_body")} />;

  if (!profile) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-10 space-y-4" aria-busy="true">
        <div className="surface-elev h-40 shimmer" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="surface-2 h-24 shimmer" />
          ))}
        </div>
      </div>
    );
  }

  const decided = person.games_won + person.games_lost + person.games_drawn;
  const winRate = decided ? Math.round((person.games_won / decided) * 100) : null;
  const rel = profile.relationship;

  const toggleBlock = async () => {
    if (!rel) return;
    if (!rel.blocked_by_me) {
      const ok = await confirm({
        title: t("block_title", { name: isolate(nameOf(person, t)) }),
        body: t("block_body"),
        confirmLabel: t("block"),
        tone: "danger",
      });
      if (!ok) return;
    }
    try {
      if (rel.blocked_by_me) await api.delete(`/messages/blocks/${person.id}`);
      else await api.post(`/messages/blocks/${person.id}`);
      load();
    } catch (error) {
      toast({ tone: "error", title: apiError(error, t("action_failed")) });
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 sm:py-10 space-y-6">
      <header className="surface-elev p-6 sm:p-8 flex flex-col sm:flex-row sm:items-center gap-5">
        <Avatar user={person} size={96} online={profile.online} />
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white truncate"><bdi>{nameOf(person, t)}</bdi></h1>
            {profile.linked_player && (
              <Link to={`/players/${profile.linked_player.id}`} className="chip chip-gold hover:bg-amber-500/30">
                {profile.linked_player.title ? `${profile.linked_player.title} · ` : ""}
                {i18n.language === "ar" ? profile.linked_player.name_ar : profile.linked_player.name_en}
              </Link>
            )}
          </div>
          <p className="text-slate-400 text-sm mt-1">
            <bdi>@{person.username}</bdi>
            {person.country && ` · ${person.country}`} · {t("member_since", { date: formatDate(person.created_at, i18n.language) })}
          </p>
          <p className={`text-xs mt-1 ${profile.online ? "text-emerald-400" : "text-slate-500"}`}>
            {profile.online ? `● ${t("online_now")}` : t("offline")}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {profile.is_me ? (
            <Link to="/settings" className="btn btn-ghost">
              {t("edit_profile")}
            </Link>
          ) : viewer && rel ? (
            <>
              {rel.can_challenge && (
                <button type="button" className="btn btn-primary" onClick={() => navigate(`/play?opponent=${person.username}`)}>
                  ♞ {t("challenge")}
                </button>
              )}
              {rel.can_message && (
                <Link to={`/messages/${person.id}`} className="btn btn-ghost">
                  ✉ {t("message")}
                </Link>
              )}
              <button type="button" className="btn btn-ghost" onClick={toggleBlock}>
                {rel.blocked_by_me ? t("unblock") : t("block")}
              </button>
            </>
          ) : !viewer ? (
            <Link to="/login" state={{ from: `/u/${person.username}` }} className="btn btn-primary">
              {t("sign_in_to_challenge")}
            </Link>
          ) : null}
        </div>
      </header>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Stat label={t("online_rating")} value={`${person.online_rating}${person.is_provisional ? "?" : ""}`} sub={person.is_provisional ? t("provisional") : null} />
        <Stat label={t("games_played")} value={person.games_played} />
        <Stat
          label={t("record")}
          value={<span dir="ltr">{`${person.games_won} / ${person.games_lost} / ${person.games_drawn}`}</span>}
          sub={t("record_legend")}
        />
        <Stat label={t("win_rate")} value={winRate === null ? "—" : `${winRate}%`} />
      </div>

      <section className="surface-elev p-5">
        <RatingChart points={history?.points} />
      </section>

      {profile.active_games.length > 0 && (
        <section className="surface-elev p-5">
          <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-rose-400 animate-pulse" aria-hidden="true" />
            {t("playing_now")}
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {profile.active_games.map((game) => (
              <Link key={game.id} to={`/play/${game.id}`} className="block group">
                <MiniBoard
                  fen={game.fen}
                  orientation={game.black_user?.id === person.id ? "black" : "white"}
                  lastMove={game.moves?.split(" ").at(-1)}
                />
                <span className="block text-xs text-slate-400 mt-1.5 truncate group-hover:text-white">
                  {t("vs")} <bdi>{nameOf(game.white_user?.id === person.id ? game.black_user : game.white_user, t)}</bdi>
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="surface-elev p-5">
        <h2 className="text-lg font-bold text-white mb-2">{t("recent_games")}</h2>
        {games.games.length === 0 ? (
          <p className="text-sm text-slate-500 py-6 text-center">{t("no_games_yet_profile")}</p>
        ) : (
          <>
            <ul className="divide-y divide-white/5">
              {games.games.map((game) => (
                <GameRow key={game.id} game={game} perspectiveId={person.id} />
              ))}
            </ul>
            {games.pages > 1 && (
              <div className="flex items-center justify-between mt-3 text-sm">
                <button type="button" className="btn btn-ghost px-3 py-1.5" disabled={games.page <= 1} onClick={() => loadGames(games.page - 1)}>
                  {t("previous")}
                </button>
                <span className="text-slate-400">
                  {t("page")} {games.page} {t("of")} {games.pages}
                </span>
                <button type="button" className="btn btn-ghost px-3 py-1.5" disabled={games.page >= games.pages} onClick={() => loadGames(games.page + 1)}>
                  {t("next")}
                </button>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
