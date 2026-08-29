import { createContext, useContext, useEffect, useState, useCallback } from "react";
import api from "../api";
import { refreshSocketAuth } from "../realtime";

const UserAuthContext = createContext();

export function UserAuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const token = localStorage.getItem("user_token");
    if (!token) { setUser(null); return null; }
    try {
      const res = await api.get("/users/auth/me");
      setUser(res.data);
      return res.data;
    } catch {
      localStorage.removeItem("user_token");
      setUser(null);
      return null;
    }
  }, []);

  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, [refresh]);

  const login = async (identifier, password, lang = "en") => {
    const res = await api.post("/users/auth/login", { identifier, password, lang });
    localStorage.setItem("user_token", res.data.token);
    setUser(res.data.user);
    // The socket authenticates at handshake time, so it has to reconnect for
    // the new identity to reach its own notification channel.
    refreshSocketAuth();
    return res.data.user;
  };

  const register = async (payload) => {
    const res = await api.post("/users/auth/register", payload);
    return res.data; // { email, user_id, message }
  };

  const verifyOtp = async (email, code) => {
    const res = await api.post("/users/auth/verify-otp", { email, code });
    localStorage.setItem("user_token", res.data.token);
    setUser(res.data.user);
    refreshSocketAuth();
    return res.data.user;
  };

  const resendOtp = async (email, lang = "en") => {
    await api.post("/users/auth/resend-otp", { email, lang });
  };

  const updateProfile = async (data) => {
    const res = await api.patch("/users/auth/me", data);
    setUser(res.data);
    return res.data;
  };

  const logout = () => {
    localStorage.removeItem("user_token");
    setUser(null);
    refreshSocketAuth();
  };

  return (
    <UserAuthContext.Provider value={{
      user, loading, login, register, verifyOtp, resendOtp, updateProfile, logout, refresh,
    }}>
      {children}
    </UserAuthContext.Provider>
  );
}

export const useUserAuth = () => useContext(UserAuthContext);
