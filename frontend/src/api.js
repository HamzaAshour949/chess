import axios from "axios";

const api = axios.create({ baseURL: "/api", timeout: 20_000 });

export const TOKEN_KEYS = { admin: "token", user: "user_token" };

/** Fired when the server stops accepting the stored player token. */
export const SESSION_EXPIRED_EVENT = "chesshub:session-expired";

function readToken(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/**
 * Which identity should sign this request?
 *
 * The platform has two separate identities and the tokens are not
 * interchangeable — the server rejects an admin token on a player route and
 * vice versa — so the client has to pick deliberately rather than sending
 * whichever happens to be in localStorage.
 */
export function audienceFor(url = "") {
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
  const adminToken = readToken(TOKEN_KEYS.admin);
  const userToken = readToken(TOKEN_KEYS.user);

  const audience = audienceFor(config.url);
  const token =
    audience === "admin" ? adminToken : audience === "user" ? userToken : adminToken || userToken;

  if (token) config.headers.Authorization = `Bearer ${token}`;
  config.metadata = { audience, sentToken: token };
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;
    const { audience, sentToken } = error.config?.metadata ?? {};
    const path = window.location.pathname;

    if (status === 401 && sentToken) {
      if (audience === "admin" && path.startsWith("/admin") && !path.startsWith("/admin/login")) {
        localStorage.removeItem(TOKEN_KEYS.admin);
        window.location.href = "/admin/login";
      } else if (audience === "user" && sentToken === readToken(TOKEN_KEYS.user)) {
        // Revoked (password changed elsewhere, "sign out everywhere", account
        // deleted) or expired. The auth context signs out and says why.
        window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT));
      }
    }
    return Promise.reject(error);
  },
);

/** The `error` string the API returns, with a sensible fallback. */
export function apiError(error, fallback = "Something went wrong") {
  if (error?.code === "ECONNABORTED") return "The server took too long to answer. Try again.";
  if (!error?.response && error?.message === "Network Error") {
    return "Can't reach the server. Check your connection.";
  }
  return error?.response?.data?.error || fallback;
}

/** Field-level validation messages, keyed by field path. */
export function fieldErrors(error) {
  const details = error?.response?.data?.details;
  if (!Array.isArray(details)) return {};
  return Object.fromEntries(details.filter((d) => d?.path).map((d) => [d.path, d.message]));
}

export default api;
