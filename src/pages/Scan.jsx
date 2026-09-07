import { useEffect, useState } from 'react';
import { assignmentsApi, journeysApi, samplesApi } from '../api/fieldflow';
import { useLoad, Page, Notice, uid, fail, when } from './utils';
import { Button, SectionCard, FormField, StatusBadge } from '../components/ui';
import BarcodeScanner from '../components/BarcodeScanner';
import { useToast } from '../components/Toast';
import { useTracking } from '../hooks/useTracking';

export default function Scan({ u }) {
  const toast = useToast();
  const { tracking, lastLocation, lastError, startTracking, isTracking } = useTracking();
  const [assignments, setAssignments] = useState([]);
  const [journey, setJourney] = useState(null);
  const [stops, setStops] = useState([]);
  const [barcode, setBarcode] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [selected, setSelected] = useState('');
  const [stopId, setStopId] = useState('');
  const [scanDetected, setScanDetected] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const assignment = assignments.find((x) => uid(x) === selected);

  useEffect(() => {
    let cancelled = false;
    assignmentsApi.list({ driverId: u.id }).then(setAssignments).catch((e) => { if (!cancelled) setError(fail(e)); });
    journeysApi.list({ driverId: u.id, status: 'IN_PROGRESS' }).then((x) => {
      if (cancelled) return;
      const active = x[0] || null;
      setJourney(active);
      if (active && !isTracking()) {
        startTracking(uid(active));
      }
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [u.id]);

  useEffect(() => {
    setStopId('');
    setStops([]);
    if (assignment?.assignmentType === 'LANDMARK_ROUTE') {
      assignmentsApi.stops(uid(assignment)).then(setStops).catch((e) => setError(fail(e)));
    }
  }, [selected]);

      const submit = async () => {
        setSubmitting(true);
        try {
          if (!assignment || !barcode) throw Error('Select an assignment and scan a barcode first.');
          const activeStop = stops.find((s) => uid(s) === stopId);
          if (assignment.assignmentType === 'LANDMARK_ROUTE' && !activeStop) throw Error('Select the current in-progress route stop.');
          if (!lastLocation) throw Error('Location is not available yet. Make sure tracking is active.');
          const body = {
            barcodeValue: barcode,
            driverId: u.id,
            assignmentId: uid(assignment),
            latitude: lastLocation.coords.latitude,
            longitude: lastLocation.coords.longitude,
            accuracy: Math.round(lastLocation.coords.accuracy),
            collectedAt: new Date(lastLocation.timestamp).toISOString(),
            ...(journey && uid(journey?.assignmentId) === uid(assignment) ? { journeyId: uid(journey) } : {}),
            ...(activeStop ? { routeId: uid(assignment.routeId), assignmentStopId: uid(activeStop) } : {}),
          };
          const s = await samplesApi.create(body);
      setMessage(`Sample ${s.sampleNumber} created successfully.`);
      toast(`Sample ${s.sampleNumber} created successfully.`);
      setBarcode('');
      setScanDetected('');
      if (assignment.assignmentType === 'LANDMARK_ROUTE' && activeStop) {
        const currentIndex = stops.findIndex((s) => uid(s) === uid(activeStop));
        const nextStop = stops[currentIndex + 1];
        if (nextStop && nextStop.status === 'PENDING') {
          setStopId(uid(nextStop));
        }
      }
    } catch (e) {
      setError(fail(e));
    } finally {
      setSubmitting(false);
    }
  };

  const activeStop = stops.find((s) => uid(s) === stopId);

  return (
    <Page title="Collect sample" u={u}>
      <SectionCard title="Scan barcode">
        <BarcodeScanner onDetected={(text) => { setBarcode(text); setScanDetected(text); setMessage(''); }} />
        {scanDetected && <p style={{ marginTop: 'var(--space-3)', color: 'var(--success)', fontWeight: 600 }}>Detected: {scanDetected}</p>}
        {barcode && !scanDetected && (
          <FormField label="Or enter barcode manually" className="form-standalone">
            <input value={barcode} onChange={(e) => setBarcode(e.target.value)} placeholder="Enter barcode value" />
          </FormField>
        )}
      </SectionCard>

      <SectionCard title="Sample details">
        <Notice error={error} message={message} />
        {journey && (
          <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap', alignItems: 'center', marginBottom: 'var(--space-4)', padding: 'var(--space-3)', background: 'var(--background)', borderRadius: 'var(--radius-md)', border: '1px solid var(--line)' }}>
            <StatusBadge status={tracking ? 'ACTIVE' : 'INACTIVE'} />
            <span style={{ fontSize: 'var(--text-sm)', color: 'var(--muted)' }}>
              {tracking ? 'Live tracking active' : 'Tracking not active'}
            </span>
            {lastLocation && (
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--muted)' }}>
                Last fix: {new Date(lastLocation.timestamp).toLocaleTimeString()}
              </span>
            )}
          </div>
        )}
        {lastError && <p className="form-error">{lastError}</p>}
        {!journey && (
          <div className="empty-state" style={{ padding: 'var(--space-6) var(--space-4)' }}>
            <div className="empty-state-icon">📍</div>
            <p className="empty-state-title">No active tracking</p>
            <p className="empty-state-description">Open an assignment in My Work to start automatic tracking, then return here to collect samples.</p>
          </div>
        )}
        <form className="form-grid" onSubmit={(e) => { e.preventDefault(); submit(); }}>
          <FormField label="Assignment">
            <select value={selected} onChange={(e) => setSelected(e.target.value)}>
              <option value="">Select assignment</option>
              {assignments.map((a) => (
                <option key={uid(a)} value={uid(a)}>
                  {a.title}
                </option>
              ))}
            </select>
          </FormField>

          {assignment?.assignmentType === 'LANDMARK_ROUTE' && (
            <FormField label="Route stop">
              <select value={stopId} onChange={(e) => setStopId(e.target.value)}>
                <option value="">Select stop</option>
                {stops.map((s) => (
                  <option key={uid(s)} value={uid(s)}>
                    {s.sequence}. {s.name}
                  </option>
                ))}
              </select>
            </FormField>
          )}

          <div className="form-actions">
            <Button variant="primary" type="submit" disabled={!assignment || !barcode || !lastLocation || !tracking} loading={submitting}>
              {submitting ? 'Creating...' : 'Create sample'}
            </Button>
          </div>
        </form>
      </SectionCard>
    </Page>
  );
}
