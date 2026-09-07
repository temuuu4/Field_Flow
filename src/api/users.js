import { request } from './client';

export const getUsers = (filters = {}) => {
  const query = new URLSearchParams(Object.entries(filters).filter(([, value]) => value !== undefined && value !== null && value !== ''));
  return request(`/api/users${query.size ? `?${query}` : ''}`).then((data) => data.users);
};
export const getUser = (id) => request(`/api/users/${id}`).then((data) => data.user);
export const createUser = (user) => request('/api/users', { method: 'POST', body: user }).then((data) => data.user);
export const updateUser = (id, changes) => request(`/api/users/${id}`, { method: 'PATCH', body: changes }).then((data) => data.user);
export const deactivateUser = (id) => request(`/api/users/${id}/deactivate`, { method: 'PATCH' }).then((data) => data.user);
