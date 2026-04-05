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
    api
      .get(`/news?lang=${lang}&page=${page}&per_page=12`)
      .then((r) => {
        setNews(r.data.news);
        setTotalPages(r.data.pages);
      })
      .finally(() => setLoading(false));
  }, [lang, page]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-3xl font-bold text-gray-900 mb-8">{t("latest_news")}</h1>

      {loading ? (
        <p className="text-center text-gray-500 py-12">{t("loading")}</p>
      ) : news.length > 0 ? (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {news.map((n) => (
              <NewsCard key={n.id} item={n} />
            ))}
          </div>
          <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />
        </>
      ) : (
        <p className="text-center text-gray-500 py-12">{t("no_results")}</p>
      )}
    </div>
  );
}
