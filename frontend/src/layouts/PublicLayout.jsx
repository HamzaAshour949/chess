import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useUserAuth } from "../context/UserAuthContext";
import LanguageDropdown from "../components/LanguageDropdown";
import Avatar from "../components/Avatar";
import { CHALLENGES_CHANGED_EVENT } from "../components/NotificationCenter";
import api from "../api";
import { getSocket } from "../realtime";
import { isSoundEnabled, setSoundEnabled } from "../lib/sound";
import { nameOf } from "../lib/format";

/** Unread DMs, live games and waiting invitations, kept current over the socket. */
const NO_ACTIVITY = { unread: 0, activeGames: [], incoming: 0 };

function useActivity(user) {
  const [state, setState] = useState({ for: null, ...NO_ACTIVITY });
  const userId = user?.id;

  const load = useCallback(() => {
    if (!userId) return;
    Promise.all([
      api.get("/messages/unread-count").then((r) => r.data?.unread ?? 0).catch(() => null),
      api
        .get("/games/me/games?status=active&per_page=10")
        .then((r) => (r.data?.games ?? []).filter((g) => g.status === "active"))
        .catch(() => null),
      api.get("/games/me/challenges").then((r) => r.data?.incoming?.length ?? 0).catch(() => null),
    ]).then(([unread, activeGames, incoming]) => {
      setState((current) => {
        const base = current.for === userId ? current : NO_ACTIVITY;
        return {
          for: userId,
          unread: unread ?? base.unread,
          activeGames: activeGames ?? base.activeGames,
          incoming: incoming ?? base.incoming,
        };
      });
    });
  }, [userId]);

  useEffect(() => {
    if (!userId) return undefined;
    load();

    const socket = getSocket();
    const events = ["dm:new", "connect", "game:started", "challenge:received", "challenge:closed"];
    events.forEach((event) => socket.on(event, load));
    window.addEventListener(CHALLENGES_CHANGED_EVENT, load);
    window.addEventListener("chesshub:activity-changed", load);
    // A slow safety net for anything the socket missed.
    const interval = setInterval(load, 60_000);
    return () => {
      events.forEach((event) => socket.off(event, load));
      window.removeEventListener(CHALLENGES_CHANGED_EVENT, load);
      window.removeEventListener("chesshub:activity-changed", load);
      clearInterval(interval);
    };
  }, [userId, load]);

  // Another account's numbers (or none, signed out) are never shown.
  return state.for === userId && userId ? state : NO_ACTIVITY;
}

function useDismiss(open, setOpen, ref) {
  useEffect(() => {
    if (!open) return undefined;
    const onPointer = (event) => {
      if (ref.current && !ref.current.contains(event.target)) setOpen(false);
    };
    const onKey = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, setOpen, ref]);
}

function UserMenu({ onNavigate }) {
  const { user, logout } = useUserAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [sound, setSound] = useState(isSoundEnabled());
  const ref = useRef(null);
  useDismiss(open, setOpen, ref);

  if (!user) {
    return (
      <div className="flex items-center gap-2">
        <Link to="/login" className="btn btn-ghost" onClick={onNavigate}>
          {t("sign_in")}
        </Link>
        <Link to="/register" className="btn btn-primary" onClick={onNavigate}>
          {t("get_started")}
        </Link>
      </div>
    );
  }

  const go = (to) => {
    setOpen(false);
    onNavigate?.();
    navigate(to);
  };

  const item = "w-full text-start block px-3 py-2 rounded-lg text-sm text-slate-200 hover:bg-white/5 hover:text-white";

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((shown) => !shown)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-2.5 ps-1 pe-2 py-1 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 transition"
      >
        <Avatar user={user} size={32} />
        <span className="flex flex-col items-start leading-tight pe-1">
          <span className="text-sm font-medium text-white max-w-[9rem] truncate"><bdi>{nameOf(user, t)}</bdi></span>
          <span className="text-[11px] text-amber-400 font-semibold tabular-nums">{user.online_rating}</span>
        </span>
      </button>
      {open && (
        <div
          role="menu"
          className="absolute end-0 mt-2 w-60 p-2 z-50 animate-fade-in rounded-2xl border border-white/10 shadow-2xl"
          style={{ background: "#111827" }}
        >
          <div className="px-3 py-2 mb-1 border-b border-white/10">
            <div className="text-sm font-semibold text-white truncate"><bdi>{nameOf(user, t)}</bdi></div>
            <div className="text-xs text-slate-400 truncate"><bdi>@{user.username}</bdi></div>
          </div>
          <button role="menuitem" type="button" className={item} onClick={() => go(`/u/${user.username}`)}>
            {t("my_profile")}
          </button>
          <button role="menuitem" type="button" className={item} onClick={() => go("/settings?tab=games")}>
            {t("my_games")}
          </button>
          <button role="menuitem" type="button" className={item} onClick={() => go("/messages")}>
            {t("messages")}
          </button>
          <button role="menuitem" type="button" className={item} onClick={() => go("/settings")}>
            {t("settings")}
          </button>
          <button
            role="menuitemcheckbox"
            aria-checked={sound}
            type="button"
            className={`${item} flex items-center justify-between`}
            onClick={() => {
              setSoundEnabled(!sound);
              setSound(!sound);
            }}
          >
            <span>{t("notif_sound")}</span>
            <span className={`text-xs font-bold ${sound ? "text-emerald-400" : "text-slate-500"}`}>
              {sound ? t("on") : t("off")}
            </span>
          </button>
          <div className="my-1 border-t border-white/10" />
          <button
            role="menuitem"
            type="button"
            onClick={() => {
              setOpen(false);
              logout();
              onNavigate?.();
              navigate("/");
            }}
            className="w-full text-start px-3 py-2 rounded-lg text-sm text-rose-300 hover:bg-rose-500/10"
          >
            {t("logout")}
          </button>
        </div>
      )}
    </div>
  );
}

function Badge({ count, tone = "gold" }) {
  if (!count) return null;
  return (
    <span
      className={`inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full text-[10px] font-bold ${
        tone === "gold" ? "bg-amber-500 text-slate-950" : "bg-rose-500 text-white"
      }`}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}

export default function PublicLayout() {
  const { t } = useTranslation();
  const location = useLocation();
  const { user, endedReason, clearEndedReason } = useUserAuth();
  const activity = useActivity(user);
  // The mobile menu belongs to the page it was opened on, so navigating
  // anywhere closes it without an effect.
  const [menuPath, setMenuPath] = useState(null);
  const menuOpen = menuPath === location.pathname;
  const setMenuOpen = (open) => setMenuPath(open ? location.pathname : null);
  const [scrolled, setScrolled] = useState(false);
  const mobileRef = useRef(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const onKey = (event) => event.key === "Escape" && setMenuPath(null);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  // Games running somewhere other than the page the player is on.
  const elsewhere = activity.activeGames.filter((game) => !location.pathname.startsWith(`/play/${game.id}`));

  const navLinks = [
    { to: "/", label: t("home"), end: true },
    { to: "/play", label: t("play"), badge: activity.incoming, tone: "red" },
    { to: "/watch", label: t("watch") },
    { to: "/players", label: t("players") },
    { to: "/news", label: t("news") },
    { to: "/leaderboard", label: t("leaderboard") },
    ...(user ? [{ to: "/messages", label: t("messages"), badge: activity.unread }] : []),
  ];

  return (
    <div className="min-h-screen flex flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:start-3 focus:z-[200] btn btn-primary"
      >
        {t("skip_to_content")}
      </a>

      <header
        className={`sticky top-0 z-50 transition-all ${
          scrolled || menuOpen
            ? "bg-[#07090f]/90 backdrop-blur-xl border-b border-white/10"
            : "bg-transparent border-b border-transparent"
        }`}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 gap-3">
            <Link to="/" className="flex items-center gap-2.5 group flex-shrink-0" aria-label={t("app_name")}>
              <span className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-400 to-amber-700 flex items-center justify-center text-slate-900 text-xl font-black shadow-lg shadow-amber-500/20 group-hover:shadow-amber-500/40 transition">
                ♔
              </span>
              <span className="text-lg font-bold text-white tracking-tight hidden sm:inline">{t("app_name")}</span>
            </Link>

            <nav className="hidden lg:flex items-center gap-1" aria-label={t("main_navigation")}>
              {navLinks.map((link) => (
                <NavLink
                  key={link.to}
                  to={link.to}
                  end={link.end}
                  className={({ isActive }) =>
                    `relative px-3.5 py-2 rounded-lg text-sm font-medium transition inline-flex items-center gap-1.5 ${
                      isActive ? "text-white bg-white/[0.08]" : "text-slate-300 hover:text-white hover:bg-white/5"
                    }`
                  }
                >
                  {link.label}
                  <Badge count={link.badge} tone={link.tone} />
                </NavLink>
              ))}
            </nav>

            <div className="flex items-center gap-2 sm:gap-3">
              {elsewhere.length > 0 && (
                <Link
                  to={`/play/${elsewhere[0].id}`}
                  className="hidden sm:inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/15 border border-emerald-400/30 text-emerald-300 text-xs font-semibold hover:bg-emerald-500/25 transition"
                >
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" aria-hidden="true" />
                  {t("game_in_progress")}
                </Link>
              )}
              <LanguageDropdown />
              <div className="hidden sm:block">
                <UserMenu />
              </div>
              <button
                type="button"
                onClick={() => setMenuOpen(!menuOpen)}
                className="lg:hidden p-2 rounded-lg text-slate-300 hover:text-white hover:bg-white/5"
                aria-label={t("menu")}
                aria-expanded={menuOpen}
                aria-controls="mobile-menu"
              >
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
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
          <div
            id="mobile-menu"
            ref={mobileRef}
            className="lg:hidden border-t border-white/10 bg-[#07090f]/95 backdrop-blur-xl animate-fade-in"
          >
            <nav className="px-3 py-3 space-y-1" aria-label={t("main_navigation")}>
              {elsewhere.length > 0 && (
                <Link
                  to={`/play/${elsewhere[0].id}`}
                  className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-emerald-500/10 text-emerald-300 font-semibold"
                >
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" aria-hidden="true" />
                  {t("game_in_progress")}
                </Link>
              )}
              {navLinks.map((link) => (
                <NavLink
                  key={link.to}
                  to={link.to}
                  end={link.end}
                  className={({ isActive }) =>
                    `flex items-center justify-between px-3 py-2.5 rounded-lg text-base font-medium ${
                      isActive ? "bg-white/[0.08] text-white" : "text-slate-200 hover:bg-white/5"
                    }`
                  }
                >
                  <span>{link.label}</span>
                  <Badge count={link.badge} tone={link.tone} />
                </NavLink>
              ))}
              <div className="pt-3 mt-2 border-t border-white/10 sm:hidden">
                <UserMenu onNavigate={() => setMenuOpen(false)} />
              </div>
            </nav>
          </div>
        )}
      </header>

      {endedReason && !user && (
        <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 mt-3">
          <div className="surface-2 border border-amber-400/30 px-4 py-3 flex items-center justify-between gap-3 text-sm">
            <span className="text-amber-200">{t(`session_ended_${endedReason}`)}</span>
            <div className="flex gap-2">
              {endedReason === "expired" && (
                <Link to="/login" className="btn btn-primary px-3 py-1.5 text-xs" onClick={clearEndedReason}>
                  {t("sign_in")}
                </Link>
              )}
              <button type="button" className="btn btn-ghost px-3 py-1.5 text-xs" onClick={clearEndedReason}>
                {t("dismiss")}
              </button>
            </div>
          </div>
        </div>
      )}

      <main id="main" className="flex-1" tabIndex={-1}>
        {/* The header stays put while the next page's code arrives. */}
        <Suspense
          fallback={
            <div className="max-w-5xl mx-auto px-4 py-12" aria-busy="true">
              <div className="surface-elev h-96 shimmer" />
            </div>
          }
        >
          <Outlet />
        </Suspense>
      </main>

      <footer className="border-t border-white/10 mt-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-2.5">
            <span className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-400 to-amber-700 flex items-center justify-center text-slate-900 font-black">
              ♔
            </span>
            <span className="text-slate-200 font-semibold">{t("app_name")}</span>
            <span className="text-slate-500 text-sm">© {new Date().getFullYear()}</span>
          </div>
          <nav className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm text-slate-400" aria-label={t("footer_navigation")}>
            <Link to="/play" className="hover:text-white">
              {t("play")}
            </Link>
            <Link to="/watch" className="hover:text-white">
              {t("watch")}
            </Link>
            <Link to="/players" className="hover:text-white">
              {t("players")}
            </Link>
            <Link to="/news" className="hover:text-white">
              {t("news")}
            </Link>
            <Link to="/leaderboard" className="hover:text-white">
              {t("leaderboard")}
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
