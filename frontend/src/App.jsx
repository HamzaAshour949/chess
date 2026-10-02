import { Suspense, lazy, useEffect } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { useAuth } from "./context/AuthContext";
import { useUserAuth } from "./context/UserAuthContext";
import { useLanguage } from "./context/LanguageContext";
import ErrorBoundary from "./components/ErrorBoundary";
import NotificationCenter from "./components/NotificationCenter";

import PublicLayout from "./layouts/PublicLayout";
import AdminLayout from "./layouts/AdminLayout";

// Every page is its own chunk, so a visitor downloads the board library only
// when they open a game and the carousel only on the homepage.
const HomePage = lazy(() => import("./pages/public/HomePage"));
const PlayersPage = lazy(() => import("./pages/public/PlayersPage"));
const PlayerDetailPage = lazy(() => import("./pages/public/PlayerDetailPage"));
const NewsPage = lazy(() => import("./pages/public/NewsPage"));
const NewsDetailPage = lazy(() => import("./pages/public/NewsDetailPage"));
const RegisterPage = lazy(() => import("./pages/public/RegisterPage"));
const VerifyOtpPage = lazy(() => import("./pages/public/VerifyOtpPage"));
const LoginUserPage = lazy(() => import("./pages/public/LoginUserPage"));
const ForgotPasswordPage = lazy(() => import("./pages/public/ForgotPasswordPage"));
const ResetPasswordPage = lazy(() => import("./pages/public/ResetPasswordPage"));
const SettingsPage = lazy(() => import("./pages/public/SettingsPage"));
const UserProfilePage = lazy(() => import("./pages/public/UserProfilePage"));
const PlayPage = lazy(() => import("./pages/public/PlayPage"));
const GamePage = lazy(() => import("./pages/public/GamePage"));
const LeaderboardPage = lazy(() => import("./pages/public/LeaderboardPage"));
const WatchPage = lazy(() => import("./pages/public/WatchPage"));
const MessagesPage = lazy(() => import("./pages/public/MessagesPage"));
const NotFoundPage = lazy(() => import("./pages/public/NotFoundPage"));

// The admin console is a separate bundle, fetched only when an admin
// actually opens it.
const LoginPage = lazy(() => import("./pages/admin/LoginPage"));
const DashboardPage = lazy(() => import("./pages/admin/DashboardPage"));
const AdminPlayersPage = lazy(() => import("./pages/admin/AdminPlayersPage"));
const PlayerFormPage = lazy(() => import("./pages/admin/PlayerFormPage"));
const AdminNewsPage = lazy(() => import("./pages/admin/AdminNewsPage"));
const NewsFormPage = lazy(() => import("./pages/admin/NewsFormPage"));
const SiteStringsPage = lazy(() => import("./pages/admin/SiteStringsPage"));
const AdminLinkRequestsPage = lazy(() => import("./pages/admin/AdminLinkRequestsPage"));
const AdminUsersPage = lazy(() => import("./pages/admin/AdminUsersPage"));
const AdminGamesPage = lazy(() => import("./pages/admin/AdminGamesPage"));
const AdminMessagesPage = lazy(() => import("./pages/admin/AdminMessagesPage"));

function PageFallback() {
  return (
    <div className="max-w-5xl mx-auto px-4 py-12" aria-busy="true">
      <div className="surface-elev h-96 shimmer" />
    </div>
  );
}

function ProtectedAdminRoute({ children }) {
  const { admin, loading } = useAuth();
  if (loading) return <PageFallback />;
  return admin ? children : <Navigate to="/admin/login" replace />;
}

/** Signed-in players only; everyone else goes to sign in and comes back after. */
function ProtectedUserRoute({ children }) {
  const { user, loading } = useUserAuth();
  const location = useLocation();
  if (loading) return <PageFallback />;
  if (user) return children;
  return <Navigate to="/login" replace state={{ from: `${location.pathname}${location.search}` }} />;
}

/** Keep the account's language in step with the interface, for emails. */
function useLanguageSync() {
  const { lang } = useLanguage();
  const { user, updateProfile } = useUserAuth();
  useEffect(() => {
    if (user && user.lang && user.lang !== lang) void updateProfile({ lang }).catch(() => {});
  }, [lang, user, updateProfile]);
}

export default function App() {
  const { dir } = useLanguage();
  const location = useLocation();
  useLanguageSync();

  // A new page starts at the top; a change of query only (tabs, filters,
  // pagination) keeps the reader's place.
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [location.pathname]);

  return (
    <div dir={dir}>
      <NotificationCenter />
      <ErrorBoundary resetKey={location.pathname}>
        <Suspense fallback={<PageFallback />}>
          <Routes>
            {/* Public + user routes */}
            <Route element={<PublicLayout />}>
              <Route path="/" element={<HomePage />} />
              <Route path="/players" element={<PlayersPage />} />
              <Route path="/players/:id" element={<PlayerDetailPage />} />
              <Route path="/news" element={<NewsPage />} />
              <Route path="/news/:id" element={<NewsDetailPage />} />
              <Route path="/leaderboard" element={<LeaderboardPage />} />
              <Route path="/u/:username" element={<UserProfilePage />} />

              <Route path="/register" element={<RegisterPage />} />
              <Route path="/verify" element={<VerifyOtpPage />} />
              <Route path="/login" element={<LoginUserPage />} />
              <Route path="/forgot-password" element={<ForgotPasswordPage />} />
              <Route path="/reset-password" element={<ResetPasswordPage />} />

              <Route
                path="/play"
                element={
                  <ProtectedUserRoute>
                    <PlayPage />
                  </ProtectedUserRoute>
                }
              />
              {/* Public spectator access for /play/:id */}
              <Route path="/play/:id" element={<GamePage />} />
              <Route path="/watch" element={<WatchPage />} />
              <Route
                path="/messages/:userId?"
                element={
                  <ProtectedUserRoute>
                    <MessagesPage />
                  </ProtectedUserRoute>
                }
              />
              <Route
                path="/settings"
                element={
                  <ProtectedUserRoute>
                    <SettingsPage />
                  </ProtectedUserRoute>
                }
              />
              {/* The settings page used to live here; keep old links working. */}
              <Route path="/profile" element={<Navigate to={`/settings${location.search}`} replace />} />
              <Route path="*" element={<NotFoundPage />} />
            </Route>

            {/* Admin routes */}
            <Route path="/admin/login" element={<LoginPage />} />
            <Route
              path="/admin"
              element={
                <ProtectedAdminRoute>
                  <AdminLayout />
                </ProtectedAdminRoute>
              }
            >
              <Route index element={<DashboardPage />} />
              <Route path="players" element={<AdminPlayersPage />} />
              <Route path="players/new" element={<PlayerFormPage />} />
              <Route path="players/:id/edit" element={<PlayerFormPage />} />
              <Route path="news" element={<AdminNewsPage />} />
              <Route path="news/new" element={<NewsFormPage />} />
              <Route path="news/:id/edit" element={<NewsFormPage />} />
              <Route path="strings" element={<SiteStringsPage />} />
              <Route path="users" element={<AdminUsersPage />} />
              <Route path="games" element={<AdminGamesPage />} />
              <Route path="messages" element={<AdminMessagesPage />} />
              <Route path="link-requests" element={<AdminLinkRequestsPage />} />
              <Route path="*" element={<Navigate to="/admin" replace />} />
            </Route>
          </Routes>
        </Suspense>
      </ErrorBoundary>
    </div>
  );
}
