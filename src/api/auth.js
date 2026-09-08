import { request } from './client';
export const me = () => request('/api/auth/me').then((data) => data.user);
export const login = (body) => request('/api/auth/login', { method: 'POST', body })
  .then((data) => data.user);
export const register = (body) => request('/api/auth/register', { method: 'POST', body })
  .then((data) => data.user);
export const logout = () => request('/api/auth/logout', { method: 'POST' });
export const refresh = () => request('/api/auth/refresh', { method: 'POST' });
export const changePassword = ({ currentPassword, newPassword }) =>
  request('/api/auth/password', {
    method: 'PATCH',
    body: { currentPassword, newPassword },
  });