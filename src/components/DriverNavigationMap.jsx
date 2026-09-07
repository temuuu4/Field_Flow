import { CircleMarker, MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import { useEffect } from 'react';

const driverIcon = L.divIcon({
  className: 'map-marker-wrap',
  html: '<span class="my-location-marker">�</span>',
  iconSize: [28, 28],
  iconAnchor: [14, 14],
});

const stopIcon = L.divIcon({
  className: 'map-marker-wrap',
  html: '<span class="map-marker" style="--marker:#0d9488">📍</span>',
  iconSize: [28, 28],
  iconAnchor: [14, 28],
});

function MapController({ driverPosition, destinationPosition, routePath }) {
  const map = useMap();

  useEffect(() => {
    if (!driverPosition && !destinationPosition && !routePath.length) return;
    if (routePath.length > 1) {
      const bounds = L.latLngBounds(routePath);
      if (driverPosition) bounds.extend(driverPosition);
      if (destinationPosition) bounds.extend(destinationPosition);
      map.fitBounds(bounds.pad(0.28), { animate: true, maxZoom: 16 });
      return;
    }
    const focus = driverPosition ?? destinationPosition;
    if (focus && Array.isArray(focus) && focus.length === 2) {
      map.setView(focus, Math.max(map.getZoom(), 15), { animate: true });
    }
  }, [map, driverPosition, destinationPosition, routePath]);

  return null;
}

export default function DriverNavigationMap({ driverLocation, destinationLocation, route, gpsStatus, routeStatus, stopLabel }) {
  const driverPosition = driverLocation && Number.isFinite(driverLocation.lat) && Number.isFinite(driverLocation.lng)
    ? [driverLocation.lat, driverLocation.lng]
    : null;
  const destinationPosition = destinationLocation && Number.isFinite(destinationLocation.lat) && Number.isFinite(destinationLocation.lng)
    ? [destinationLocation.lat, destinationLocation.lng]
    : null;

  const routePath = Array.isArray(route?.path) && route.path.length > 1 ? route.path : [];
  const mapCenter = driverPosition || destinationPosition || [9.0192, 38.7524];

  return (
    <div className="card" style={{ padding: 'var(--space-5)', marginBottom: 'var(--space-4)', borderLeft: '4px solid var(--primary)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-3)', alignItems: 'center', flexWrap: 'wrap', marginBottom: 'var(--space-3)' }}>
        <div>
          <small>{stopLabel || 'ACTIVE STOP'}</small>
          <h2 style={{ margin: 'var(--space-1) 0' }}>{destinationLocation?.title || 'Current destination'}</h2>
        </div>
        <div style={{ textAlign: 'right', fontSize: 'var(--text-sm)' }}>
          <div><b>{gpsStatus || 'GPS waiting'}</b></div>
          <div style={{ color: 'var(--muted)' }}>{routeStatus || 'Route pending'}</div>
        </div>
      </div>

      <div style={{ height: 320, borderRadius: 'var(--radius-lg)', overflow: 'hidden', border: '1px solid var(--line)' }}>
        <MapContainer center={mapCenter} zoom={14} scrollWheelZoom className="leaflet-map" style={{ height: '100%', width: '100%' }}>
          <TileLayer attribution='&copy; OpenStreetMap contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          <MapController driverPosition={driverPosition} destinationPosition={destinationPosition} routePath={routePath} />
          {routePath.length > 1 && <Polyline positions={routePath} pathOptions={{ color: '#0d9488', weight: 6, opacity: 0.95 }} />}
          {driverPosition && <Marker position={driverPosition} icon={driverIcon}><Popup>Driver location{driverLocation?.accuracy ? ` · ±${Math.round(driverLocation.accuracy)}m` : ''}</Popup></Marker>}
          {destinationPosition && <Marker position={destinationPosition} icon={stopIcon}><Popup>{destinationLocation?.title || 'Active stop'}</Popup></Marker>}
          {destinationPosition && <CircleMarker center={destinationPosition} radius={8} pathOptions={{ color: '#0d9488', fillColor: '#0d9488', fillOpacity: 0.75 }} />}
        </MapContainer>
      </div>
    </div>
  );
}
