import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import * as api from './api';

type AuthState = { user: api.AuthUser; token: string } | null;

const AuthContext = createContext<{
  auth: AuthState;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => void;
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

  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY);
    const refresh = localStorage.getItem(REFRESH_KEY);
    if (!token) {
      setLoading(false);
      return;
    }
    api.setAuthToken(token);
    api.authMe()
      .then((user) => setAuth({ user, token }))
      .catch(() => {
        if (refresh) {
          api.authRefresh(refresh)
            .then((tokens) => {
              api.setAuthToken(tokens.idToken);
              localStorage.setItem(TOKEN_KEY, tokens.idToken);
              return api.authMe();
            })
            .then((user) => setAuth({ user, token: localStorage.getItem(TOKEN_KEY)! }))
            .catch(() => {
              api.setAuthToken(null);
              localStorage.removeItem(TOKEN_KEY);
              localStorage.removeItem(REFRESH_KEY);
            });
        } else {
          api.setAuthToken(null);
          localStorage.removeItem(TOKEN_KEY);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <AuthContext.Provider value={{ auth, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
