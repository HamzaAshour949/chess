import { Outlet, Link, useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../context/LanguageContext";
import LanguageDropdown from "../components/LanguageDropdown";
import { useState } from "react";

export default function AdminLayout() {
  const { t } = useTranslation();
  const { admin, logout } = useAuth();
  const { lang, toggleLanguage } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const navLinks = [
    { to: "/admin", label: t("dashboard"), icon: "📊", exact: true },
    { to: "/admin/players", label: t("manage_players"), icon: "♟" },
    { to: "/admin/news", label: t("manage_news"), icon: "📰" },
    { to: "/admin/strings", label: t("site_strings") || "Site Strings", icon: "🔤" },
  ];

  const isActive = (path, exact) =>
    exact ? location.pathname === path : location.pathname.startsWith(path);

  const handleLogout = () => {
    logout();
    navigate("/admin/login");
  };

  return (
    <div className="min-h-screen flex bg-gray-100">
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 z-50 flex w-64 flex-col bg-gray-900 text-white transition-transform duration-300 lg:translate-x-0 lg:static lg:z-auto ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full rtl:translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between h-16 px-4 border-b border-gray-700">
          <Link to="/admin" className="flex items-center gap-2 text-lg font-bold">
            <span className="text-xl">♔</span>
            {t("admin")}
          </Link>
          <button
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden text-gray-400 hover:text-white"
          >
            ✕
          </button>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1">
          {navLinks.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              onClick={() => setSidebarOpen(false)}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive(link.to, link.exact)
                  ? "bg-amber-600 text-white"
                  : "text-gray-300 hover:bg-gray-800 hover:text-white"
              }`}
            >
              <span>{link.icon}</span>
              {link.label}
            </Link>
          ))}
        </nav>
        <div className="p-4 border-t border-gray-700 space-y-2">
          <Link
            to="/"
            className="flex items-center gap-2 px-3 py-2 text-sm text-gray-300 hover:text-white rounded-lg hover:bg-gray-800"
          >
            ← {t("home")}
          </Link>
          <div className="w-full">
            <LanguageDropdown variant="dark" />
          </div>
          <button
            onClick={handleLogout}
            className="w-full px-3 py-2 text-sm text-start text-red-400 hover:text-red-300 rounded-lg hover:bg-gray-800"
          >
            🚪 {t("logout")}
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="bg-white shadow-sm h-16 flex items-center justify-between px-4 lg:px-8 sticky top-0 z-30">
          <button
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden p-2 rounded-md text-gray-500 hover:bg-gray-100"
          >
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <div className="text-sm text-gray-500">
            {t("welcome")}, <span className="font-medium text-gray-900">{admin?.username}</span>
          </div>
          <div />
        </header>

        {/* Content */}
        <main className="flex-1 p-4 lg:p-8 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
