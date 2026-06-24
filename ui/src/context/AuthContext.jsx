'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { fetchMe, getToken, loginRequest, setToken } from '../lib/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    const token = getToken();
    if (!token) {
      setUser(null);
      setLoading(false);
      return null;
    }
    const me = await fetchMe();
    if (!me) {
      setToken(null);
      setUser(null);
    } else {
      setUser(me);
    }
    setLoading(false);
    return me;
  }, []);

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  const login = useCallback(async (username, password) => {
    const data = await loginRequest(username, password);
    setToken(data.token);
    setUser(data.user);
    return data.user;
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({
      user,
      loading,
      isAdmin: user?.role === 'admin',
      isSpoc: user?.role === 'spoc',
      login,
      logout,
      refreshUser,
    }),
    [user, loading, login, logout, refreshUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
