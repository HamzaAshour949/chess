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

  if (!news) {
    return <div className="max-w-3xl mx-auto px-4 py-12"><div className="surface h-96 shimmer" /></div>;
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <article className="surface-elev overflow-hidden">
        {news.image_url && (
          <img src={news.image_url} alt={news.title} className="w-full h-64 sm:h-96 object-cover" />
        )}
        <div className="p-6 sm:p-10">
          <h1 className="text-3xl sm:text-4xl font-extrabold text-white mb-4 tracking-tight [text-wrap:balance]">
            {news.title}
          </h1>
          <div className="flex flex-wrap items-center gap-3 text-sm text-slate-400 mb-6 pb-4 border-b border-white/10">
            {news.published_at && <span>{new Date(news.published_at).toLocaleDateString()}</span>}
            {news.player_name && (
              <Link to={`/players/${news.player_id}`} className="chip chip-gold hover:bg-amber-500/30 transition">
                {news.player_name}
              </Link>
            )}
            <span className="chip chip-slate">
              {news.region === "both" ? t("region_both") : news.region === "en" ? t("region_en") : t("region_ar")}
            </span>
          </div>
          <div className="prose prose-invert max-w-none text-slate-200 leading-relaxed whitespace-pre-line">
            {news.content}
          </div>
        </div>
      </article>
    </div>
  );
}
