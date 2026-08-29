import { Suspense, lazy } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { useUserAuth } from './context/UserAuthContext';
import { useLanguage } from './context/LanguageContext';

import PublicLayout from './layouts/PublicLayout';
import AdminLayout from './layouts/AdminLayout';

import HomePage from './pages/public/HomePage';
import PlayersPage from './pages/public/PlayersPage';
import PlayerDetailPage from './pages/public/PlayerDetailPage';
import NewsPage from './pages/public/NewsPage';
import NewsDetailPage from './pages/public/NewsDetailPage';
import RegisterPage from './pages/public/RegisterPage';
import VerifyOtpPage from './pages/public/VerifyOtpPage';
import LoginUserPage from './pages/public/LoginUserPage';
import ProfilePage from './pages/public/ProfilePage';
import PlayPage from './pages/public/PlayPage';
import GamePage from './pages/public/GamePage';
import LeaderboardPage from './pages/public/LeaderboardPage';
import WatchPage from './pages/public/WatchPage';
import MessagesPage from './pages/public/MessagesPage';

// The admin console is a separate bundle, fetched only when an admin
// actually opens it.
const LoginPage = lazy(() => import('./pages/admin/LoginPage'));
const DashboardPage = lazy(() => import('./pages/admin/DashboardPage'));
const AdminPlayersPage = lazy(() => import('./pages/admin/AdminPlayersPage'));
const PlayerFormPage = lazy(() => import('./pages/admin/PlayerFormPage'));
const AdminNewsPage = lazy(() => import('./pages/admin/AdminNewsPage'));
const NewsFormPage = lazy(() => import('./pages/admin/NewsFormPage'));
const SiteStringsPage = lazy(() => import('./pages/admin/SiteStringsPage'));
const AdminLinkRequestsPage = lazy(() => import('./pages/admin/AdminLinkRequestsPage'));
const AdminUsersPage = lazy(() => import('./pages/admin/AdminUsersPage'));
const AdminGamesPage = lazy(() => import('./pages/admin/AdminGamesPage'));
const AdminMessagesPage = lazy(() => import('./pages/admin/AdminMessagesPage'));

function PageFallback() {
  return (
    <div className="max-w-5xl mx-auto px-4 py-12">
      <div className="surface-elev h-96 shimmer" />
    </div>
  );
}

function ProtectedAdminRoute({ children }) {
  const { admin, loading } = useAuth();
  if (loading) return null;
  return admin ? children : <Navigate to="/admin/login" />;
}

function ProtectedUserRoute({ children }) {
  const { user, loading } = useUserAuth();
  if (loading) return null;
  return user ? children : <Navigate to="/login" />;
}

export default function App() {
  const { dir } = useLanguage();

  return (
    <div dir={dir}>
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

            <Route path="/register" element={<RegisterPage />} />
            <Route path="/verify" element={<VerifyOtpPage />} />
            <Route path="/login" element={<LoginUserPage />} />

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
              path="/messages"
              element={
                <ProtectedUserRoute>
                  <MessagesPage />
                </ProtectedUserRoute>
              }
            />
            <Route
              path="/messages/:userId"
              element={
                <ProtectedUserRoute>
                  <MessagesPage />
                </ProtectedUserRoute>
              }
            />
            <Route
              path="/profile"
              element={
                <ProtectedUserRoute>
                  <ProfilePage />
                </ProtectedUserRoute>
              }
            />
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
          </Route>
        </Routes>
      </Suspense>
    </div>
  );
}
