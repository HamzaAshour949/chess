import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { apiError } from "../../api";
import { useUserAuth } from "../../context/UserAuthContext";
import { useLanguage } from "../../context/LanguageContext";
import { useDocumentTitle } from "../../hooks/useDocumentTitle";
import AuthShell, { FormError } from "../../components/AuthShell";

export default function ForgotPasswordPage() {
  const { t } = useTranslation();
  const { lang } = useLanguage();
  const { requestPasswordReset } = useUserAuth();
  const navigate = useNavigate();
  const location = useLocation();
  useDocumentTitle(t("forgot_password_title"));

  const [email, setEmail] = useState(location.state?.email ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await requestPasswordReset(email.trim(), lang);
      // The answer never says whether the address exists; the next page
      // explains that a code arrives only if it does.
      navigate(`/reset-password?email=${encodeURIComponent(email.trim())}`);
    } catch (err) {
      setError(apiError(err, t("action_failed")));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell
      icon="🔑"
      title={t("forgot_password_title")}
      subtitle={t("forgot_password_subtitle")}
      footer={
        <Link to="/login" className="hover:text-slate-200">
          ← {t("sign_in")}
        </Link>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label htmlFor="email" className="block text-xs font-semibold text-slate-300 mb-1.5">
            {t("email")}
          </label>
          <input
            id="email"
            type="email"
            className="input"
            autoComplete="email"
            required
            autoFocus
            dir="ltr"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <FormError>{error}</FormError>
        <button type="submit" disabled={busy || !email.trim()} className="btn btn-primary btn-lg w-full">
          {busy ? t("sending") : t("send_reset_code")}
        </button>
      </form>
    </AuthShell>
  );
}
