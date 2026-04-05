import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import api from "../../api";

export default function DashboardPage() {
  const { t } = useTranslation();
  const [stats, setStats] = useState({ players: 0, news: 0, published: 0, drafts: 0 });
  const [recentNews, setRecentNews] = useState([]);

  useEffect(() => {
    Promise.all([
      api.get("/players?per_page=1"),
      api.get("/news/admin?per_page=5"),
    ]).then(([pRes, nRes]) => {
      const totalNews = nRes.data.total;
      const published = nRes.data.news.filter((n) => n.published).length;
      setRecentNews(nRes.data.news);
      // get full count
      if (totalNews > 5) {
        api.get(`/news/admin?per_page=${totalNews}`).then((allRes) => {
          const pub = allRes.data.news.filter((n) => n.published).length;
          setStats({
            players: pRes.data.total,
            news: totalNews,
            published: pub,
            drafts: totalNews - pub,
          });
        });
      } else {
        setStats({
          players: pRes.data.total,
          news: totalNews,
          published,
          drafts: totalNews - published,
        });
      }
    });
  }, []);

  const cards = [
    { label: t("total_players"), value: stats.players, color: "bg-blue-500", icon: "♟" },
    { label: t("total_news"), value: stats.news, color: "bg-amber-500", icon: "📰" },
    { label: t("published_news"), value: stats.published, color: "bg-green-500", icon: "✓" },
    { label: t("draft_news"), value: stats.drafts, color: "bg-gray-500", icon: "✎" },
  ];

  const quickActions = [
    { to: "/admin/players/new", label: t("add_player"), icon: "♟", color: "bg-blue-50 text-blue-700 hover:bg-blue-100" },
    { to: "/admin/news/new", label: t("add_news"), icon: "📰", color: "bg-amber-50 text-amber-700 hover:bg-amber-100" },
    { to: "/admin/strings", label: t("site_strings") || "Site Strings", icon: "🔤", color: "bg-purple-50 text-purple-700 hover:bg-purple-100" },
    { to: "/admin/players", label: t("manage_players"), icon: "📋", color: "bg-green-50 text-green-700 hover:bg-green-100" },
    { to: "/admin/news", label: t("manage_news"), icon: "📝", color: "bg-red-50 text-red-700 hover:bg-red-100" },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">{t("dashboard")}</h1>

      {/* Stats cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mb-8">
        {cards.map((card) => (
          <div key={card.label} className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <div className="flex items-center justify-between mb-4">
              <span className={`w-10 h-10 rounded-lg ${card.color} text-white flex items-center justify-center text-lg`}>
                {card.icon}
              </span>
            </div>
            <p className="text-3xl font-bold text-gray-900">{card.value}</p>
            <p className="text-sm text-gray-500 mt-1">{card.label}</p>
          </div>
        ))}
      </div>

      {/* Quick Actions */}
      <h2 className="text-lg font-semibold text-gray-900 mb-3">Quick Actions</h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-8">
        {quickActions.map((action) => (
          <Link
            key={action.to}
            to={action.to}
            className={`flex flex-col items-center gap-2 p-4 rounded-xl border border-gray-100 font-medium text-sm transition-colors ${action.color}`}
          >
            <span className="text-2xl">{action.icon}</span>
            {action.label}
          </Link>
        ))}
      </div>

      {/* Recent News */}
      <h2 className="text-lg font-semibold text-gray-900 mb-3">{t("latest_news")}</h2>
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="divide-y divide-gray-100">
          {recentNews.map((n) => (
            <div key={n.id} className="px-4 py-3 flex items-center justify-between hover:bg-gray-50">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">
                  {n.title_en || n.title_ar || "—"}
                </p>
                <div className="flex items-center gap-2 mt-1">
                  <span
                    className={`px-2 py-0.5 rounded text-xs font-medium ${
                      n.published ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-600"
                    }`}
                  >
                    {n.published ? t("published") : t("unpublished")}
                  </span>
                  {n.player_name && (
                    <span className="text-xs text-gray-500">{n.player_name}</span>
                  )}
                </div>
              </div>
              <Link
                to={`/admin/news/${n.id}/edit`}
                className="text-amber-600 hover:text-amber-800 text-sm font-medium ms-4"
              >
                {t("edit_news")}
              </Link>
            </div>
          ))}
          {recentNews.length === 0 && (
            <p className="text-center text-gray-500 py-6">{t("no_results")}</p>
          )}
        </div>
      </div>
    </div>
  );
}
