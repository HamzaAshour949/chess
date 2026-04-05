import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./context/AuthContext";
import { useLanguage } from "./context/LanguageContext";

import PublicLayout from "./layouts/PublicLayout";
import AdminLayout from "./layouts/AdminLayout";

import HomePage from "./pages/public/HomePage";
import PlayersPage from "./pages/public/PlayersPage";
import PlayerDetailPage from "./pages/public/PlayerDetailPage";
import NewsPage from "./pages/public/NewsPage";
import NewsDetailPage from "./pages/public/NewsDetailPage";

import LoginPage from "./pages/admin/LoginPage";
import DashboardPage from "./pages/admin/DashboardPage";
import AdminPlayersPage from "./pages/admin/AdminPlayersPage";
import PlayerFormPage from "./pages/admin/PlayerFormPage";
import AdminNewsPage from "./pages/admin/AdminNewsPage";
import NewsFormPage from "./pages/admin/NewsFormPage";
import SiteStringsPage from "./pages/admin/SiteStringsPage";

function ProtectedRoute({ children }) {
  const { admin, loading } = useAuth();
  if (loading) return null;
  return admin ? children : <Navigate to="/admin/login" />;
}

export default function App() {
  const { dir } = useLanguage();

  return (
    <div dir={dir}>
      <Routes>
        {/* Public routes */}
        <Route element={<PublicLayout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/players" element={<PlayersPage />} />
          <Route path="/players/:id" element={<PlayerDetailPage />} />
          <Route path="/news" element={<NewsPage />} />
          <Route path="/news/:id" element={<NewsDetailPage />} />
        </Route>

        {/* Admin routes */}
        <Route path="/admin/login" element={<LoginPage />} />
        <Route
          path="/admin"
          element={
            <ProtectedRoute>
              <AdminLayout />
            </ProtectedRoute>
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
        </Route>
      </Routes>
    </div>
  );
}
