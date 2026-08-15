'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { api, clearTokens, getStoredUser, saveUser, setTokens, type User } from './api';

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const stored = getStoredUser();
    if (!stored) {
      setLoading(false);
      return;
    }
    setUser(stored);
    api<User>('/auth/me')
      .then((me) => {
        setUser(me);
        saveUser(me);
      })
      .catch(() => {
        clearTokens();
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      async login(email, password) {
        const data = await api<{
          user: User;
          accessToken: string;
          refreshToken: string;
        }>('/auth/login', {
          method: 'POST',
          body: JSON.stringify({ email, password }),
        }, false);
        setTokens(data.accessToken, data.refreshToken);
        saveUser(data.user);
        setUser(data.user);
      },
      logout() {
        const refreshToken =
          typeof window !== 'undefined' ? localStorage.getItem('refreshToken') : null;
        if (refreshToken) {
          void api('/auth/logout', {
            method: 'POST',
            body: JSON.stringify({ refreshToken }),
          }).catch(() => undefined);
        }
        clearTokens();
        setUser(null);
        window.location.href = '/login';
      },
    }),
    [user, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth outside provider');
  return ctx;
}
