import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useLanguage } from "../../context/LanguageContext";
import { useDocumentTitle } from "../../hooks/useDocumentTitle";
import { useFetch } from "../../hooks/useFetch";
import NewsCard from "../../components/NewsCard";
import Pagination from "../../components/Pagination";

export default function NewsPage() {
  const { t } = useTranslation();
  const { lang } = useLanguage();
  const [params, setParams] = useSearchParams();
  const page = Math.max(1, Number(params.get("page")) || 1);
  const { data, error } = useFetch(`/news?lang=${lang}&page=${page}&per_page=12`);
  useDocumentTitle(t("news"));

  const goTo = (next) => {
    setParams({ page: String(next) });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const news = data?.news ?? [];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
      <div className="mb-8">
        <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">{t("latest_news")}</h1>
        <p className="text-slate-400 mt-1">{t("news_intro")}</p>
      </div>

      {!data && !error ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="surface aspect-[16/13] shimmer" />
          ))}
        </div>
      ) : news.length > 0 ? (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {news.map((n) => (
              <NewsCard key={n.id} item={n} />
            ))}
          </div>
          <Pagination currentPage={page} totalPages={data.pages || 1} onPageChange={goTo} />
        </>
      ) : (
        <p className="text-center text-slate-500 py-16">{error ? t("load_failed") : t("no_news_yet")}</p>
      )}
    </div>
  );
}
