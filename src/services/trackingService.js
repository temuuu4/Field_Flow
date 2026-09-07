import { journeysApi } from '../api/fieldflow';

let watchId = null;
let currentJourneyId = null;
const listeners = new Set();

function notify(event, data) {
  listeners.forEach((fn) => fn(event, data));
}

export function startTracking(journeyId) {
  if (watchId !== null) {
    try {
      navigator.geolocation?.clearWatch(watchId);
    } catch {}
  }
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    notify('error', new Error('Geolocation is not supported in this browser.'));
    return;
  }
  currentJourneyId = journeyId;

  watchId = navigator.geolocation.watchPosition(
    async (pos) => {
      notify('location', pos);
      try {
        const c = pos.coords;
        await journeysApi.location(journeyId, {
          latitude: c.latitude,
          longitude: c.longitude,
          accuracy: Math.round(c.accuracy),
          timestamp: new Date(pos.timestamp).toISOString(),
          ...(c.speed != null ? { speed: c.speed } : {}),
          ...(c.heading != null ? { heading: c.heading } : {}),
        });
        notify('sent', pos);
      } catch (e) {
        notify('error', e);
      }
    },
    (err) => {
      if (watchId !== null) {
        try { navigator.geolocation?.clearWatch(watchId); } catch {}
        watchId = null;
        const prev = currentJourneyId;
        currentJourneyId = null;
        notify('stopped', { journeyId: prev });
      }
      notify('error', err);
    },
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
  );
  notify('started', { journeyId });
}

export function stopTracking() {
  if (watchId !== null) {
    try {
      navigator.geolocation?.clearWatch(watchId);
    } catch {}
    watchId = null;
    const prev = currentJourneyId;
    currentJourneyId = null;
    notify('stopped', { journeyId: prev });
  }
}

export function getCurrentJourneyId() {
  return currentJourneyId;
}

export function isTracking() {
  return typeof navigator !== 'undefined' && navigator.geolocation && watchId !== null;
}

export function onTrackingEvent(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
