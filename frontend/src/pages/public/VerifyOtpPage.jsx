import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { apiError } from "../../api";
import { useUserAuth } from "../../context/UserAuthContext";
import { useLanguage } from "../../context/LanguageContext";
import { useDocumentTitle } from "../../hooks/useDocumentTitle";
import AuthShell, { FormError, FormNotice } from "../../components/AuthShell";
import CodeInput from "../../components/CodeInput";

const RESEND_SECONDS = 60;

export default function VerifyOtpPage() {
  const { t } = useTranslation();
  const { lang } = useLanguage();
  const { verifyOtp, resendOtp } = useUserAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const email = params.get("email") || "";
  useDocumentTitle(t("verify_title"));

  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState(location.state?.resent ? t("code_sent_on_login") : "");
  // A code was just sent by registering or signing in; the server enforces
  // the same cooldown, this only avoids a pointless click.
  const [cooldown, setCooldown] = useState(RESEND_SECONDS);

  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const id = setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(id);
  }, [cooldown]);

  const submit = async (value = code) => {
    if (!email || value.length !== 6 || busy) return;
    setBusy(true);
    setError("");
    try {
      await verifyOtp(email, value);
      const from = location.state?.from;
      navigate(typeof from === "string" && from.startsWith("/") ? from : "/play", { replace: true });
    } catch (err) {
      setError(apiError(err, t("invalid_code")));
      setCode("");
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    if (cooldown > 0 || !email) return;
    setInfo("");
    setError("");
    try {
      await resendOtp(email, lang);
      setInfo(t("code_resent"));
      setCooldown(RESEND_SECONDS);
    } catch (err) {
      setError(apiError(err, t("action_failed")));
    }
  };

  if (!email) {
    return (
      <AuthShell icon="✉" title={t("verify_title")} subtitle={t("verify_missing_email")}>
        <Link to="/register" className="btn btn-primary w-full">
          {t("register")}
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      icon="✉"
      title={t("verify_title")}
      subtitle={t("verify_subtitle", { email })}
      footer={
        <Link to="/login" className="hover:text-slate-200">
          ← {t("sign_in")}
        </Link>
      }
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
        className="space-y-5"
      >
        <CodeInput value={code} onChange={setCode} onComplete={submit} disabled={busy} />

        <FormError>{error}</FormError>
        <FormNotice>{info}</FormNotice>

        <button type="submit" disabled={busy || code.length !== 6} className="btn btn-primary btn-lg w-full">
          {busy ? t("verifying") : t("verify")}
        </button>

        <p className="text-center text-sm text-slate-400">
          {t("no_code")}{" "}
          <button
            type="button"
            onClick={resend}
            disabled={cooldown > 0}
            className="text-amber-400 hover:text-amber-300 disabled:text-slate-500 disabled:cursor-not-allowed font-medium"
          >
            {cooldown > 0 ? t("resend_in", { seconds: cooldown }) : t("resend_code")}
          </button>
        </p>
        <p className="text-center text-xs text-slate-500">{t("check_spam")}</p>
      </form>
    </AuthShell>
  );
}
