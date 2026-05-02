import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import * as api from './api';

type AuthState = { user: api.AuthUser; token: string } | null;

const AuthContext = createContext<{
  auth: AuthState;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => void;
  refreshSession: () => Promise<void>;
} | null>(null);

const TOKEN_KEY = 'gig_id_token';
const REFRESH_KEY = 'gig_refresh_token';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [auth, setAuth] = useState<AuthState>(null);
  const [loading, setLoading] = useState(true);

  const login = async (email: string, password: string) => {
    const tokens = await api.authLogin(email, password);
    api.setAuthToken(tokens.idToken);
    localStorage.setItem(TOKEN_KEY, tokens.idToken);
    localStorage.setItem(REFRESH_KEY, tokens.refreshToken);
    const user = await api.authMe();
    setAuth({ user, token: tokens.idToken });
  };

  const register = async (email: string, password: string) => {
    await api.authRegister(email, password);
    await login(email, password);
  };

  const logout = () => {
    api.setAuthToken(null);
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_KEY);
    setAuth(null);
  };

  const refreshSession = async () => {
    const refresh = localStorage.getItem(REFRESH_KEY);
    if (!refresh) return;
    const tokens = await api.authRefresh(refresh);
    api.setAuthToken(tokens.idToken);
    localStorage.setItem(TOKEN_KEY, tokens.idToken);
    const user = await api.authMe();
    setAuth({ user, token: tokens.idToken });
  };

  useEffect(() => {
    let cancelled = false;
    const init = async () => {
      const token = localStorage.getItem(TOKEN_KEY);
      const refresh = localStorage.getItem(REFRESH_KEY);
      if (!token) return;
      api.setAuthToken(token);
      try {
        const user = await api.authMe();
        if (!cancelled) setAuth({ user, token });
      } catch {
        if (refresh) {
          try {
            const tokens = await api.authRefresh(refresh);
            api.setAuthToken(tokens.idToken);
            localStorage.setItem(TOKEN_KEY, tokens.idToken);
            const user = await api.authMe();
            if (!cancelled) setAuth({ user, token: tokens.idToken });
          } catch {
            api.setAuthToken(null);
            localStorage.removeItem(TOKEN_KEY);
            localStorage.removeItem(REFRESH_KEY);
            if (!cancelled) setAuth(null);
          }
        } else {
          api.setAuthToken(null);
          localStorage.removeItem(TOKEN_KEY);
          if (!cancelled) setAuth(null);
        }
      }
    };
    init().finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  // Wire a global 401 handler — when an authenticated request gets a 401
  // (typically because the ID token aged out mid-session), wipe local state
  // so the header and gated routes update immediately.
  useEffect(() => {
    if (!auth) {
      api.setUnauthorizedHandler(null);
      return;
    }
    api.setUnauthorizedHandler(() => {
      api.setAuthToken(null);
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(REFRESH_KEY);
      setAuth(null);
    });
    return () => api.setUnauthorizedHandler(null);
  }, [auth]);

  return (
    <AuthContext.Provider value={{ auth, loading, login, register, logout, refreshSession }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
