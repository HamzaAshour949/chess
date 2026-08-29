import axios from "axios";

const api = axios.create({ baseURL: "/api" });

export const TOKEN_KEYS = { admin: "token", user: "user_token" };

/**
 * Which identity should sign this request?
 *
 * The platform has two separate identities and the tokens are not
 * interchangeable — the server rejects an admin token on a player route and
 * vice versa — so the client has to pick deliberately rather than sending
 * whichever happens to be in localStorage.
 */
function audienceFor(url = "") {
  const path = url.split("?")[0];

  // Admin sub-trees inside otherwise player-facing prefixes.
  if (/^\/(games|messages|links)\/admin(\/|$)/.test(path)) return "admin";

  if (/^\/(auth|upload|strings)(\/|$)/.test(path)) return "admin";
  if (/^\/(news|players)\/admin(\/|$)/.test(path)) return "admin";

  if (/^\/(users|games|messages|links)(\/|$)/.test(path)) return "user";

  // Public content (players, news, strings reads) — send an admin token when
  // there is one so drafts stay visible in the admin previews.
  return "either";
}

api.interceptors.request.use((config) => {
  const adminToken = localStorage.getItem(TOKEN_KEYS.admin);
  const userToken = localStorage.getItem(TOKEN_KEYS.user);

  const audience = audienceFor(config.url);
  const token =
    audience === "admin" ? adminToken : audience === "user" ? userToken : adminToken || userToken;

  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;
    const path = window.location.pathname;

    // Only bounce out of the admin area. A player hitting a 401 stays put so a
    // transient failure never throws away what they were doing.
    if (status === 401 && path.startsWith("/admin") && !path.startsWith("/admin/login")) {
      localStorage.removeItem(TOKEN_KEYS.admin);
      window.location.href = "/admin/login";
    }
    return Promise.reject(error);
  }
);

/** The `error` string the API returns, with a sensible fallback. */
export function apiError(error, fallback = "Something went wrong") {
  return error?.response?.data?.error || error?.message || fallback;
}

export default api;
