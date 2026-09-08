/**
 * DriverNavigationMap
 *
 * Renders the live navigation card: map, driver marker, destination,
 * real road polyline, and a status overlay.
 *
 * Props:
 *   driverLocation    { lat, lng, accuracy, ts } | null
 *   destinationLocation { lat, lng, title } | null
 *   route             route result from useDriverNavigation (path, status, …)
 *   gpsStatus         human-readable string from useDriverNavigation
 *   routeStatus       human-readable distance/ETA string
 *   routeWarning      non-empty when route is degraded
 *   stopLabel         e.g. "STOP 2 OF 4" or "ACTIVE COLLECTION"
 *   networkOnline     boolean
 *   journeyStatus     e.g. "IN_PROGRESS"
 */
import { CircleMarker, MapContainer, Marker, Polyline, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import { useEffect } from 'react';

// ── Leaflet icons ─────────────────────────────────────────────────────────
const driverIcon = L.divIcon({
  className: 'map-marker-wrap',
  html: '<span class="my-location-marker" title="Your location">📍</span>',
  iconSize: [28, 28],
  iconAnchor: [14, 14],
});

const stopIcon = L.divIcon({
  className: 'map-marker-wrap',
  html: '<span class="map-marker" style="--marker:#0d9488" title="Collection point">📦</span>',
  iconSize: [32, 32],
  iconAnchor: [16, 32],
});

// ── Auto-fit bounds whenever key layers change ────────────────────────────
function MapController({ driverPosition, destinationPosition, routePath }) {
  const map = useMap();

  useEffect(() => {
    if (!map) return;

    if (routePath.length > 1) {
      const bounds = L.latLngBounds(routePath);
      if (driverPosition) bounds.extend(driverPosition);
      if (destinationPosition) bounds.extend(destinationPosition);
      try {
        map.fitBounds(bounds.pad(0.28), { animate: true, maxZoom: 16 });
      } catch {
        // fitBounds can throw if the map is not yet fully initialised
      }
      return;
    }

    const focus = driverPosition ?? destinationPosition;
    if (focus && Array.isArray(focus) && focus.length === 2) {
      map.setView(focus, Math.max(map.getZoom() ?? 14, 15), { animate: true });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [driverPosition?.[0], driverPosition?.[1], destinationPosition?.[0], destinationPosition?.[1], routePath.length]);

  return null;
}

export default function DriverNavigationMap({
  driverLocation,
  destinationLocation,
  route,
  gpsStatus,
  routeStatus,
  routeWarning,
  stopLabel,
  networkOnline,
  journeyStatus,
}) {
  const driverPosition = driverLocation &&
    Number.isFinite(driverLocation.lat) &&
    Number.isFinite(driverLocation.lng)
    ? [driverLocation.lat, driverLocation.lng]
    : null;

  const destinationPosition = destinationLocation &&
    Number.isFinite(destinationLocation.lat) &&
    Number.isFinite(destinationLocation.lng)
    ? [destinationLocation.lat, destinationLocation.lng]
    : null;

  const routePath = Array.isArray(route?.path) && route.path.length > 1 ? route.path : [];
  const mapCenter = driverPosition || destinationPosition || [9.0192, 38.7524];

  // Accuracy ring radius in pixels: cap at something visible but not huge
  const accuracyRadius = driverLocation?.accuracy
    ? Math.min(Math.max(driverLocation.accuracy, 8), 60)
    : null;

  return (
    <div className="dnav-card">
      {/* ── Header row ──────────────────────────────────────────────── */}
      <div className="dnav-header">
        <div className="dnav-header-left">
          <span className="dnav-stop-label">{stopLabel || 'ACTIVE STOP'}</span>
          <span className="dnav-destination">{destinationLocation?.title || 'Navigating…'}</span>
        </div>
        <div className="dnav-header-right">
          {!networkOnline && (
            <span className="dnav-badge dnav-badge--offline" title="No network connection">
              ✕ Offline
            </span>
          )}
          {journeyStatus === 'IN_PROGRESS' && networkOnline && (
            <span className="dnav-badge dnav-badge--live" title="Journey in progress">
              ● Live
            </span>
          )}
        </div>
      </div>

      {/* ── Route info row ──────────────────────────────────────────── */}
      <div className="dnav-route-row">
        <span className="dnav-route-status">{routeStatus}</span>
        {routeWarning && (
          <span className="dnav-route-warning">⚠ {routeWarning}</span>
        )}
      </div>

      {/* ── Map ─────────────────────────────────────────────────────── */}
      <div className="dnav-map-wrap">
        <MapContainer
          center={mapCenter}
          zoom={14}
          scrollWheelZoom
          className="leaflet-map dnav-leaflet-map"
          style={{ height: '100%', width: '100%' }}
        >
          <TileLayer
            attribution="&copy; OpenStreetMap contributors"
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <MapController
            driverPosition={driverPosition}
            destinationPosition={destinationPosition}
            routePath={routePath}
          />
          {/* Real road route polyline */}
          {routePath.length > 1 && (
            <Polyline
              positions={routePath}
              pathOptions={{ color: '#0d9488', weight: 5, opacity: 0.9 }}
            />
          )}
          {/* Driver position */}
          {driverPosition && (
            <>
              <Marker position={driverPosition} icon={driverIcon} />
              {accuracyRadius && (
                <CircleMarker
                  center={driverPosition}
                  radius={accuracyRadius}
                  pathOptions={{ color: '#0d9488', fillColor: '#0d9488', fillOpacity: 0.1, weight: 1 }}
                />
              )}
            </>
          )}
          {/* Destination */}
          {destinationPosition && (
            <>
              <Marker position={destinationPosition} icon={stopIcon} />
              <CircleMarker
                center={destinationPosition}
                radius={10}
                pathOptions={{ color: '#0d9488', fillColor: '#0d9488', fillOpacity: 0.6, weight: 2 }}
              />
            </>
          )}
        </MapContainer>

        {/* GPS status overlay — bottom-left of map */}
        <div className="dnav-gps-overlay">
          {gpsStatus}
        </div>
      </div>
    </div>
  );
}
