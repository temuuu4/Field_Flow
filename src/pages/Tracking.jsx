import { useEffect, useState } from 'react';
import { journeysApi } from '../api/fieldflow';
import { useLoad, Page, Notice, uid, fail } from './utils';
import { Button, SectionCard, StatusBadge } from '../components/ui';
import { useToast } from '../components/Toast';
import { useTracking } from '../hooks/useTracking';

export default function Tracking({ u }) {
  const toast = useToast();
  const { tracking, lastLocation, lastError, isTracking } = useTracking();
  const [journey, setJourney] = useState(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [permState, setPermState] = useState('unknown');
  const geoAvailable = typeof navigator !== 'undefined' && 'geolocation' in navigator;

  useEffect(() => {
    let cancelled = false;
    journeysApi.list({ driverId: u.id, status: 'IN_PROGRESS' }).then((x) => {
      if (cancelled) return;
      const active = x[0] || null;
      setJourney(active);
    }).catch((e) => {
      if (!cancelled) setError(fail(e));
    });
    if (typeof navigator !== 'undefined' && navigator.permissions?.query) {
      navigator.permissions.query({ name: 'geolocation' }).then((s) => { setPermState(s.state); s.onchange = () => setPermState(s.state); }).catch(() => {});
    }
    return () => { cancelled = true; };
  }, [u.id]);

  useEffect(() => {
    if (lastLocation) {
      const c = lastLocation.coords;
      setMessage(`Location updated at ${new Date().toLocaleTimeString()}.`);
    }
  }, [lastLocation]);

  useEffect(() => {
    if (lastError) {
      setError(lastError);
    }
  }, [lastError]);

  const statusLabel = tracking ? 'Active' : lastError ? 'Error' : 'Waiting for journey';
  const statusTone = tracking ? 'success' : lastError ? 'danger' : 'muted';

  return (
    <Page title="Journey & GPS" u={u}>
      <div className="grid-2">
        <SectionCard title="Tracking status">
          <Notice error={error} message={message} />
          <div style={{ display: 'grid', gap: 'var(--space-4)' }}>
            <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap', alignItems: 'center' }}>
              <StatusBadge status={tracking ? 'ACTIVE' : 'INACTIVE'} />
              <span style={{ fontSize: 'var(--text-sm)', color: 'var(--muted)' }}>
                {tracking ? 'Live tracking active' : 'No active tracking session'}
              </span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 'var(--space-4)', fontSize: 'var(--text-sm)' }}>
              <div>
                <small style={{ color: 'var(--muted)', fontSize: 'var(--text-xs)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Status</small>
                <div style={{ fontWeight: 600 }}>{statusLabel}</div>
              </div>
              <div>
                <small style={{ color: 'var(--muted)', fontSize: 'var(--text-xs)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Permission</small>
                <div style={{ fontWeight: 600 }}>{permState.toUpperCase()}</div>
              </div>
            </div>
            {journey && (
              <div style={{ padding: 'var(--space-3)', background: 'var(--background)', borderRadius: 'var(--radius-md)', border: '1px solid var(--line)', fontSize: 'var(--text-sm)' }}>
                <small style={{ color: 'var(--muted)', fontSize: 'var(--text-xs)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Current journey</small>
                <div style={{ fontWeight: 600, marginTop: 'var(--space-1)' }}>Assignment: {journey.assignmentId?.title || journey.assignmentId || '—'}</div>
                <small style={{ color: 'var(--muted)' }}>Status: {journey.status}</small>
              </div>
            )}
            {!journey && (
              <p style={{ color: 'var(--muted)', fontSize: 'var(--text-sm)' }}>Open an assignment in My Work to begin automatic tracking.</p>
            )}
          </div>
        </SectionCard>

        <SectionCard title="Device location">
          <div style={{ display: 'grid', gap: 'var(--space-4)' }}>
            <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
              <StatusBadge status={tracking ? 'ACTIVE' : 'INACTIVE'} />
              <span style={{ fontSize: 'var(--text-sm)', color: 'var(--muted)' }}>
                {geoAvailable ? 'Geolocation available' : 'Geolocation unavailable'}
              </span>
            </div>
            {lastLocation ? (
              <div style={{ display: 'grid', gap: 'var(--space-2)', fontSize: 'var(--text-sm)' }}>
                <div><b>Latitude:</b> {lastLocation.coords.latitude.toFixed(6)}</div>
                <div><b>Longitude:</b> {lastLocation.coords.longitude.toFixed(6)}</div>
                <div><b>Accuracy:</b> ±{Math.round(lastLocation.coords.accuracy)}m</div>
                <div><b>Last update:</b> {new Date(lastLocation.timestamp).toLocaleTimeString()}</div>
              </div>
            ) : (
              <p style={{ color: 'var(--muted)', fontSize: 'var(--text-sm)' }}>No location data yet. Tracking will begin automatically when a journey is active.</p>
            )}
            {lastError && <p className="form-error">{lastError}</p>}
          </div>
        </SectionCard>
      </div>
    </Page>
  );
}
