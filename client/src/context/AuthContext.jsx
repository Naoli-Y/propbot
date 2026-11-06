import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, setUnauthorizedHandler, tokenStore } from '../lib/api.js';

const AuthContext = createContext(null);
const REFRESH_MS = 60000;

// Pages in the order a user should land on them after login, by permission.
export const HOME_PAGES = [
  { path: '/', perm: 'dashboard.view' },
  { path: '/investor', perm: 'investor.view' },
  { path: '/pipeline', perm: 'pipeline.view' },
  { path: '/leads', perm: 'leads.view' },
  { path: '/settings', perm: null },
];

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(Boolean(tokenStore.get()));

  const logout = useCallback(() => {
    tokenStore.clear();
    setUser(null);
  }, []);

  const refresh = useCallback(async () => {
    if (!tokenStore.get()) return;
    try {
      const r = await api.get('/auth/me');
      setUser(r.data.user);
    } catch (err) {
      if (err.response?.status === 401) logout();
    }
  }, [logout]);

  useEffect(() => {
    setUnauthorizedHandler(logout);
    if (!tokenStore.get()) return;
    refresh().finally(() => setLoading(false));
  }, [logout, refresh]);

  // Permissions can be changed by a super admin at any time — re-check periodically and on tab focus.
  useEffect(() => {
    if (!user) return undefined;
    const t = setInterval(() => { if (document.visibilityState === 'visible') refresh(); }, REFRESH_MS);
    const onFocus = () => refresh();
    window.addEventListener('focus', onFocus);
    return () => { clearInterval(t); window.removeEventListener('focus', onFocus); };
  }, [user, refresh]);

  const login = useCallback(async (email, password) => {
    const { data } = await api.post('/auth/login', { email, password });
    tokenStore.set(data.token);
    setUser(data.user);
    return data.user;
  }, []);

  const value = useMemo(() => {
    const perms = new Set(user?.permissions || []);
    const can = (...p) => p.some((x) => perms.has(x));
    return {
      user,
      loading,
      login,
      logout,
      setUser,
      refresh,
      can,
      isSuperAdmin: user?.role === 'super_admin',
      homePath: (HOME_PAGES.find((h) => !h.perm || perms.has(h.perm)) || HOME_PAGES.at(-1)).path,
    };
  }, [user, loading, login, logout, refresh]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
