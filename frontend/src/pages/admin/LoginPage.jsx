import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { apiError } from "../../api";
import { useAuth } from "../../context/AuthContext";
import { useDocumentTitle } from "../../hooks/useDocumentTitle";
import LanguageDropdown from "../../components/LanguageDropdown";
import { ErrorBanner, inputCls } from "./ui";

export default function LoginPage() {
  const { t } = useTranslation();
  const { admin, login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  useDocumentTitle(t("admin_login"));

  if (admin) return <Navigate to="/admin" replace />;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(username, password);
      navigate("/admin");
    } catch (err) {
      setError(err.response?.status === 401 ? t("invalid_credentials") : apiError(err, t("action_failed")));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <span className="inline-flex w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-400 to-amber-700 items-center justify-center text-3xl text-slate-900" aria-hidden="true">
            ♔
          </span>
          <h1 className="text-2xl font-bold text-gray-900 mt-4">{t("admin")}</h1>
        </div>
        <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-4">
          <ErrorBanner>{error}</ErrorBanner>
          <div>
            <label htmlFor="admin-username" className="block text-sm font-medium text-gray-700 mb-1">
              {t("username")}
            </label>
            <input id="admin-username" value={username} onChange={(e) => setUsername(e.target.value)} required autoComplete="username" autoFocus className={inputCls} />
          </div>
          <div>
            <label htmlFor="admin-password" className="block text-sm font-medium text-gray-700 mb-1">
              {t("password")}
            </label>
            <input
              id="admin-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              className={inputCls}
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-semibold transition-colors disabled:opacity-50"
          >
            {loading ? t("signing_in") : t("sign_in")}
          </button>
        </form>
        <div className="flex justify-center mt-4">
          <div className="bg-gray-900 rounded-lg">
            <LanguageDropdown tone="light" />
          </div>
        </div>
      </div>
    </div>
  );
}
