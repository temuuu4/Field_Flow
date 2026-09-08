/**
 * useDriverNavigation
 *
 * Encapsulates everything the driver navigation view needs:
 *   • live GPS position (from useTracking)
 *   • throttled real-road route recalculation (25 m / 20 s)
 *   • human-readable GPS status string
 *   • human-readable route status string
 *   • clear error classification (no raw technical strings exposed)
 *
 * Usage:
 *   const nav = useDriverNavigation({ activeStop, task });
 *   // nav.driverLocation  — { lat, lng, accuracy, ts } | null
 *   // nav.route           — route result object | null
 *   // nav.gpsStatus       — human-readable string
 *   // nav.routeStatus     — human-readable string
 *   // nav.routeWarning    — non-empty string when last route failed
 *   // nav.tracking        — boolean
 *   // nav.networkOnline   — boolean
 *   // nav.lastError       — raw error from useTracking (for logging only)
 *
 * Does NOT manage tracking lifecycle (start/stop) — the caller (MyWork)
 * is responsible for that so journey ownership stays clear.
 */
import { useEffect, useRef, useState } from 'react';
import { useTracking } from './useTracking';
import { formatDistanceMeters, formatEtaSeconds, getRoadRoute } from '../services/routing';

// How far the driver must move (metres) before we recalculate the route.
const RECALC_DISTANCE_M = 25;
// Minimum time (ms) between route requests regardless of distance moved.
const RECALC_INTERVAL_MS = 20_000;

// Rough metres-per-degree approximation sufficient for the throttle check.
function approxDistanceM(a, b) {
  const dlat = (a.lat - b.lat) * 111_000;
  const dlng = (a.lng - b.lng) * 111_000 * Math.cos((a.lat * Math.PI) / 180);
  return Math.sqrt(dlat * dlat + dlng * dlng);
}

// Classify a GeolocationPositionError or generic Error into a user-friendly
// message. Never exposes raw JavaScript error text.
function classifyGpsError(err) {
  if (!err) return null;
  const code = err?.code; // GeolocationPositionError codes: 1=DENIED, 2=UNAVAILABLE, 3=TIMEOUT
  if (code === 1) return 'GPS permission denied. Please allow location access in your browser settings.';
  if (code === 2) return 'GPS signal unavailable. Move to an open area and try again.';
  if (code === 3) return 'GPS timed out. Ensure you have a clear sky view and try again.';
  const msg = String(err?.message || '').toLowerCase();
  if (msg.includes('permission')) return 'GPS permission denied. Please allow location access in your browser settings.';
  if (msg.includes('not supported') || msg.includes('unsupported')) return 'Location tracking is not supported on this device.';
  return 'GPS is unavailable. Check your device location settings.';
}

export function useDriverNavigation({ activeStop } = {}) {
  const { tracking, lastLocation, lastError, trackingJourneyId, startTracking, stopTracking } = useTracking();

  // Route state
  const [route, setRoute] = useState(null);
  const [routeWarning, setRouteWarning] = useState('');
  const lastValidRouteRef = useRef(null);
  const lastOriginRef = useRef(null);
  const lastCalcTimeRef = useRef(0);

  // Network status
  const [networkOnline, setNetworkOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  );
  useEffect(() => {
    const onOnline = () => setNetworkOnline(true);
    const onOffline = () => setNetworkOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  // ── Route recalculation effect ──────────────────────────────────────────
  useEffect(() => {
    // No active stop → clear route
    if (!activeStop) {
      setRoute(null);
      setRouteWarning('');
      lastOriginRef.current = null;
      lastValidRouteRef.current = null;
      return;
    }

    // Stop has no valid coordinates → can't route
    const coords = activeStop.location?.coordinates;
    if (!Array.isArray(coords) || coords.length < 2 ||
        !Number.isFinite(coords[0]) || !Number.isFinite(coords[1])) {
      setRouteWarning('This stop has no map coordinates. Navigation is unavailable.');
      return;
    }

    // Waiting for first GPS fix
    if (!lastLocation) {
      setRouteWarning('Waiting for GPS signal to calculate the route…');
      return;
    }

    const origin = {
      lat: lastLocation.coords.latitude,
      lng: lastLocation.coords.longitude,
    };

    // Throttle: only recalculate if we've moved enough OR enough time passed
    const prevOrigin = lastOriginRef.current;
    const movedEnough = !prevOrigin || approxDistanceM(origin, prevOrigin) >= RECALC_DISTANCE_M;
    const timeElapsed = Date.now() - lastCalcTimeRef.current >= RECALC_INTERVAL_MS;

    if (!movedEnough && !timeElapsed) return;

    // Kick off route request
    lastOriginRef.current = origin;
    lastCalcTimeRef.current = Date.now();
    let cancelled = false;

    // destination: OSRM expects [lng, lat]
    getRoadRoute([
      [origin.lng, origin.lat],
      [coords[0], coords[1]],
    ]).then((result) => {
      if (cancelled) return;
      if (result.status === 'ok') {
        lastValidRouteRef.current = result;
        setRoute(result);
        setRouteWarning('');
      } else {
        // Failed → fall back to last valid snapshot but keep retrying
        if (lastValidRouteRef.current) {
          setRoute(lastValidRouteRef.current);
          setRouteWarning('Route temporarily unavailable — showing last known route.');
        } else {
          setRoute(null);
          setRouteWarning('Route unavailable. Check your connection and keep driving.');
        }
      }
    }).catch(() => {
      if (cancelled) return;
      if (lastValidRouteRef.current) {
        setRoute(lastValidRouteRef.current);
        setRouteWarning('Route temporarily unavailable — showing last known route.');
      } else {
        setRoute(null);
        setRouteWarning('Route unavailable. Check your connection and keep driving.');
      }
    });

    return () => { cancelled = true; };
  }, [activeStop, lastLocation]);

  // ── Derived values ──────────────────────────────────────────────────────
  const driverLocation = lastLocation
    ? {
        lat: lastLocation.coords.latitude,
        lng: lastLocation.coords.longitude,
        accuracy: lastLocation.coords.accuracy ?? null,
        ts: lastLocation.timestamp,
      }
    : null;

  // Human-readable GPS status — never exposes raw error text
  const gpsStatus = (() => {
    if (lastError) return classifyGpsError(lastError);
    if (!lastLocation) return 'Acquiring GPS signal…';
    const acc = Number(lastLocation.coords.accuracy ?? 0);
    if (acc > 100) return `GPS weak (±${Math.round(acc)} m) — move to open area`;
    if (acc > 50) return `GPS fair (±${Math.round(acc)} m)`;
    return `GPS ready · ±${Math.round(acc)} m`;
  })();

  // Human-readable route status
  const effectiveRoute = route?.status === 'ok' ? route : lastValidRouteRef.current;
  const routeStatus = (() => {
    if (!lastLocation) return 'Waiting for GPS…';
    if (effectiveRoute?.status === 'ok') {
      const dist = formatDistanceMeters(effectiveRoute.distanceMeters);
      const eta = formatEtaSeconds(effectiveRoute.durationSeconds);
      return `${dist} · ${eta}`;
    }
    return routeWarning || 'Calculating route…';
  })();

  return {
    // GPS
    tracking,
    driverLocation,
    lastLocation,
    lastError,
    trackingJourneyId,
    startTracking,
    stopTracking,
    // Route
    route: effectiveRoute ?? null,
    liveRoute: route,
    routeWarning,
    // Status strings
    gpsStatus,
    routeStatus,
    // Network
    networkOnline,
  };
}
