import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLanguage } from "../../context/LanguageContext";
import api from "../../api";
import NewsCard from "../../components/NewsCard";
import Pagination from "../../components/Pagination";

export default function NewsPage() {
  const { t } = useTranslation();
  const { lang } = useLanguage();
  const [news, setNews] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.get(`/news?lang=${lang}&page=${page}&per_page=12`)
      .then((r) => { setNews(r.data.news || []); setTotalPages(r.data.pages || 1); })
      .finally(() => setLoading(false));
  }, [lang, page]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <div className="mb-8">
        <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">{t("latest_news")}</h1>
        <p className="text-slate-400 mt-1">{t("welcome_desc")}</p>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="surface aspect-[16/13] shimmer" />
          ))}
        </div>
      ) : news.length > 0 ? (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {news.map((n) => <NewsCard key={n.id} item={n} />)}
          </div>
          <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />
        </>
      ) : (
        <p className="text-center text-slate-500 py-16">{t("no_results")}</p>
      )}
    </div>
  );
}
