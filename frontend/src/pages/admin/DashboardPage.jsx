import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import api from "../../api";
import { formatDate } from "../../lib/format";
import { PageHeader, Panel, Pill } from "./ui";

function Stat({ label, value, to, tone = "text-gray-900", note }) {
  const body = (
    <>
      <p className={`text-3xl font-bold tabular-nums ${tone}`}>{value ?? "—"}</p>
      <p className="text-sm text-gray-500 mt-1">{label}</p>
      {note && <p className="text-xs text-gray-400 mt-0.5">{note}</p>}
    </>
  );
  return to ? (
    <Link to={to} className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 hover:border-amber-400 transition-colors">
      {body}
    </Link>
  ) : (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">{body}</div>
  );
}

export default function DashboardPage() {
  const { t, i18n } = useTranslation();
  const [stats, setStats] = useState(null);
  const [recentNews, setRecentNews] = useState([]);

  useEffect(() => {
    // One counted query per statistic, server-side.
    api
      .get("/games/admin/stats")
      .then((r) => setStats(r.data))
      .catch(() => setStats({}));
    api
      .get("/news/admin?per_page=5")
      .then((r) => setRecentNews(r.data.news || []))
      .catch(() => {});
  }, []);

  const s = stats ?? {};

  return (
    <div>
      <PageHeader title={t("dashboard")} subtitle={t("dashboard_subtitle")} />

      {s.pending_link_requests > 0 && (
        <Link
          to="/admin/link-requests"
          className="flex items-center justify-between gap-3 bg-amber-50 border border-amber-200 text-amber-900 rounded-xl px-5 py-4 mb-6 hover:bg-amber-100 transition-colors"
        >
          <span className="font-medium">{t("pending_link_requests_banner", { count: s.pending_link_requests })}</span>
          <span className="text-sm font-semibold">{t("review")} →</span>
        </Link>
      )}

      <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">{t("platform")}</h2>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <Stat label={t("registered_users")} value={s.users} to="/admin/users" note={s.new_users_7d != null ? t("new_this_week", { count: s.new_users_7d }) : null} />
        <Stat label={t("active_games")} value={s.active_games} to="/admin/games" tone="text-rose-600" />
        <Stat label={t("games_today")} value={s.games_24h} />
        <Stat label={t("open_challenges")} value={s.open_games} />
        <Stat label={t("finished_games")} value={s.finished_games} />
        <Stat label={t("banned")} value={s.banned_users} to="/admin/users?status=banned" />
        <Stat label={t("unverified")} value={s.unverified_users} to="/admin/users?status=unverified" />
        <Stat label={t("link_requests")} value={s.pending_link_requests} to="/admin/link-requests" tone={s.pending_link_requests ? "text-amber-600" : "text-gray-900"} />
      </div>

      <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">{t("content")}</h2>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <Stat label={t("total_players")} value={s.players} to="/admin/players" />
        <Stat label={t("published_news")} value={s.published_news} to="/admin/news" />
        <Stat label={t("draft_news")} value={s.draft_news} to="/admin/news" />
        <Stat label={t("direct_messages")} value={s.direct_messages} to="/admin/messages" />
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-gray-900">{t("latest_news")}</h2>
            <Link to="/admin/news/new" className="text-sm font-semibold text-amber-700 hover:text-amber-800">
              + {t("add_news")}
            </Link>
          </div>
          <Panel className="divide-y divide-gray-100">
            {recentNews.map((n) => (
              <div key={n.id} className="px-4 py-3 flex items-center justify-between gap-3 hover:bg-gray-50">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{n.title_en || n.title_ar || "—"}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <Pill tone={n.published ? "green" : "gray"}>{n.published ? t("published") : t("unpublished")}</Pill>
                    <span className="text-xs text-gray-500">{formatDate(n.created_at, i18n.language)}</span>
                  </div>
                </div>
                <Link to={`/admin/news/${n.id}/edit`} className="text-amber-700 hover:text-amber-900 text-sm font-medium">
                  {t("edit")}
                </Link>
              </div>
            ))}
            {recentNews.length === 0 && <p className="text-center text-gray-500 py-6">{t("no_results")}</p>}
          </Panel>
        </div>
        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-3">{t("quick_actions")}</h2>
          <Panel className="p-2">
            {[
              { to: "/admin/players/new", label: t("add_player"), icon: "♟" },
              { to: "/admin/news/new", label: t("add_news"), icon: "📰" },
              { to: "/admin/link-requests", label: t("link_requests"), icon: "🔗" },
              { to: "/admin/strings", label: t("site_strings"), icon: "🔤" },
            ].map((action) => (
              <Link key={action.to} to={action.to} className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-100">
                <span className="w-6 text-center" aria-hidden="true">
                  {action.icon}
                </span>
                {action.label}
              </Link>
            ))}
          </Panel>
        </div>
      </div>
    </div>
  );
}
