import { request } from './client';

// Authentication API surface.
//
// All endpoints except `me()` set HttpOnly authentication cookies on the
// browser (`fieldflow_session` and `fieldflow_refresh`). The frontend
// never reads, writes, or stores these cookies directly — they're
// managed entirely by the backend and the browser cookie jar. Only the
// public-safe `user` projection is returned in the response body.
//
// `login()` sets the auth cookies AND returns the safe user.
// `register()` creates the account and returns the safe user, but
// deliberately does NOT issue JWTs — the backend expects the caller to
// follow up with `login()`. The AuthContext handles that chain
// automatically so the UI sees a single `register()` call.

// `me()` returns the safe user projection for the current session, or
// throws a 401 ApiError if there is no valid session.
export const me = () => request('/api/auth/me').then((data) => data.user);

export const login = (body) => request('/api/auth/login', { method: 'POST', body })
  .then((data) => data.user);

export const register = (body) => request('/api/auth/register', { method: 'POST', body })
  .then((data) => data.user);

// `logout()` asks the backend to invalidate the session (tokenVersion++)
// and clear the cookies. The backend returns 200 with an empty body.
export const logout = () => request('/api/auth/logout', { method: 'POST' });

// `refresh()` rotates the access + refresh cookies. Used internally by the
// AuthContext on 401 — exposed here so tests or future code (e.g. a
// settings page with a "refresh session" button) can invoke it directly.
export const refresh = () => request('/api/auth/refresh', { method: 'POST' });

// `changePassword()` posts the current + new password to the backend. The
// backend verifies the current password with the existing bcrypt config,
// re-hashes the new password, increments tokenVersion (invalidating all
// existing sessions), and returns a safe success message. Cookies are NOT
// re-issued — the frontend is expected to clear its local session and
// redirect to /login so the user signs in again with the new password.
export const changePassword = ({ currentPassword, newPassword }) =>
  request('/api/auth/password', {
    method: 'PATCH',
    body: { currentPassword, newPassword },
  });