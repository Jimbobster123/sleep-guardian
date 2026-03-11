import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { apiJson } from "@/lib/api";

export type User = {
  user_id: string;
  email: string;
  first_name?: string | null;
  last_name?: string | null;
  timezone?: string | null;
};

type AuthContextValue = {
  token: string | null;
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (payload: {
    email: string;
    password: string;
    firstName?: string;
    lastName?: string;
    timezone?: string;
  }) => Promise<void>;
  logout: () => Promise<void>;
  refreshMe: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const TOKEN_KEY = "luna_session_token";

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const setSession = useCallback((t: string | null) => {
    setToken(t);
    if (t) localStorage.setItem(TOKEN_KEY, t);
    else localStorage.removeItem(TOKEN_KEY);
  }, []);

  const refreshMe = useCallback(async () => {
    if (!token) {
      setUser(null);
      return;
    }
    const res = await apiJson<{ user: User }>("/api/me", { token });
    setUser(res.user);
  }, [token]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (token) await refreshMe();
      } catch {
        setSession(null);
        setUser(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, refreshMe, setSession]);

  const login = useCallback(
    async (email: string, password: string) => {
      const res = await apiJson<{ token: string; user: User }>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      setSession(res.token);
      setUser(res.user);
    },
    [setSession]
  );

  const signup = useCallback(
    async (payload: { email: string; password: string; firstName?: string; lastName?: string; timezone?: string }) => {
      const res = await apiJson<{ token: string; user: User }>("/api/auth/signup", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setSession(res.token);
      setUser(res.user);
    },
    [setSession]
  );

  const logout = useCallback(async () => {
    if (token) {
      try {
        await apiJson("/api/auth/logout", { method: "POST", token });
      } catch {
        // ignore
      }
    }
    setSession(null);
    setUser(null);
  }, [token, setSession]);

  const value = useMemo<AuthContextValue>(
    () => ({ token, user, loading, login, signup, logout, refreshMe }),
    [token, user, loading, login, signup, logout, refreshMe]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

