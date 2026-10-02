import { Link, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useLanguage } from "../../context/LanguageContext";
import { useDocumentTitle } from "../../hooks/useDocumentTitle";
import { useToast } from "../../components/ui/Toaster";
import { useFetch } from "../../hooks/useFetch";
import { formatDate } from "../../lib/format";
import NotFoundPage from "./NotFoundPage";

export default function NewsDetailPage() {
  const { id } = useParams();
  const { t } = useTranslation();
  const { lang } = useLanguage();
  const { toast } = useToast();
  const { data: news, status } = useFetch(`/news/${id}?lang=${lang}`);
  const missing = [400, 404, 422].includes(status);
  useDocumentTitle(news?.title ?? t("news"));

  if (missing) return <NotFoundPage title={t("article_not_found")} body={t("article_not_found_body")} />;

  if (!news) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-10" aria-busy="true">
        <div className="surface h-96 shimmer" />
      </div>
    );
  }

  const share = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) await navigator.share({ title: news.title, url });
      else {
        await navigator.clipboard.writeText(url);
        toast({ tone: "success", title: t("link_copied") });
      }
    } catch {
      /* the share sheet was dismissed */
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
      <Link to="/news" className="text-sm text-slate-400 hover:text-white inline-flex items-center gap-1 mb-4">
        <span className="rtl:hidden">←</span>
        <span className="hidden rtl:inline">→</span> {t("latest_news")}
      </Link>
      <article className="surface-elev overflow-hidden">
        {news.image_url && <img src={news.image_url} alt="" className="w-full h-64 sm:h-96 object-cover" />}
        <div className="p-6 sm:p-10">
          {!news.published && <span className="chip chip-red mb-3">{t("unpublished")}</span>}
          <h1 className="text-3xl sm:text-4xl font-extrabold text-white mb-4 tracking-tight [text-wrap:balance]">{news.title}</h1>
          <div className="flex flex-wrap items-center gap-3 text-sm text-slate-400 mb-6 pb-4 border-b border-white/10">
            {news.published_at && <time dateTime={news.published_at}>{formatDate(news.published_at, lang)}</time>}
            {news.player_name && (
              <Link to={`/players/${news.player_id}`} className="chip chip-gold hover:bg-amber-500/30 transition">
                {news.player_name}
              </Link>
            )}
            <button type="button" onClick={share} className="ms-auto text-amber-400 hover:text-amber-300">
              {t("share")}
            </button>
          </div>
          {news.content ? (
            <div className="text-slate-200 text-lg leading-relaxed whitespace-pre-line">{news.content}</div>
          ) : (
            <p className="text-slate-500">{t("article_no_content")}</p>
          )}
        </div>
      </article>
    </div>
  );
}
