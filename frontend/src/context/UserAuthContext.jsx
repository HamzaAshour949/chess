import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import api, { SESSION_EXPIRED_EVENT, TOKEN_KEYS } from "../api";
import { refreshSocketAuth } from "../realtime";
import { setSoundEnabled } from "../lib/sound";

const UserAuthContext = createContext(null);

function storeToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEYS.user, token);
    else localStorage.removeItem(TOKEN_KEYS.user);
  } catch {
    /* storage unavailable: the session lasts for this page only */
  }
}

export function UserAuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(() => Boolean(localStorage.getItem(TOKEN_KEYS.user)));
  /** Why the last session ended, when it was not the player's own doing. */
  const [endedReason, setEndedReason] = useState(null);

  const adopt = useCallback((next) => {
    setUser(next);
    if (next) setSoundEnabled(next.notif_sound !== false);
  }, []);

  const refresh = useCallback(async () => {
    const token = localStorage.getItem(TOKEN_KEYS.user);
    if (!token) {
      setUser(null);
      return null;
    }
    try {
      const res = await api.get("/users/auth/me");
      adopt(res.data);
      return res.data;
    } catch (error) {
      // Only a definite "no" signs the player out; a network blip keeps them.
      if ([401, 403].includes(error.response?.status)) {
        storeToken(null);
        setUser(null);
      }
      return null;
    }
  }, [adopt]);

  useEffect(() => {
    if (!localStorage.getItem(TOKEN_KEYS.user)) return;
    api
      .get("/users/auth/me")
      .then((res) => adopt(res.data))
      .catch((error) => {
        if ([401, 403].includes(error.response?.status)) {
          storeToken(null);
          setUser(null);
        }
      })
      .finally(() => setLoading(false));
  }, [adopt]);

  /** Start a session from any endpoint that returns { token, user }. */
  const startSession = useCallback(
    (data) => {
      storeToken(data.token);
      adopt(data.user);
      setEndedReason(null);
      // The socket authenticates at handshake time, so it has to reconnect for
      // the new identity to reach its own notification channel.
      refreshSocketAuth();
      return data.user;
    },
    [adopt],
  );

  const endSession = useCallback((reason = null) => {
    storeToken(null);
    setUser(null);
    setEndedReason(reason);
    refreshSocketAuth();
  }, []);

  // The API layer reports a revoked or expired token; sign out cleanly.
  useEffect(() => {
    const onExpired = () => endSession("expired");
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
  }, [endSession]);

  const value = useMemo(
    () => ({
      user,
      loading,
      endedReason,
      clearEndedReason: () => setEndedReason(null),
      refresh,
      login: async (identifier, password, lang = "en") => {
        const res = await api.post("/users/auth/login", { identifier, password, lang });
        return startSession(res.data);
      },
      register: async (payload) => (await api.post("/users/auth/register", payload)).data,
      verifyOtp: async (email, code) => startSession((await api.post("/users/auth/verify-otp", { email, code })).data),
      resendOtp: async (email, lang = "en") => {
        await api.post("/users/auth/resend-otp", { email, lang });
      },
      requestPasswordReset: async (email, lang = "en") => {
        await api.post("/users/auth/forgot-password", { email, lang });
      },
      resetPassword: async (email, code, password) =>
        startSession((await api.post("/users/auth/reset-password", { email, code, password })).data),
      changePassword: async (current, next) =>
        startSession(
          (await api.post("/users/auth/me/password", { current_password: current, new_password: next })).data,
        ),
      signOutEverywhere: async () => startSession((await api.post("/users/auth/me/sessions/revoke")).data),
      updateProfile: async (data) => {
        const res = await api.patch("/users/auth/me", data);
        adopt(res.data);
        return res.data;
      },
      uploadAvatar: async (file) => {
        const form = new FormData();
        form.append("file", file);
        const res = await api.post("/users/auth/me/avatar", form);
        adopt(res.data);
        return res.data;
      },
      deleteAccount: async (password) => {
        await api.delete("/users/auth/me", { data: { password } });
        endSession("deleted");
      },
      logout: () => endSession(null),
      endSession,
    }),
    [user, loading, endedReason, refresh, startSession, endSession, adopt],
  );

  return <UserAuthContext.Provider value={value}>{children}</UserAuthContext.Provider>;
}

export const useUserAuth = () => useContext(UserAuthContext);
