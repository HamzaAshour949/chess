import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useLanguage } from "../../context/LanguageContext";
import api from "../../api";
import NewsCard from "../../components/NewsCard";

export default function PlayerDetailPage() {
  const { id } = useParams();
  const { t } = useTranslation();
  const { lang } = useLanguage();
  const [player, setPlayer] = useState(null);
  const [news, setNews] = useState([]);

  useEffect(() => {
    api.get(`/players/${id}?lang=${lang}`).then((r) => setPlayer(r.data));
    api.get(`/news?lang=${lang}&player_id=${id}&per_page=6`).then((r) => setNews(r.data.news));
  }, [id, lang]);

  if (!player) return <p className="text-center py-12 text-gray-500">{t("loading")}</p>;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Player profile */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="flex flex-col md:flex-row">
          {/* Image */}
          <div className="md:w-80 lg:w-96 flex-shrink-0">
            {player.image_url ? (
              <img
                src={player.image_url}
                alt={player.name}
                className="w-full h-64 md:h-full object-cover"
              />
            ) : (
              <div className="w-full h-64 md:h-full flex items-center justify-center text-8xl text-gray-300 bg-gray-100">
                ♟
              </div>
            )}
          </div>

          {/* Info */}
          <div className="flex-1 p-6 sm:p-8">
            <div className="flex items-center gap-3 mb-4">
              {player.title && (
                <span className="text-sm font-bold px-3 py-1 bg-amber-100 text-amber-800 rounded-lg">
                  {player.title}
                </span>
              )}
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">{player.name}</h1>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
              {player.rating && (
                <div>
                  <span className="text-sm text-gray-500">{t("rating")}</span>
                  <p className="text-xl font-bold text-gray-900">{player.rating}</p>
                </div>
              )}
              {player.country && (
                <div>
                  <span className="text-sm text-gray-500">{t("country")}</span>
                  <p className="text-lg font-medium text-gray-900">{player.country}</p>
                </div>
              )}
              {player.date_of_birth && (
                <div>
                  <span className="text-sm text-gray-500">{t("date_of_birth")}</span>
                  <p className="text-lg font-medium text-gray-900">
                    {new Date(player.date_of_birth).toLocaleDateString()}
                  </p>
                </div>
              )}
            </div>

            {player.bio && (
              <div>
                <h2 className="text-lg font-semibold text-gray-900 mb-2">{t("biography")}</h2>
                <p className="text-gray-600 leading-relaxed whitespace-pre-line">{player.bio}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Player News */}
      {news.length > 0 && (
        <div className="mt-12">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">{t("player_news")}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {news.map((n) => (
              <NewsCard key={n.id} item={n} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
