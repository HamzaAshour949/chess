import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useDocumentTitle } from "../../hooks/useDocumentTitle";

export default function NotFoundPage({ title, body }) {
  const { t } = useTranslation();
  useDocumentTitle(t("not_found_title"));

  return (
    <div className="max-w-lg mx-auto px-4 py-24 text-center animate-fade-up">
      <div className="text-7xl mb-6 text-slate-600" aria-hidden="true">
        ♘
      </div>
      <h1 className="text-3xl font-extrabold text-white mb-2">{title ?? t("not_found_title")}</h1>
      <p className="text-slate-400 mb-8">{body ?? t("not_found_body")}</p>
      <div className="flex justify-center gap-2">
        <Link to="/" className="btn btn-primary">
          {t("home")}
        </Link>
        <Link to="/play" className="btn btn-ghost">
          {t("play")}
        </Link>
      </div>
    </div>
  );
}
