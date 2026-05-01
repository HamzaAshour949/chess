import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useUserAuth } from "../../context/UserAuthContext";
import { useLanguage } from "../../context/LanguageContext";

export default function LoginUserPage() {
  const { t } = useTranslation();
  const { lang } = useLanguage();
  const { login } = useUserAuth();
  const navigate = useNavigate();

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setError(""); setBusy(true);
    try {
      await login(identifier, password, lang);
      navigate("/play");
    } catch (err) {
      const data = err.response?.data;
      if (data?.needs_verification) {
        navigate(`/verify?email=${encodeURIComponent(data.email)}`);
        return;
      }
      if (data?.is_banned) {
        setError(`${t("account_suspended")}${data.ban_reason ? ` — ${data.ban_reason}` : ""}`);
        return;
      }
      setError(data?.error || "Login failed");
    } finally { setBusy(false); }
  };

  return (
    <div className="flex items-center justify-center px-4 py-10 relative overflow-hidden">
      <div className="absolute inset-0 bg-grid opacity-30 pointer-events-none" />
      <div className="absolute -top-20 left-1/2 -translate-x-1/2 w-[640px] h-[640px] rounded-full bg-amber-500/10 blur-3xl pointer-events-none" />
      <div className="relative w-full max-w-md">
        <div className="surface-elev p-8 animate-fade-up">
          <div className="text-center mb-8">
            <div className="inline-flex w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-400 to-amber-700 items-center justify-center text-2xl text-slate-900 font-black mb-4 shadow-lg shadow-amber-500/30">♔</div>
            <h1 className="text-2xl font-extrabold text-white">{t("login_title")}</h1>
            <p className="text-slate-400 text-sm mt-1">{t("login_subtitle")}</p>
          </div>

          <form onSubmit={submit} className="space-y-3.5">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">{t("identifier")}</label>
              <input className="input" autoComplete="username" required
                     value={identifier} onChange={(e) => setIdentifier(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">{t("password")}</label>
              <input type="password" className="input" autoComplete="current-password" required
                     value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>

            {error && <div className="chip chip-red w-full justify-center py-2">{error}</div>}

            <button type="submit" disabled={busy} className="btn btn-primary btn-lg w-full">
              {busy ? t("signing_in") : t("sign_in")}
            </button>
          </form>

          <div className="text-center mt-6 text-sm text-slate-400">
            {t("no_account")} <Link to="/register" className="text-amber-400 hover:text-amber-300 font-semibold">{t("sign_up")}</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
