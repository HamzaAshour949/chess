import { useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { apiError, fieldErrors } from "../../api";
import { useUserAuth } from "../../context/UserAuthContext";
import { useLanguage } from "../../context/LanguageContext";
import { useDocumentTitle } from "../../hooks/useDocumentTitle";
import AuthShell, { FormError } from "../../components/AuthShell";
import PasswordInput from "../../components/ui/PasswordInput";

const USERNAME = /^[A-Za-z0-9_]{3,30}$/;

export default function RegisterPage() {
  const { t } = useTranslation();
  const { lang } = useLanguage();
  const { user, register } = useUserAuth();
  const navigate = useNavigate();
  const location = useLocation();
  useDocumentTitle(t("register"));

  const [form, setForm] = useState({ username: "", email: "", password: "", display_name: "", country: "" });
  const [errors, setErrors] = useState({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to="/play" replace />;

  const set = (key) => (event) => {
    setForm({ ...form, [key]: event.target.value });
    if (errors[key]) setErrors({ ...errors, [key]: undefined });
  };

  const validate = () => {
    const next = {};
    if (!USERNAME.test(form.username)) next.username = t("username_rules");
    if (!/^\S+@\S+\.\S+$/.test(form.email)) next.email = t("email_invalid");
    if (form.password.length < 8) next.password = t("password_hint");
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const onSubmit = async (event) => {
    event.preventDefault();
    setError("");
    if (!validate()) return;
    setBusy(true);
    try {
      const res = await register({ ...form, username: form.username.trim(), email: form.email.trim(), lang });
      navigate(`/verify?email=${encodeURIComponent(res.email)}`, { state: location.state });
    } catch (err) {
      const fields = fieldErrors(err);
      if (Object.keys(fields).length) setErrors(fields);
      else setError(apiError(err, t("action_failed")));
    } finally {
      setBusy(false);
    }
  };

  const fieldError = (key) =>
    errors[key] ? (
      <p id={`${key}-error`} className="text-xs text-rose-400 mt-1" role="alert">
        {errors[key]}
      </p>
    ) : null;

  return (
    <AuthShell
      title={t("register_title")}
      subtitle={t("register_subtitle")}
      footer={
        <>
          {t("have_account")}{" "}
          <Link to="/login" state={location.state} className="text-amber-400 hover:text-amber-300 font-semibold">
            {t("sign_in")}
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <div>
          <label htmlFor="username" className="block text-xs font-semibold text-slate-300 mb-1.5">
            {t("username")}
          </label>
          <input
            id="username"
            className="input"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            required
            maxLength={30}
            dir="ltr"
            aria-invalid={Boolean(errors.username)}
            aria-describedby="username-hint"
            value={form.username}
            onChange={set("username")}
          />
          {fieldError("username") ?? (
            <p id="username-hint" className="text-xs text-slate-500 mt-1">
              {t("username_rules")}
            </p>
          )}
        </div>
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
            dir="ltr"
            aria-invalid={Boolean(errors.email)}
            value={form.email}
            onChange={set("email")}
          />
          {fieldError("email")}
        </div>
        <div>
          <label htmlFor="password" className="block text-xs font-semibold text-slate-300 mb-1.5">
            {t("password")}
          </label>
          <PasswordInput
            id="password"
            autoComplete="new-password"
            required
            minLength={8}
            aria-invalid={Boolean(errors.password)}
            value={form.password}
            onChange={set("password")}
          />
          {fieldError("password") ?? <p className="text-xs text-slate-500 mt-1">{t("password_hint")}</p>}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="display_name" className="block text-xs font-semibold text-slate-300 mb-1.5">
              {t("display_name")} <span className="text-slate-500 font-normal">({t("optional")})</span>
            </label>
            <input id="display_name" className="input" maxLength={120} value={form.display_name} onChange={set("display_name")} />
          </div>
          <div>
            <label htmlFor="country" className="block text-xs font-semibold text-slate-300 mb-1.5">
              {t("country")} <span className="text-slate-500 font-normal">({t("optional")})</span>
            </label>
            <input id="country" className="input" maxLength={100} autoComplete="country-name" value={form.country} onChange={set("country")} />
          </div>
        </div>

        <FormError>{error}</FormError>

        <button type="submit" disabled={busy} className="btn btn-primary btn-lg w-full">
          {busy ? t("creating_account") : t("register")}
        </button>
      </form>
    </AuthShell>
  );
}
