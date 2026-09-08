// Authentication context.
//
// Centralized React state for the authenticated session. The backend is
// the security authority — this context merely mirrors the safe `user`
// projection returned by `/api/auth/me` and orchestrates login / register
// / logout from the UI. Tokens remain HttpOnly cookies managed by the
// backend; this module NEVER reads or writes them from JavaScript.
//
// Public API:
//
//   const { user, loading, authenticated, login, register, logout } = useAuth();
//
//   - `user`              : safe user object from the backend, or `null`.
//   - `loading`           : `true` during the initial `/api/auth/me` bootstrap.
//   - `authenticated`     : `true` iff `user` is non-null.
//   - `login(creds)`      : POST /api/auth/login, set the session.
//   - `register(payload)` : POST /api/auth/register, set the session.
//   - `logout()`          : POST /api/auth/logout, clear local state.
//
// The context also wires the shared 401-recovery handler so concurrent
// requests see a single `refresh` attempt.

import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
} from 'react';
import * as authApi from '../api/auth';
import { onUnauthorized } from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  // A single shared refresh promise so concurrent 401s only trigger one
  // backend `/api/auth/refresh` request. The promise is held in a ref so
  // it survives re-renders without going through React state.
  const refreshInFlight = useRef(null);

  const applyUser = useCallback((next) => {
    setUser(next ?? null);
  }, []);

  // Bootstrap: on mount, try `/api/auth/me`. A 401 here is normal (no
  // session) and just means `user` stays null.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const current = await authApi.me();
        if (!cancelled) applyUser(current);
      } catch (error) {
        if (!cancelled) applyUser(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [applyUser]);

  const attemptRefresh = useCallback(async () => {
    // If a refresh is already in flight, reuse its promise. Otherwise
    // start one and remember it for concurrent callers.
    if (refreshInFlight.current) return refreshInFlight.current;
    const promise = (async () => {
      try {
        await authApi.refresh();
        const current = await authApi.me();
        applyUser(current);
        return true;
      } catch (error) {
        applyUser(null);
        return false;
      } finally {
        // Clear after settling so a later 401 can refresh again.
        refreshInFlight.current = null;
      }
    })();
    refreshInFlight.current = promise;
    return promise;
  }, [applyUser]);

  // Wire the shared 401 handler so any request that fails with 401 outside
  // `/api/auth/*` triggers exactly one refresh attempt. If the refresh
  // succeeds, the original request is retried; otherwise the original
  // request still surfaces its 401 to the caller.
  useEffect(() => {
    return onUnauthorized(async ({ path, init }) => {
      // Never recursively refresh — exclude auth endpoints entirely.
      if (path.startsWith('/api/auth/')) return null;
      const ok = await attemptRefresh();
      if (!ok) return null;
      return { retry: true, init };
    });
  }, [attemptRefresh]);

  const login = useCallback(async (credentials) => {
    const next = await authApi.login(credentials);
    applyUser(next);
    return next;
  }, [applyUser]);

  const register = useCallback(async (payload) => {
    // Registration deliberately does NOT auto-login. The backend's
    // `/api/auth/register` creates the account without issuing session
    // cookies — the user must explicitly authenticate at `/login`. This
    // keeps the registration and login flows separate so users confirm
    // their credentials before gaining a session.
    const user = await authApi.register(payload);
    return user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } catch (error) {
      // Backend logout can fail (network, already-expired). The user
      // intends to leave regardless, so swallow and clear local state.
    }
    applyUser(null);
  }, [applyUser]);

  const value = useMemo(() => ({
    user,
    loading,
    authenticated: Boolean(user),
    login,
    register,
    logout,
    setUser: applyUser,
  }), [user, loading, login, register, logout, applyUser]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}