import { request } from './client';

const query = (params = {}) => {
  const values = Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== '');
  return values.length ? `?${new URLSearchParams(values)}` : '';
};

export const assignmentsApi = {
  list: (filters) => request(`/api/assignments${query(filters)}`).then(({ assignments }) => assignments),
  get: (id) => request(`/api/assignments/${id}`), create: (body) => request('/api/assignments', { method: 'POST', body }),
  update: (id, body) => request(`/api/assignments/${id}`, { method: 'PATCH', body }), accept: (id) => request(`/api/assignments/${id}/accept`, { method: 'POST' }),
  cancel: (id) => request(`/api/assignments/${id}`, { method: 'DELETE' }),
  decline: (id, body) => request(`/api/assignments/${id}`, { method: 'PATCH', body }),
  stops: (id) => request(`/api/assignments/${id}/stops`).then(({ stops }) => stops),
  stopAction: (assignmentId, stopId, action, body) => request(`/api/assignments/${assignmentId}/stops/${stopId}/${action}`, { method: 'POST', body }),
};
export const collectionLocationsApi = {
  list: (filters) => request(`/api/collection-locations${query(filters)}`).then(({ collectionLocations }) => collectionLocations),
  get: (id) => request(`/api/collection-locations/${id}`),
  create: (body) => request('/api/collection-locations', { method: 'POST', body }),
};
export const routesApi = {
  list: (filters) => request(`/api/routes${query(filters)}`).then(({ routes }) => routes), get: (id) => request(`/api/routes/${id}`),
  create: (body) => request('/api/routes', { method: 'POST', body }), update: (id, body) => request(`/api/routes/${id}`, { method: 'PATCH', body }), archive: (id) => request(`/api/routes/${id}`, { method: 'DELETE' }),
  addStop: (id, body) => request(`/api/routes/${id}/stops`, { method: 'POST', body }), updateStop: (routeId, stopId, body) => request(`/api/routes/${routeId}/stops/${stopId}`, { method: 'PATCH', body }), removeStop: (routeId, stopId) => request(`/api/routes/${routeId}/stops/${stopId}`, { method: 'DELETE' }),
};
export const journeysApi = {
  list: (filters) => request(`/api/journeys${query(filters)}`).then(({ journeys }) => journeys), get: (id) => request(`/api/journeys/${id}`).then(({ journey }) => journey),
  start: (body) => request('/api/journeys/start', { method: 'POST', body }).then(({ journey }) => journey), end: (id, body) => request(`/api/journeys/${id}/end`, { method: 'POST', body }).then(({ journey }) => journey),
  arrive: (id) => request(`/api/journeys/${id}/arrive`, { method: 'POST', body: {} }).then(({ journey }) => journey),
  activeTask: () => request('/api/journeys/active-task').then(({ task }) => task),
  location: (id, body) => request(`/api/journeys/${id}/location`, { method: 'POST', body }), presence: (driverId) => request(`/api/driver-presence/${driverId}`),
  history: (id) => request(`/api/journeys/${id}/history`).then(({ points }) => points),
};
export const samplesApi = {
  list: (filters) => request(`/api/samples${query(filters)}`).then(({ samples }) => samples), get: (id) => request(`/api/samples/${id}`).then(({ sample }) => sample),
  create: (body) => request('/api/samples', { method: 'POST', body }).then(({ sample }) => sample), update: (id, body) => request(`/api/samples/${id}`, { method: 'PATCH', body }).then(({ sample }) => sample),
  remove: (id, body) => request(`/api/samples/${id}`, { method: 'DELETE', body }), submit: (id, body) => request(`/api/samples/${id}/submit`, { method: 'POST', body }).then(({ sample }) => sample),
  approve: (id, body) => request(`/api/samples/${id}/approve`, { method: 'POST', body }).then(({ sample }) => sample), reject: (id, body) => request(`/api/samples/${id}/reject`, { method: 'POST', body }).then(({ sample }) => sample),
};
export const schedulesApi = {
  list: (filters) => request(`/api/recurring-schedules${query(filters)}`).then(({ schedules }) => schedules), create: (body) => request('/api/recurring-schedules', { method: 'POST', body }),
  update: (id, body) => request(`/api/recurring-schedules/${id}`, { method: 'PATCH', body }), end: (id, body) => request(`/api/recurring-schedules/${id}`, { method: 'DELETE', body }), generate: (id) => request(`/api/recurring-schedules/${id}/generate`, { method: 'POST' }),
};
export const notificationsApi = {
  list: () => request('/api/notifications').then(({ notifications }) => notifications),
  read: (id) => request(`/api/notifications/${id}/read`, { method: 'PATCH' }),
  readAll: () => request('/api/notifications/read-all', { method: 'PATCH' }),
};
export const pushSubscriptionsApi = {
  list: (filters) => request(`/api/push-subscriptions${query(filters)}`).then(({ subscriptions }) => subscriptions),
  create: (body) => request('/api/push-subscriptions', { method: 'POST', body }).then(({ subscription }) => subscription),
  update: (id, body) => request(`/api/push-subscriptions/${id}`, { method: 'PATCH', body }).then(({ subscription }) => subscription),
  remove: (id) => request(`/api/push-subscriptions/${id}`, { method: 'DELETE' }),
  vapidPublicKey: () => request('/api/push-subscriptions/vapid-public-key').then((data) => data.publicKey),
};
