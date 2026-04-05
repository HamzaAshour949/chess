import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useLanguage } from "../../context/LanguageContext";
import api from "../../api";

export default function NewsDetailPage() {
  const { id } = useParams();
  const { t } = useTranslation();
  const { lang } = useLanguage();
  const [news, setNews] = useState(null);

  useEffect(() => {
    api.get(`/news/${id}?lang=${lang}`).then((r) => setNews(r.data));
  }, [id, lang]);

  if (!news) return <p className="text-center py-12 text-gray-500">{t("loading")}</p>;

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <article className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {news.image_url && (
          <img
            src={news.image_url}
            alt={news.title}
            className="w-full h-48 sm:h-72 object-cover"
          />
        )}
        <div className="p-6 sm:p-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-4">{news.title}</h1>
          <div className="flex flex-wrap items-center gap-4 text-sm text-gray-500 mb-6 border-b border-gray-100 pb-4">
            {news.published_at && (
              <span>{new Date(news.published_at).toLocaleDateString()}</span>
            )}
            {news.player_name && (
              <Link
                to={`/players/${news.player_id}`}
                className="bg-amber-100 text-amber-800 px-2 py-0.5 rounded hover:bg-amber-200 transition-colors"
              >
                {news.player_name}
              </Link>
            )}
            <span className="bg-gray-100 px-2 py-0.5 rounded text-gray-600">
              {news.region === "both"
                ? t("region_both")
                : news.region === "en"
                ? t("region_en")
                : t("region_ar")}
            </span>
          </div>
          <div className="prose prose-gray max-w-none whitespace-pre-line leading-relaxed text-gray-700">
            {news.content}
          </div>
        </div>
      </article>
    </div>
  );
}
