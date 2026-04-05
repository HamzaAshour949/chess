import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useLanguage } from "../../context/LanguageContext";
import api from "../../api";
import PlayerCard from "../../components/PlayerCard";
import NewsCard from "../../components/NewsCard";

export default function HomePage() {
  const { t } = useTranslation();
  const { lang } = useLanguage();
  const [players, setPlayers] = useState([]);
  const [news, setNews] = useState([]);

  useEffect(() => {
    api.get(`/players?lang=${lang}&per_page=4`).then((r) => setPlayers(r.data.players));
    api.get(`/news?lang=${lang}&per_page=4`).then((r) => setNews(r.data.news));
  }, [lang]);

  return (
    <div>
      {/* Hero */}
      <section className="bg-gray-900 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-24 text-center">
          <h1 className="text-3xl sm:text-5xl font-bold mb-4">♔ {t("welcome")}</h1>
          <p className="text-lg sm:text-xl text-gray-300 max-w-2xl mx-auto">
            {t("welcome_desc")}
          </p>
          <div className="mt-8 flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              to="/players"
              className="px-6 py-3 bg-amber-600 hover:bg-amber-700 rounded-lg font-medium transition-colors"
            >
              {t("see_all_players")}
            </Link>
            <Link
              to="/news"
              className="px-6 py-3 bg-gray-700 hover:bg-gray-600 rounded-lg font-medium transition-colors"
            >
              {t("see_all_news")}
            </Link>
          </div>
        </div>
      </section>

      {/* Featured Players */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="flex items-center justify-between mb-8">
          <h2 className="text-2xl font-bold text-gray-900">{t("featured_players")}</h2>
          <Link to="/players" className="text-amber-600 hover:text-amber-700 text-sm font-medium">
            {t("see_all_players")} →
          </Link>
        </div>
        {players.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {players.map((p) => (
              <PlayerCard key={p.id} player={p} />
            ))}
          </div>
        ) : (
          <p className="text-gray-500 text-center py-8">{t("no_results")}</p>
        )}
      </section>

      {/* Latest News */}
      <section className="bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-2xl font-bold text-gray-900">{t("latest_news")}</h2>
            <Link to="/news" className="text-amber-600 hover:text-amber-700 text-sm font-medium">
              {t("see_all_news")} →
            </Link>
          </div>
          {news.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {news.map((n) => (
                <NewsCard key={n.id} item={n} />
              ))}
            </div>
          ) : (
            <p className="text-gray-500 text-center py-8">{t("no_results")}</p>
          )}
        </div>
      </section>
    </div>
  );
}
