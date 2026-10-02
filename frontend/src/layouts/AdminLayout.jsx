import { Suspense, useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "../context/AuthContext";
import LanguageDropdown from "../components/LanguageDropdown";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import api from "../api";

export default function AdminLayout() {
  const { t } = useTranslation();
  const { admin, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarPath, setSidebarPath] = useState(null);
  const sidebarOpen = sidebarPath === location.pathname;
  const setSidebarOpen = (open) => setSidebarPath(open ? location.pathname : null);
  const [pending, setPending] = useState(0);
  useDocumentTitle(t("admin"));

  // The one number an admin needs to act on, visible from every page.
  useEffect(() => {
    api
      .get("/games/admin/stats")
      .then((r) => setPending(r.data.pending_link_requests ?? 0))
      .catch(() => {});
  }, [location.pathname]);

  useEffect(() => {
    if (!sidebarOpen) return undefined;
    const onKey = (event) => event.key === "Escape" && setSidebarPath(null);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [sidebarOpen]);

  const navLinks = [
    { to: "/admin", label: t("dashboard"), icon: "▦", end: true },
    { to: "/admin/players", label: t("manage_players"), icon: "♟" },
    { to: "/admin/news", label: t("manage_news"), icon: "📰" },
    { to: "/admin/users", label: t("manage_users"), icon: "👥" },
    { to: "/admin/games", label: t("admin_matches"), icon: "⚔" },
    { to: "/admin/messages", label: t("admin_chat_moderation"), icon: "💬" },
    { to: "/admin/link-requests", label: t("link_requests"), icon: "🔗", badge: pending },
    { to: "/admin/strings", label: t("site_strings"), icon: "🔤" },
  ];

  const handleLogout = () => {
    logout();
    navigate("/admin/login");
  };

  return (
    <div className="min-h-screen flex bg-gray-100 text-gray-900">
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={() => setSidebarOpen(false)} aria-hidden="true" />
      )}

      <aside
        className={`fixed inset-y-0 start-0 z-50 flex w-64 flex-col bg-gray-900 text-white transition-transform duration-300 lg:translate-x-0 lg:static lg:z-auto ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full rtl:translate-x-full"
        }`}
        aria-label={t("admin_navigation")}
      >
        <div className="flex items-center justify-between h-16 px-4 border-b border-gray-800">
          <Link to="/admin" className="flex items-center gap-2 text-lg font-bold">
            <span className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-400 to-amber-700 flex items-center justify-center text-slate-900" aria-hidden="true">
              ♔
            </span>
            {t("admin")}
          </Link>
          <button type="button" onClick={() => setSidebarOpen(false)} className="lg:hidden text-gray-400 hover:text-white p-1" aria-label={t("close")}>
            ✕
          </button>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {navLinks.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.end}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive ? "bg-amber-600 text-white" : "text-gray-300 hover:bg-gray-800 hover:text-white"
                }`
              }
            >
              <span className="w-5 text-center" aria-hidden="true">
                {link.icon}
              </span>
              <span className="flex-1">{link.label}</span>
              {link.badge > 0 && (
                <span className="min-w-[1.25rem] h-5 px-1.5 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center">
                  {link.badge}
                </span>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="p-4 border-t border-gray-800 space-y-2">
          <Link to="/" className="flex items-center gap-2 px-3 py-2 text-sm text-gray-300 hover:text-white rounded-lg hover:bg-gray-800">
            ↗ {t("view_site")}
          </Link>
          <LanguageDropdown tone="light" />
          <button
            type="button"
            onClick={handleLogout}
            className="w-full px-3 py-2 text-sm text-start text-rose-300 hover:text-rose-200 rounded-lg hover:bg-gray-800"
          >
            {t("logout")}
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="bg-white border-b border-gray-200 h-16 flex items-center justify-between gap-3 px-4 lg:px-8 sticky top-0 z-30">
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden p-2 rounded-md text-gray-500 hover:bg-gray-100"
            aria-label={t("menu")}
            aria-expanded={sidebarOpen}
          >
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <div className="text-sm text-gray-500 ms-auto">
            {t("signed_in_as")} <span className="font-semibold text-gray-900">{admin?.username}</span>
          </div>
        </header>

        <main className="flex-1 p-4 lg:p-8 overflow-auto">
          <Suspense fallback={<p className="text-gray-400">{t("loading")}</p>}>
            <Outlet />
          </Suspense>
        </main>
      </div>
    </div>
  );
}
