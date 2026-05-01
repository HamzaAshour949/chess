import { Outlet, Link, useLocation, NavLink } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useState, useEffect, useRef } from "react";
import { useUserAuth } from "../context/UserAuthContext";
import LanguageDropdown from "../components/LanguageDropdown";
import api from "../api";

function useUnreadDM(user) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!user) { setN(0); return; }
    let alive = true;
    const tick = () => api.get("/messages/unread-count")
      .then((r) => alive && setN(r.data?.count || 0)).catch(() => {});
    tick();
    const i = setInterval(tick, 8000);
    return () => { alive = false; clearInterval(i); };
  }, [user]);
  return n;
}

function UserMenu() {
  const { user, logout } = useUserAuth();
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  if (!user) {
    return (
      <div className="flex items-center gap-2">
        <Link to="/login" className="btn btn-ghost">{t("sign_in")}</Link>
        <Link to="/register" className="btn btn-primary">{t("get_started")}</Link>
      </div>
    );
  }
  const initial = (user.display_name || user.username || "?").charAt(0).toUpperCase();
  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((s) => !s)}
        className="flex items-center gap-2.5 px-2 py-1.5 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 transition"
      >
        <span className="w-8 h-8 rounded-full bg-gradient-to-br from-amber-400 to-amber-600 text-slate-900 flex items-center justify-center font-bold text-sm">
          {initial}
        </span>
        <span className="hidden sm:flex flex-col items-start leading-tight pr-1">
          <span className="text-sm font-medium text-white">{user.display_name || user.username}</span>
          <span className="text-[11px] text-amber-400 font-semibold">{user.online_rating}</span>
        </span>
      </button>
      {open && (
        <div className="absolute end-0 mt-2 w-56 p-2 z-50 animate-fade-in rounded-2xl border border-white/10 shadow-2xl" style={{ background: "#111827" }}>
          <Link to="/profile" onClick={() => setOpen(false)}
                className="block px-3 py-2 rounded-lg text-sm text-white hover:bg-white/5">{t("profile")}</Link>
          <Link to="/play" onClick={() => setOpen(false)}
                className="block px-3 py-2 rounded-lg text-sm text-white hover:bg-white/5">{t("play")}</Link>
          <Link to="/profile?tab=link" onClick={() => setOpen(false)}
                className="block px-3 py-2 rounded-lg text-sm text-white hover:bg-white/5">{t("link_profile")}</Link>
          <div className="my-1 border-t border-white/10" />
          <button onClick={() => { logout(); setOpen(false); }}
                  className="w-full text-start px-3 py-2 rounded-lg text-sm text-rose-300 hover:bg-rose-500/10">
            {t("logout")}
          </button>
        </div>
      )}
    </div>
  );
}

export default function PublicLayout() {
  const { t } = useTranslation();
  const location = useLocation();
  const { user } = useUserAuth();
  const unread = useUnreadDM(user);
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => { setMenuOpen(false); }, [location.pathname]);

  const navLinks = [
    { to: "/", label: t("home") },
    { to: "/play", label: t("play") },
    { to: "/watch", label: t("watch") },
    { to: "/players", label: t("players") },
    { to: "/news", label: t("news") },
    { to: "/leaderboard", label: t("leaderboard") },
    ...(user ? [{ to: "/messages", label: t("messages"), badge: unread }] : []),
  ];

  return (
    <div className="min-h-screen flex flex-col">
      <header
        className={`sticky top-0 z-50 transition-all ${
          scrolled
            ? "bg-[#07090f]/85 backdrop-blur-xl border-b border-white/10"
            : "bg-transparent border-b border-transparent"
        }`}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <Link to="/" className="flex items-center gap-2.5 group">
              <span className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-400 to-amber-700 flex items-center justify-center text-slate-900 text-xl font-black shadow-lg shadow-amber-500/20 group-hover:shadow-amber-500/40 transition">
                ♔
              </span>
              <span className="text-lg font-bold text-white tracking-tight hidden sm:inline">
                {t("app_name")}
              </span>
            </Link>

            <nav className="hidden md:flex items-center gap-1">
              {navLinks.map((link) => (
                <NavLink
                  key={link.to}
                  to={link.to}
                  end={link.to === "/"}
                  className={({ isActive }) =>
                    `relative px-3.5 py-2 rounded-lg text-sm font-medium transition ${
                      isActive ? "text-white" : "text-slate-300 hover:text-white"
                    }`
                  }
                >
                  {({ isActive }) => (
                    <>
                      <span className="relative z-10 inline-flex items-center gap-1.5">
                        {link.label}
                        {link.badge > 0 && (
                          <span className="chip chip-gold text-[10px] px-1.5 py-0">{link.badge}</span>
                        )}
                      </span>
                      {isActive && (
                        <span className="absolute inset-0 rounded-lg bg-white/8 border border-white/10" />
                      )}
                    </>
                  )}
                </NavLink>
              ))}
            </nav>

            <div className="flex items-center gap-3">
              <LanguageDropdown />
              <div className="hidden sm:block">
                <UserMenu />
              </div>
              <button
                onClick={() => setMenuOpen(!menuOpen)}
                className="md:hidden p-2 rounded-lg text-slate-300 hover:text-white hover:bg-white/5"
                aria-label="menu"
              >
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  {menuOpen ? (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  ) : (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                  )}
                </svg>
              </button>
            </div>
          </div>
        </div>

        {menuOpen && (
          <div className="md:hidden border-t border-white/10 bg-[#07090f]/95 backdrop-blur-xl animate-fade-in">
            <div className="px-3 py-3 space-y-1">
              {navLinks.map((link) => (
                <Link
                  key={link.to}
                  to={link.to}
                  className="flex items-center justify-between px-3 py-2.5 rounded-lg text-base font-medium text-slate-200 hover:bg-white/5"
                >
                  <span>{link.label}</span>
                  {link.badge > 0 && <span className="chip chip-gold text-xs">{link.badge}</span>}
                </Link>
              ))}
              <div className="pt-2 mt-2 border-t border-white/10">
                <UserMenu />
              </div>
            </div>
          </div>
        )}
      </header>

      <main className="flex-1">
        <Outlet />
      </main>

      <footer className="border-t border-white/10 mt-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-2.5">
            <span className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-400 to-amber-700 flex items-center justify-center text-slate-900 font-black">♔</span>
            <span className="text-slate-200 font-semibold">{t("app_name")}</span>
            <span className="text-slate-500 text-sm">© {new Date().getFullYear()}</span>
          </div>
          <div className="flex items-center gap-5 text-sm text-slate-400">
            <Link to="/players" className="hover:text-white">{t("players")}</Link>
            <Link to="/news" className="hover:text-white">{t("news")}</Link>
            <Link to="/play" className="hover:text-white">{t("play")}</Link>
            <Link to="/leaderboard" className="hover:text-white">{t("leaderboard")}</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
