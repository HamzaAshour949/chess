import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useUserAuth } from "../../context/UserAuthContext";
import { useLanguage } from "../../context/LanguageContext";

export default function RegisterPage() {
  const { t } = useTranslation();
  const { lang } = useLanguage();
  const { register } = useUserAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState({
    username: "", email: "", password: "", display_name: "", country: "",
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const res = await register({ ...form, lang });
      navigate(`/verify?email=${encodeURIComponent(res.email)}`);
    } catch (err) {
      setError(err.response?.data?.error || "Registration failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center justify-center px-4 py-10 relative overflow-hidden">
      <div className="absolute inset-0 bg-grid opacity-30 pointer-events-none" />
      <div className="absolute -top-20 left-1/2 -translate-x-1/2 w-[640px] h-[640px] rounded-full bg-amber-500/10 blur-3xl pointer-events-none" />

      <div className="relative w-full max-w-md">
        <div className="surface-elev p-8 animate-fade-up">
          <div className="text-center mb-8">
            <div className="inline-flex w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-400 to-amber-700 items-center justify-center text-2xl text-slate-900 font-black mb-4 shadow-lg shadow-amber-500/30">♔</div>
            <h1 className="text-2xl font-extrabold text-white">{t("register_title")}</h1>
            <p className="text-slate-400 text-sm mt-1">{t("register_subtitle")}</p>
          </div>

          <form onSubmit={onSubmit} className="space-y-3.5">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">{t("username")}</label>
              <input className="input" autoComplete="username" required minLength={3} maxLength={30}
                     value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">{t("email")}</label>
              <input type="email" className="input" autoComplete="email" required
                     value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">{t("password")}</label>
              <input type="password" className="input" autoComplete="new-password" required minLength={8}
                     value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">{t("display_name")}</label>
                <input className="input" maxLength={120}
                       value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">{t("country")}</label>
                <input className="input" maxLength={100}
                       value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} />
              </div>
            </div>

            {error && <div className="chip chip-red w-full justify-center py-2">{error}</div>}

            <button type="submit" disabled={busy} className="btn btn-primary btn-lg w-full">
              {busy ? t("creating_account") : t("register")}
            </button>
          </form>

          <div className="text-center mt-6 text-sm text-slate-400">
            {t("have_account")} <Link to="/login" className="text-amber-400 hover:text-amber-300 font-semibold">{t("sign_in")}</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
