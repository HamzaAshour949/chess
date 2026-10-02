import { useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { apiError } from "../../api";
import { useUserAuth } from "../../context/UserAuthContext";
import { useLanguage } from "../../context/LanguageContext";
import { useDocumentTitle } from "../../hooks/useDocumentTitle";
import AuthShell, { FormError } from "../../components/AuthShell";
import PasswordInput from "../../components/ui/PasswordInput";

/** Only same-site paths are followed after sign-in; anything else goes to /play. */
function safeReturn(from) {
  return typeof from === "string" && from.startsWith("/") && !from.startsWith("//") ? from : "/play";
}

export default function LoginUserPage() {
  const { t } = useTranslation();
  const { lang } = useLanguage();
  const { user, login } = useUserAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const returnTo = safeReturn(location.state?.from);
  useDocumentTitle(t("sign_in"));

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (user) return <Navigate to={returnTo} replace />;

  const submit = async (event) => {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      await login(identifier.trim(), password, lang);
      navigate(returnTo, { replace: true });
    } catch (err) {
      const data = err.response?.data;
      // The server says why with a machine-readable code; the details sit
      // under `details`, not at the top level.
      if (data?.code === "email_unverified") {
        navigate(`/verify?email=${encodeURIComponent(data.details?.email ?? identifier)}`, {
          state: { from: returnTo, resent: true },
        });
        return;
      }
      if (data?.code === "account_banned") {
        const reason = data.details?.ban_reason;
        setError(`${t("account_suspended")}${reason ? ` — ${reason}` : ""}`);
        return;
      }
      setError(err.response?.status === 401 ? t("invalid_credentials") : apiError(err, t("action_failed")));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell
      title={t("login_title")}
      subtitle={t("login_subtitle")}
      footer={
        <>
          {t("no_account")}{" "}
          <Link to="/register" state={location.state} className="text-amber-400 hover:text-amber-300 font-semibold">
            {t("sign_up")}
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        <div>
          <label htmlFor="identifier" className="block text-xs font-semibold text-slate-300 mb-1.5">
            {t("identifier")}
          </label>
          <input
            id="identifier"
            className="input"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            required
            autoFocus
            dir="ltr"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
          />
        </div>
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label htmlFor="password" className="block text-xs font-semibold text-slate-300">
              {t("password")}
            </label>
            <Link to="/forgot-password" state={{ email: identifier.includes("@") ? identifier : "" }} className="text-xs text-amber-400 hover:text-amber-300">
              {t("forgot_password")}
            </Link>
          </div>
          <PasswordInput id="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>

        <FormError>{error}</FormError>

        <button type="submit" disabled={busy || !identifier.trim() || !password} className="btn btn-primary btn-lg w-full">
          {busy ? t("signing_in") : t("sign_in")}
        </button>
      </form>
    </AuthShell>
  );
}
