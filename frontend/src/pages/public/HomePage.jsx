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
  const [playerOfMonth, setPlayerOfMonth] = useState(null);
  const [tournamentWinner, setTournamentWinner] = useState(null);
  const [featuredNews, setFeaturedNews] = useState(null);

  useEffect(() => {
    api.get(`/players?lang=${lang}&per_page=8`).then((r) => setPlayers(r.data.players));
    api.get(`/news?lang=${lang}&per_page=7`).then((r) => {
      const items = r.data.news;
      const feat = items.find((n) => n.is_featured);
      if (feat) {
        setFeaturedNews(feat);
        setNews(items.filter((n) => n.id !== feat.id));
      } else {
        setFeaturedNews(items[0] || null);
        setNews(items.slice(1));
      }
    });
    api.get(`/players/homepage?lang=${lang}`).then((r) => {
      setPlayerOfMonth(r.data.player_of_month);
      setTournamentWinner(r.data.tournament_winner);
    });
  }, [lang]);

  const featured = featuredNews;
  const sideNews = news.slice(0, 3);
  const moreNews = news.slice(3, 6);

  return (
    <div>
      {/* Hero */}
      <section className="relative bg-gray-900 overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute inset-0" style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.4'%3E%3Crect x='0' y='0' width='30' height='30'/%3E%3Crect x='30' y='30' width='30' height='30'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
            backgroundSize: '60px 60px',
          }} />
        </div>
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 sm:py-32 text-center">
          <div className="inline-flex items-center px-4 py-1.5 bg-amber-600/20 rounded-full text-amber-400 text-sm font-medium mb-6 border border-amber-600/30">
            ♔ {t("hero_badge")}
          </div>
          <h1 className="text-4xl sm:text-6xl lg:text-7xl font-extrabold text-white mb-6 tracking-tight">
            {t("welcome")}
          </h1>
          <p className="text-lg sm:text-xl text-gray-300 max-w-3xl mx-auto mb-10 leading-relaxed">
            {t("welcome_desc")}
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              to="/news"
              className="px-8 py-4 bg-amber-600 hover:bg-amber-500 rounded-xl font-semibold text-white transition-all shadow-lg shadow-amber-600/25 hover:shadow-amber-500/40 text-lg"
            >
              {t("see_all_news")}
            </Link>
            <Link
              to="/players"
              className="px-8 py-4 bg-white/10 hover:bg-white/20 rounded-xl font-semibold text-white transition-all backdrop-blur border border-white/20 text-lg"
            >
              {t("see_all_players")}
            </Link>
          </div>
          <div className="mt-16 grid grid-cols-3 gap-8 max-w-md mx-auto">
            <div>
              <div className="text-3xl sm:text-4xl font-bold text-amber-500">{players.length}+</div>
              <div className="text-sm text-gray-400 mt-1">{t("players")}</div>
            </div>
            <div>
              <div className="text-3xl sm:text-4xl font-bold text-amber-500">{news.length}+</div>
              <div className="text-sm text-gray-400 mt-1">{t("news")}</div>
            </div>
            <div>
              <div className="text-3xl sm:text-4xl font-bold text-amber-500">20+</div>
              <div className="text-sm text-gray-400 mt-1">{t("countries")}</div>
            </div>
          </div>
        </div>
      </section>

      {/* Featured News Spotlight */}
      {featured && (
        <section className="bg-gray-900">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
            <div className="flex items-center gap-3 mb-8">
              <div className="h-8 w-1 bg-amber-500 rounded-full" />
              <h2 className="text-2xl sm:text-3xl font-bold text-white">{t("featured_news")}</h2>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
              {/* Main featured story */}
              <Link
                to={`/news/${featured.id}`}
                className="lg:col-span-3 group relative rounded-2xl overflow-hidden bg-gray-800 min-h-[400px] flex flex-col justify-end"
              >
                {featured.image_url && (
                  <img
                    src={featured.image_url}
                    alt={featured.title}
                    className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent" />
                <div className="relative p-6 sm:p-8">
                  <span className="inline-block px-3 py-1 bg-amber-600 text-white text-xs font-bold rounded-full mb-3 uppercase tracking-wider">
                    {t("featured")}
                  </span>
                  <h3 className="text-2xl sm:text-3xl font-bold text-white mb-3 group-hover:text-amber-400 transition-colors leading-tight">
                    {featured.title}
                  </h3>
                  {featured.content && (
                    <p className="text-gray-300 line-clamp-2 text-base">
                      {featured.content.replace(/<[^>]*>/g, "").slice(0, 200)}
                    </p>
                  )}
                  <div className="flex items-center gap-3 mt-4 text-sm text-gray-400">
                    {featured.published_at && (
                      <span>{new Date(featured.published_at).toLocaleDateString()}</span>
                    )}
                    {featured.player_name && (
                      <span className="bg-white/10 px-2 py-0.5 rounded">{featured.player_name}</span>
                    )}
                  </div>
                </div>
              </Link>

              {/* Side stories */}
              <div className="lg:col-span-2 flex flex-col gap-4">
                {sideNews.map((n) => (
                  <Link
                    key={n.id}
                    to={`/news/${n.id}`}
                    className="group flex gap-4 bg-gray-800 rounded-xl p-4 hover:bg-gray-750 transition-colors border border-gray-700/50"
                  >
                    {n.image_url && (
                      <div className="w-28 h-20 rounded-lg overflow-hidden flex-shrink-0 bg-gray-700">
                        <img src={n.image_url} alt={n.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <h4 className="font-semibold text-white text-sm line-clamp-2 group-hover:text-amber-400 transition-colors">
                        {n.title}
                      </h4>
                      <div className="flex items-center gap-2 mt-2 text-xs text-gray-400">
                        {n.published_at && <span>{new Date(n.published_at).toLocaleDateString()}</span>}
                        {n.player_name && <span>• {n.player_name}</span>}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Player of the Month + Tournament Winner */}
      <section className="bg-gradient-to-b from-gray-900 to-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Player of the Month */}
            {playerOfMonth && (
              <Link
                to={`/players/${playerOfMonth.id}`}
                className="group relative rounded-2xl overflow-hidden bg-gradient-to-br from-amber-600 to-amber-800 p-1"
              >
                <div className="bg-gray-900 rounded-xl p-6 sm:p-8 h-full">
                  <div className="flex items-center gap-2 mb-6">
                    <span className="text-3xl">🏆</span>
                    <div>
                      <div className="text-amber-400 text-xs font-bold uppercase tracking-widest">{t("player_of_month")}</div>
                      <div className="text-gray-500 text-xs">{t("player_of_month_sub")}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-5">
                    <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full overflow-hidden ring-4 ring-amber-600/50 flex-shrink-0 bg-gray-800">
                      {playerOfMonth.image_url ? (
                        <img src={playerOfMonth.image_url} alt={playerOfMonth.name} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-4xl text-gray-500">♟</div>
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        {playerOfMonth.title && (
                          <span className="text-xs font-bold px-2 py-0.5 bg-amber-600/20 text-amber-400 rounded">{playerOfMonth.title}</span>
                        )}
                      </div>
                      <h3 className="text-xl sm:text-2xl font-bold text-white group-hover:text-amber-400 transition-colors">{playerOfMonth.name}</h3>
                      {playerOfMonth.country && <p className="text-gray-400 text-sm mt-1">{playerOfMonth.country}</p>}
                      {playerOfMonth.rating && (
                        <div className="mt-3 inline-flex items-center gap-1.5 bg-gray-800 px-3 py-1 rounded-lg">
                          <span className="text-gray-500 text-xs">{t("rating")}</span>
                          <span className="text-white font-bold">{playerOfMonth.rating}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </Link>
            )}

            {/* Tournament Winner */}
            {tournamentWinner && (
              <Link
                to={`/players/${tournamentWinner.id}`}
                className="group relative rounded-2xl overflow-hidden bg-gradient-to-br from-blue-600 to-blue-800 p-1"
              >
                <div className="bg-gray-900 rounded-xl p-6 sm:p-8 h-full">
                  <div className="flex items-center gap-2 mb-6">
                    <span className="text-3xl">👑</span>
                    <div>
                      <div className="text-blue-400 text-xs font-bold uppercase tracking-widest">{t("tournament_winner")}</div>
                      <div className="text-gray-500 text-xs">{t("tournament_winner_sub")}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-5">
                    <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full overflow-hidden ring-4 ring-blue-600/50 flex-shrink-0 bg-gray-800">
                      {tournamentWinner.image_url ? (
                        <img src={tournamentWinner.image_url} alt={tournamentWinner.name} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-4xl text-gray-500">♟</div>
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        {tournamentWinner.title && (
                          <span className="text-xs font-bold px-2 py-0.5 bg-blue-600/20 text-blue-400 rounded">{tournamentWinner.title}</span>
                        )}
                      </div>
                      <h3 className="text-xl sm:text-2xl font-bold text-white group-hover:text-blue-400 transition-colors">{tournamentWinner.name}</h3>
                      {tournamentWinner.country && <p className="text-gray-400 text-sm mt-1">{tournamentWinner.country}</p>}
                      {tournamentWinner.rating && (
                        <div className="mt-3 inline-flex items-center gap-1.5 bg-gray-800 px-3 py-1 rounded-lg">
                          <span className="text-gray-500 text-xs">{t("rating")}</span>
                          <span className="text-white font-bold">{tournamentWinner.rating}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </Link>
            )}
          </div>
        </div>
      </section>

      {/* More News Grid */}
      {moreNews.length > 0 && (
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
              <div className="h-8 w-1 bg-amber-500 rounded-full" />
              <h2 className="text-2xl sm:text-3xl font-bold text-gray-900">{t("latest_news")}</h2>
            </div>
            <Link to="/news" className="text-amber-600 hover:text-amber-700 font-medium flex items-center gap-1">
              {t("see_all_news")} <span aria-hidden="true">→</span>
            </Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {moreNews.map((n) => (
              <NewsCard key={n.id} item={n} />
            ))}
          </div>
        </section>
      )}

      {/* Featured Players */}
      <section className="bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
              <div className="h-8 w-1 bg-amber-500 rounded-full" />
              <h2 className="text-2xl sm:text-3xl font-bold text-gray-900">{t("featured_players")}</h2>
            </div>
            <Link to="/players" className="text-amber-600 hover:text-amber-700 font-medium flex items-center gap-1">
              {t("see_all_players")} <span aria-hidden="true">→</span>
            </Link>
          </div>
          {players.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {players.slice(0, 8).map((p) => (
                <PlayerCard key={p.id} player={p} />
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
