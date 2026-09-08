// Road routing abstraction. The app defaults to OSRM but reads its base URL
// from the environment so the provider can be swapped or configured per
// deployment without rewriting the Driver workflow code.
const defaultProvider = import.meta.env.VITE_ROUTING_PROVIDER || 'osrm';
const defaultBaseUrl = import.meta.env.VITE_OSRM_URL || 'https://router.project-osrm.org';

// Only successful routes are cached. Failed / invalid results are never
// stored so that a temporary GPS or network failure does not permanently
// block recalculation once the device recovers.
const cache = new Map();

const normalizePoint = (point) => {
  if (Array.isArray(point) && point.length >= 2) {
    return { lng: Number(point[0]), lat: Number(point[1]) };
  }
  if (point && typeof point === 'object') {
    const lng = Number(point.lng ?? point.longitude ?? point[0]);
    const lat = Number(point.lat ?? point.latitude ?? point[1]);
    if (Number.isFinite(lng) && Number.isFinite(lat)) {
      return { lng, lat };
    }
  }
  return null;
};

const toLeafletPath = (coordinates) => coordinates.map(([lng, lat]) => [lat, lng]);

export const routingConfig = Object.freeze({
  provider: defaultProvider,
  baseUrl: defaultBaseUrl,
  endpoint: `${defaultBaseUrl}/route/v1/driving`,
  isPublicDemo: defaultBaseUrl.includes('router.project-osrm.org'),
});

export function formatDistanceMeters(distanceMeters) {
  if (!Number.isFinite(distanceMeters) || distanceMeters == null) return '—';
  if (distanceMeters < 1000) return `${Math.round(distanceMeters)} m`;
  return `${(distanceMeters / 1000).toFixed(1)} km`;
}

export function formatEtaSeconds(durationSeconds) {
  if (!Number.isFinite(durationSeconds) || durationSeconds == null) return 'ETA unavailable';
  const totalMinutes = Math.max(1, Math.round(durationSeconds / 60));
  if (totalMinutes < 60) return `${totalMinutes} min`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes ? `${hours}h ${minutes}m` : `${hours}h`;
}

export async function getRoadRoute(coordinates) {
  if (!Array.isArray(coordinates) || coordinates.length < 2) {
    return { path: [], distanceMeters: null, durationSeconds: null, provider: routingConfig.provider, status: 'invalid' };
  }

  const normalized = coordinates
    .map((point) => normalizePoint(point))
    .filter(Boolean);

  if (normalized.length < 2) {
    return { path: [], distanceMeters: null, durationSeconds: null, provider: routingConfig.provider, status: 'invalid' };
  }

  const bounded = normalized.filter(({ lng, lat }) => Number.isFinite(lng) && Number.isFinite(lat) && lng >= -180 && lng <= 180 && lat >= -90 && lat <= 90);
  if (bounded.length < 2) {
    return { path: [], distanceMeters: null, durationSeconds: null, provider: routingConfig.provider, status: 'invalid' };
  }

  const key = JSON.stringify(bounded.map(({ lng, lat }) => [lng, lat]));
  if (cache.has(key)) return cache.get(key);

  const legs = bounded.map(({ lng, lat }) => `${lng},${lat}`).join(';');
  const url = `${routingConfig.baseUrl}/route/v1/driving/${legs}?overview=full&geometries=geojson&alternatives=false`;

  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timeoutMs = 12000;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;

  try {
    const res = await fetch(url, { signal: controller?.signal, headers: { Accept: 'application/json' } });
    if (!res.ok) {
      // Do NOT cache failures — let the next GPS update retry.
      return { path: [], distanceMeters: null, durationSeconds: null, provider: routingConfig.provider, status: 'failed' };
    }

    const data = await res.json();
    if (data.code !== 'Ok' || !Array.isArray(data.routes) || !data.routes.length) {
      return { path: [], distanceMeters: null, durationSeconds: null, provider: routingConfig.provider, status: 'failed' };
    }

    const geometry = data.routes[0].geometry;
    if (geometry?.type !== 'LineString' || !Array.isArray(geometry.coordinates)) {
      return { path: [], distanceMeters: null, durationSeconds: null, provider: routingConfig.provider, status: 'failed' };
    }

    const path = toLeafletPath(geometry.coordinates);
    const result = {
      path,
      distanceMeters: Number(data.routes[0].distance) || null,
      durationSeconds: Number(data.routes[0].duration) || null,
      provider: routingConfig.provider,
      status: 'ok',
    };
    // Only cache successful results so transient failures are retried.
    cache.set(key, result);
    return result;
  } catch {
    // Network error / timeout / abort — do NOT cache, will retry on next GPS tick.
    return { path: [], distanceMeters: null, durationSeconds: null, provider: routingConfig.provider, status: 'failed' };
  } finally {
    if (timer) clearTimeout(timer);
  }
}
