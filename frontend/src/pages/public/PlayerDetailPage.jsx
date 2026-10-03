import { Link, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useLanguage } from "../../context/LanguageContext";
import { useDocumentTitle } from "../../hooks/useDocumentTitle";
import { useFetch } from "../../hooks/useFetch";
import NewsCard from "../../components/NewsCard";
import { formatDate } from "../../lib/format";
import NotFoundPage from "./NotFoundPage";

function ageFrom(dateOfBirth) {
  if (!dateOfBirth) return null;
  const born = new Date(dateOfBirth);
  const now = new Date();
  let age = now.getUTCFullYear() - born.getUTCFullYear();
  if (now.getUTCMonth() < born.getUTCMonth() || (now.getUTCMonth() === born.getUTCMonth() && now.getUTCDate() < born.getUTCDate())) age -= 1;
  return age;
}

export default function PlayerDetailPage() {
  const { id } = useParams();
  const { t } = useTranslation();
  const { lang } = useLanguage();
  const { data: player, status } = useFetch(`/players/${id}?lang=${lang}`);
  const { data: newsData } = useFetch(`/news?lang=${lang}&player_id=${id}&per_page=6`);
  const news = newsData?.news ?? [];
  const missing = [400, 404, 422].includes(status);
  useDocumentTitle(player?.name ?? t("players"));

  if (missing) return <NotFoundPage title={t("player_not_found")} body={t("player_not_found_body")} />;

  if (!player) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10" aria-busy="true">
        <div className="surface h-80 shimmer" />
      </div>
    );
  }

  const age = ageFrom(player.date_of_birth);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
      <Link to="/players" className="text-sm text-slate-400 hover:text-white inline-flex items-center gap-1 mb-4">
        <span className="rtl:hidden">←</span>
        <span className="hidden rtl:inline">→</span> {t("players")}
      </Link>

      <div className="surface-elev overflow-hidden">
        <div className="flex flex-col md:flex-row">
          <div className="md:w-80 lg:w-96 flex-shrink-0 relative bg-slate-900">
            {player.image_url ? (
              <img src={player.image_url} alt={player.name} className="w-full h-72 md:h-full object-cover" />
            ) : (
              <div className="w-full h-72 md:h-full flex items-center justify-center text-8xl text-slate-700">♟</div>
            )}
          </div>
          <div className="flex-1 p-6 sm:p-8">
            <div className="flex flex-wrap items-center gap-3 mb-2">
              {player.title && <span className="chip chip-gold">{player.title}</span>}
              {player.is_player_of_month && <span className="chip chip-gold">🏆 {t("player_of_month")}</span>}
              {player.is_tournament_winner && <span className="chip chip-blue">👑 {t("tournament_winner")}</span>}
            </div>
            <h1 className="text-2xl sm:text-4xl font-extrabold text-white tracking-tight mb-6">{player.name}</h1>

            <dl className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
              {player.rating != null && (
                <div className="surface-2 p-4">
                  <dt className="text-xs text-slate-400 uppercase tracking-wider">{t("rating")}</dt>
                  <dd className="text-2xl font-bold text-amber-400 tabular-nums">{player.rating}</dd>
                </div>
              )}
              {player.country && (
                <div className="surface-2 p-4">
                  <dt className="text-xs text-slate-400 uppercase tracking-wider">{t("country")}</dt>
                  <dd className="text-lg font-medium text-white">{player.country}</dd>
                </div>
              )}
              {player.date_of_birth && (
                <div className="surface-2 p-4">
                  <dt className="text-xs text-slate-400 uppercase tracking-wider">{t("date_of_birth")}</dt>
                  <dd className="text-lg font-medium text-white">
                    {formatDate(`${player.date_of_birth}T00:00:00Z`, lang)}
                    {age !== null && <span className="text-sm text-slate-400 ms-2">({t("age_n", { age })})</span>}
                  </dd>
                </div>
              )}
            </dl>

            {player.bio ? (
              <div>
                <h2 className="text-lg font-semibold text-white mb-2">{t("biography")}</h2>
                <p className="text-slate-300 leading-relaxed whitespace-pre-line">{player.bio}</p>
              </div>
            ) : (
              <p className="text-slate-500 text-sm">{t("no_biography")}</p>
            )}
          </div>
        </div>
      </div>

      {news.length > 0 && (
        <section className="mt-12">
          <h2 className="text-2xl font-bold text-white mb-6">{t("player_news")}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {news.map((n) => (
              <NewsCard key={n.id} item={n} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
