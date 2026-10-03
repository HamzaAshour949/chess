import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { apiError, fieldErrors } from "../../api";
import { useUserAuth } from "../../context/UserAuthContext";
import { useDocumentTitle } from "../../hooks/useDocumentTitle";
import { useToast } from "../../components/ui/Toaster";
import AuthShell, { FormError } from "../../components/AuthShell";
import CodeInput from "../../components/CodeInput";
import PasswordInput from "../../components/ui/PasswordInput";

export default function ResetPasswordPage() {
  const { t } = useTranslation();
  const { resetPassword } = useUserAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  useDocumentTitle(t("reset_password_title"));

  const [email, setEmail] = useState(params.get("email") ?? "");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event) => {
    event.preventDefault();
    if (password !== repeat) {
      setError(t("passwords_dont_match"));
      return;
    }
    setBusy(true);
    setError("");
    try {
      await resetPassword(email.trim(), code, password);
      toast({ tone: "success", title: t("password_reset_done") });
      navigate("/play", { replace: true });
    } catch (err) {
      const fields = fieldErrors(err);
      setError(fields.password || apiError(err, t("invalid_code")));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell
      icon="🔑"
      title={t("reset_password_title")}
      subtitle={t("reset_password_subtitle")}
      footer={
        <Link to="/forgot-password" state={{ email }} className="hover:text-slate-200">
          {t("send_new_code")}
        </Link>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label htmlFor="email" className="block text-xs font-semibold text-slate-300 mb-1.5">
            {t("email")}
          </label>
          <input id="email" type="email" className="input" autoComplete="email" required dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div>
          <span className="block text-xs font-semibold text-slate-300 mb-1.5">{t("verification_code")}</span>
          <CodeInput value={code} onChange={setCode} disabled={busy} />
        </div>
        <div>
          <label htmlFor="new_password" className="block text-xs font-semibold text-slate-300 mb-1.5">
            {t("new_password")}
          </label>
          <PasswordInput id="new_password" autoComplete="new-password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
          <p className="text-xs text-slate-500 mt-1">{t("password_hint")}</p>
        </div>
        <div>
          <label htmlFor="repeat_password" className="block text-xs font-semibold text-slate-300 mb-1.5">
            {t("repeat_password")}
          </label>
          <PasswordInput id="repeat_password" autoComplete="new-password" required value={repeat} onChange={(e) => setRepeat(e.target.value)} />
        </div>
        <FormError>{error}</FormError>
        <button
          type="submit"
          disabled={busy || code.length !== 6 || password.length < 8 || !email.trim()}
          className="btn btn-primary btn-lg w-full"
        >
          {busy ? t("saving") : t("reset_password")}
        </button>
        <p className="text-center text-xs text-slate-500">{t("reset_code_note")}</p>
      </form>
    </AuthShell>
  );
}
