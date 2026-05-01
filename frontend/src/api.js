import axios from "axios";

const api = axios.create({
  baseURL: "/api",
});

api.interceptors.request.use((config) => {
  // Pick the right token based on URL — user endpoints get the user token,
  // admin endpoints get the admin token. Some endpoints (e.g. /players GET)
  // are public and accept either; we prefer the admin token if present.
  const url = config.url || "";
  const isAdminPath =
    url.startsWith("/games/admin") ||
    url.startsWith("/messages/admin") ||
    url.startsWith("/links/admin");
  const userOnly = !isAdminPath && (
    url.startsWith("/users/") ||
    url.startsWith("/games") ||
    url.startsWith("/messages") ||
    url.startsWith("/links/request") ||
    url.startsWith("/links/my-requests")
  );
  const userToken = localStorage.getItem("user_token");
  const adminToken = localStorage.getItem("token");
  const token = userOnly ? userToken : adminToken || userToken;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;
    const path = window.location.pathname;
    if (status === 401) {
      // Auto-redirect only for admin pages (preserve user session UX)
      if (path.startsWith("/admin") && !path.startsWith("/admin/login")) {
        localStorage.removeItem("token");
        window.location.href = "/admin/login";
      }
    }
    return Promise.reject(error);
  }
);

export default api;

