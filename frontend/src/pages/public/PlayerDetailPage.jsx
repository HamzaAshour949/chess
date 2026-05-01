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
    api.get(`/news?lang=${lang}&player_id=${id}&per_page=6`).then((r) => setNews(r.data.news || []));
  }, [id, lang]);

  if (!player) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-12">
        <div className="surface h-72 shimmer" />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <div className="surface-elev overflow-hidden">
        <div className="flex flex-col md:flex-row">
          <div className="md:w-80 lg:w-96 flex-shrink-0 relative">
            {player.image_url ? (
              <img src={player.image_url} alt={player.name} className="w-full h-72 md:h-full object-cover" />
            ) : (
              <div className="w-full h-72 md:h-full flex items-center justify-center text-8xl text-slate-700 bg-slate-900">♟</div>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent md:bg-gradient-to-r md:from-transparent md:to-black/30" />
          </div>
          <div className="flex-1 p-6 sm:p-8">
            <div className="flex flex-wrap items-center gap-3 mb-4">
              {player.title && <span className="chip chip-gold">{player.title}</span>}
              <h1 className="text-2xl sm:text-4xl font-extrabold text-white tracking-tight">{player.name}</h1>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
              {player.rating != null && (
                <div className="surface-2 p-4">
                  <div className="text-xs text-slate-400 uppercase tracking-wider">{t("rating")}</div>
                  <div className="text-2xl font-bold text-amber-400">{player.rating}</div>
                </div>
              )}
              {player.country && (
                <div className="surface-2 p-4">
                  <div className="text-xs text-slate-400 uppercase tracking-wider">{t("country")}</div>
                  <div className="text-lg font-medium text-white">{player.country}</div>
                </div>
              )}
              {player.date_of_birth && (
                <div className="surface-2 p-4">
                  <div className="text-xs text-slate-400 uppercase tracking-wider">{t("date_of_birth")}</div>
                  <div className="text-lg font-medium text-white">
                    {new Date(player.date_of_birth).toLocaleDateString()}
                  </div>
                </div>
              )}
            </div>

            {player.bio && (
              <div>
                <h2 className="text-lg font-semibold text-white mb-2">{t("biography")}</h2>
                <p className="text-slate-300 leading-relaxed whitespace-pre-line">{player.bio}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {news.length > 0 && (
        <div className="mt-12">
          <div className="flex items-center gap-3 mb-6">
            <div className="h-7 w-1 bg-amber-500 rounded-full" />
            <h2 className="text-2xl font-bold text-white">{t("player_news")}</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {news.map((n) => <NewsCard key={n.id} item={n} />)}
          </div>
        </div>
      )}
    </div>
  );
}
