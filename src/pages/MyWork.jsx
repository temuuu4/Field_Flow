import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { assignmentsApi, journeysApi, samplesApi } from '../api/fieldflow';
import { Page, Notice, uid, fail, when } from './utils';
import { Button, SectionCard, StatusBadge } from '../components/ui';
import BarcodeScanner from '../components/BarcodeScanner';
import DriverNavigationMap from '../components/DriverNavigationMap';
import { DeclineAssignmentModal } from '../components/DeclineAssignmentModal';
import { useToast } from '../components/Toast';
import { getCurrentPosition } from '../services/geolocation';
import { getRoadRoute, formatDistanceMeters, formatEtaSeconds } from '../services/routing';
import { useTracking } from '../hooks/useTracking';

const terminal = new Set(['COMPLETED', 'SKIPPED']);

export default function MyWork({ u }) {
  const toast = useToast();
  const { tracking, lastLocation, lastError, startTracking, stopTracking, trackingJourneyId } = useTracking();
  const [assignments, setAssignments] = useState([]);
  const [task, setTask] = useState(null);
  const [selected, setSelected] = useState(null);
  const [declineTarget, setDeclineTarget] = useState(null);
  const [barcode, setBarcode] = useState('');
  const [scannerOpen, setScannerOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [routeState, setRouteState] = useState(null);
  const [routeWarning, setRouteWarning] = useState('');
  const lastRouteOriginRef = useRef(null);
  const lastRouteUpdateRef = useRef(0);
  const lastValidRouteRef = useRef(null);

  const reload = useCallback(async () => {
    const [assignmentList, activeTask] = await Promise.all([assignmentsApi.list({ driverId: u.id }), journeysApi.activeTask()]);
    setAssignments(assignmentList); setTask(activeTask);
    return activeTask;
  }, [u.id]);

  useEffect(() => {
    let live = true;
    reload().catch((cause) => live && setError(fail(cause))).finally(() => live && setLoading(false));
    return () => { live = false; stopTracking(); };
  }, [reload, stopTracking]);

  useEffect(() => {
    if (task?.journey && trackingJourneyId !== uid(task.journey)) startTracking(uid(task.journey));
  }, [task, trackingJourneyId, startTracking]);

  const run = async (name, work, success) => {
    setAction(name); setError(''); setMessage('');
    try { await work(); await reload(); if (success) { setMessage(success); toast(success); } }
    catch (cause) { setError(fail(cause)); }
    finally { setAction(''); }
  };

  const startJourney = () => run('start', async () => {
    const pos = await getCurrentPosition({ enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
    // One-click Start Journey: the assignment is auto-accepted on the
    // server (so operators see a clean ACCEPTED → IN_PROGRESS transition),
    // the journey is opened with the current GPS fix, and live tracking
    // kicks off so the operator can follow the driver until the journey
    // ends automatically when the sample is captured.
    if (selected?.status === 'ASSIGNED') {
      await assignmentsApi.accept(uid(selected));
    }
    const journey = await journeysApi.start({ assignmentId: uid(selected), latitude: pos.lat, longitude: pos.lng, accuracy: Math.round(pos.accuracy), timestamp: new Date(pos.ts).toISOString() });
    startTracking(uid(journey));
  }, 'Journey started. Your live location is now being shared with the operator.');

  const activeStop = task?.activeStop;
  const activeSample = task?.activeSample;
  const arrived = Boolean(activeStop?.arrivedAt || task?.journey?.arrivedAt);
  const sampleCaptured = activeSample?.status === 'PENDING';
  const sampleSubmitted = activeSample?.status === 'SUBMITTED';
  const driverLocation = lastLocation ? {
    lat: lastLocation.coords.latitude,
    lng: lastLocation.coords.longitude,
    accuracy: lastLocation.coords.accuracy,
    ts: lastLocation.timestamp,
  } : null;

  useEffect(() => {
    if (!activeStop) {
      setRouteState(null);
      lastRouteOriginRef.current = null;
      return;
    }

    const stopCoordinates = activeStop.location?.coordinates;
    if (!Array.isArray(stopCoordinates) || stopCoordinates.length < 2) {
      setRouteState(null);
      lastRouteOriginRef.current = null;
      return;
    }

    if (!lastLocation) {
      setRouteWarning('Waiting for live GPS to calculate the route.');
      return;
    }

    const origin = { lat: lastLocation.coords.latitude, lng: lastLocation.coords.longitude };
    const previousOrigin = lastRouteOriginRef.current;
    const distanceFromLast = previousOrigin
      ? Math.hypot(origin.lat - previousOrigin.lat, origin.lng - previousOrigin.lng) * 111_000
      : Number.POSITIVE_INFINITY;
    const throttledByDistance = distanceFromLast > 25;
    const throttledByTime = Date.now() - lastRouteUpdateRef.current > 20000;

    if (!previousOrigin || throttledByDistance || throttledByTime) {
      lastRouteOriginRef.current = origin;
      lastRouteUpdateRef.current = Date.now();
      let live = true;
      const destination = [stopCoordinates[0], stopCoordinates[1]];

      getRoadRoute([[origin.lng, origin.lat], destination]).then((route) => {
        if (!live) return;
        if (route.status === 'ok') {
          lastValidRouteRef.current = route;
          setRouteState(route);
          setRouteWarning('');
          return;
        }
        setRouteState(lastValidRouteRef.current ?? { path: [], status: 'failed', distanceMeters: null, durationSeconds: null });
        setRouteWarning(lastValidRouteRef.current ? 'Route temporarily unavailable. Showing the last valid route snapshot.' : 'Route temporarily unavailable.');
      }).catch(() => {
        if (live) {
          setRouteState(lastValidRouteRef.current ?? { path: [], status: 'failed', distanceMeters: null, durationSeconds: null });
          setRouteWarning(lastValidRouteRef.current ? 'Route temporarily unavailable. Showing the last valid route snapshot.' : 'Route temporarily unavailable.');
        }
      });

      return () => {
        live = false;
      };
    }

    return undefined;
  }, [activeStop, lastLocation]);

  const activeStopLocation = activeStop?.location?.coordinates && Array.isArray(activeStop.location.coordinates)
    ? {
        lat: activeStop.location.coordinates[1],
        lng: activeStop.location.coordinates[0],
        title: activeStop.name || task?.assignment?.title || 'Active stop',
      }
    : null;
  const navigationHeadline = activeStop ? `STOP ${activeStop.sequence} OF ${stops.length}` : 'NO ACTIVE STOP';
  const navigationText = activeStop?.name || task?.assignment?.title || 'Collection point';
  const routeDistance = routeState?.status === 'ok' ? formatDistanceMeters(routeState.distanceMeters) : lastValidRouteRef.current?.status === 'ok' ? formatDistanceMeters(lastValidRouteRef.current.distanceMeters) : '—';
  const routeEta = routeState?.status === 'ok' ? formatEtaSeconds(routeState.durationSeconds) : lastValidRouteRef.current?.status === 'ok' ? formatEtaSeconds(lastValidRouteRef.current.durationSeconds) : 'ETA unavailable';
  const gpsStatusValue = (() => {
    if (lastError) {
      if (String(lastError).toLowerCase().includes('permission')) return 'GPS permission denied';
      return 'GPS unavailable';
    }
    if (!lastLocation) return 'GPS acquiring';
    const accuracy = Number(lastLocation.coords.accuracy || 0);
    if (accuracy > 50) return 'GPS weak';
    return `GPS ready · ±${Math.round(accuracy)}m`;
  })();
  const networkStatus = typeof navigator !== 'undefined' && navigator.onLine ? 'ONLINE' : 'OFFLINE';
  const gpsStatus = gpsStatusValue;
  const routeStatus = routeState?.status === 'ok' ? `${routeDistance} · ${routeEta}` : routeWarning || `${routeDistance} · ${routeEta}` || 'Route unavailable';
  const arrive = () => run('arrive', () => activeStop ? assignmentsApi.stopAction(uid(task.assignment), uid(activeStop), 'arrive', { driverId: u.id }) : journeysApi.arrive(uid(task.journey)), 'Arrival confirmed. You can scan the barcode.');
  // The "Create sample" button captures the barcode at the current GPS
  // fix and immediately submits it for review. Because the sample is now
  // in the operator's hands, the journey for this task auto-ends so the
  // driver can move on to the next assignment without an extra step.
  // Live location tracking stops at the same time so the operator sees
  // the driver fall off the live map the moment the collection is done.
  //
  // Multi-stop landmark-route assignments keep the existing stop-based
  // completion flow (the operator still expects the driver to mark each
  // stop), so we only auto-end the journey for single-target assignments.
  const capture = () => run('capture', async () => {
    if (!barcode.trim()) throw Error('Scan or enter a barcode before capturing the sample.');
    const pos = await getCurrentPosition({ enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
    const sample = await samplesApi.create({ barcodeValue: barcode.trim(), driverId: u.id, assignmentId: uid(task.assignment), journeyId: uid(task.journey), assignmentStopId: activeStop ? uid(activeStop) : undefined, latitude: pos.lat, longitude: pos.lng, accuracy: Math.round(pos.accuracy), collectedAt: new Date(pos.ts).toISOString() });
    setBarcode(''); setScannerOpen(false);
    try {
      await samplesApi.submit(uid(sample), { driverId: u.id });
    } catch (submitError) {
      // The sample exists; the operator will see it as PENDING instead
      // of SUBMITTED. Surface the error but still end the journey so the
      // driver isn't stuck on the page.
      setError(fail(submitError));
    }
    const isSingleTarget = task?.assignment?.assignmentType === 'SPECIFIC_LOCATION';
    if (isSingleTarget) {
      try {
        const endPos = await getCurrentPosition({ enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
        await journeysApi.end(uid(task.journey), { latitude: endPos.lat, longitude: endPos.lng, accuracy: Math.round(endPos.accuracy), timestamp: new Date(endPos.ts).toISOString() });
      } catch (endError) {
        // The journey-end call shouldn't trap the driver. If GPS fails
        // the operator can still close the journey from the dashboard.
      }
      stopTracking();
    }
  }, 'Sample submitted. You can start the next assignment.');
  const submit = () => run('submit', () => samplesApi.submit(uid(activeSample), { driverId: u.id }), 'Sample submitted. You can complete this stop.');
  const completeStop = () => run('complete-stop', () => assignmentsApi.stopAction(uid(task.assignment), uid(activeStop), 'complete', { driverId: u.id }), 'Stop completed. The next stop is now active.');
  const completeJourney = () => run('complete-journey', async () => {
    const pos = await getCurrentPosition({ enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
    await journeysApi.end(uid(task.journey), { latitude: pos.lat, longitude: pos.lng, accuracy: Math.round(pos.accuracy), timestamp: new Date(pos.ts).toISOString() });
    stopTracking();
  }, 'Journey completed and synchronized with FieldFlow.');

  if (loading) return <Page title="My Work" u={u}><div className="loading-overlay"><div className="spinner" /><p className="loading-text">Loading your active work…</p></div></Page>;
  if (!task) {
    const visible = assignments.filter((a) => !['COMPLETED', 'CANCELLED', 'EXPIRED'].includes(a.status));
    return <Page title="My Work" u={u}>
      <SectionCard
        title="Assigned work"
        subtitle="Choose an assignment to start the journey or decline it."
        actions={<Link to="/work/list" className="section-link">Open List of Work →</Link>}
      >
        <Notice error={error} message={message} />
        {visible.length ? <div className="list">{visible.map((item) => <button key={uid(item)} type="button" className={`driver-list-item ${uid(selected) === uid(item) ? 'is-active' : ''}`} onClick={() => { setSelected(item); setError(''); setDeclineTarget(null); }}><span className="list-main"><b>{item.title}</b><small>{item.assignmentType} · {when(item.scheduledStartAt)}</small></span><StatusBadge status={item.status} /></button>)}</div> : <p className="empty-state-description">You have no assignments right now.</p>}
        {selected && (
          <div className="form-actions" style={{ marginTop: 'var(--space-4)' }}>
            {selected.status === 'ASSIGNED' && (
              <>
                <Button
                  variant="primary"
                  loading={action === 'start'}
                  onClick={startJourney}
                >Start Journey</Button>
                <Button
                  variant="danger"
                  loading={action === 'decline'}
                  onClick={() => { setError(''); setMessage(''); setDeclineTarget(selected); }}
                  style={{ marginLeft: 'var(--space-3)' }}
                >Decline</Button>
              </>
            )}
            {selected.status === 'IN_PROGRESS' && <Button variant="primary" loading={action === 'start'} onClick={startJourney}>Continue journey</Button>}
          </div>
        )}
      </SectionCard>
      <DeclineAssignmentModal
        open={Boolean(declineTarget)}
        assignment={declineTarget}
        busy={action === 'decline'}
        onClose={() => { if (action !== 'decline') setDeclineTarget(null); }}
        onConfirm={async (reason) => {
          const target = declineTarget;
          if (!target) return;
          await run('decline', () => assignmentsApi.decline(uid(target), { status: 'DECLINED', declineReason: reason }), 'Assignment declined.');
          setDeclineTarget(null);
        }}
      />
    </Page>;
  }

  const stops = task.stops || [];
  return <Page title="My Work" u={u}><SectionCard
    title={task.assignment.title}
    subtitle={`${task.assignment.routeId?.name || task.assignment.assignmentType} · Journey active`}
    actions={<Link to="/work/list" className="section-link">View all assignments →</Link>}
  ><Notice error={error} message={message} />
    <div className="grid-2" style={{ marginBottom: 'var(--space-4)' }}><div><small>JOURNEY</small><div><StatusBadge status={task.journey.status} /> {tracking ? 'GPS tracking active' : 'GPS reconnecting'}</div></div><div><small>GPS</small><div>{gpsStatus}</div></div></div>
    {activeStop && (
      <DriverNavigationMap
        driverLocation={driverLocation}
        destinationLocation={activeStopLocation}
        route={routeState}
        gpsStatus={gpsStatus}
        routeStatus={routeStatus}
        stopLabel={activeStop ? `ACTIVE STOP ${activeStop.sequence} OF ${stops.length}` : 'ACTIVE COLLECTION'}
      />
    )}
    <div className="card" style={{ padding: 'var(--space-5)', marginBottom: 'var(--space-4)', borderLeft: '4px solid var(--primary)' }}><small>{activeStop ? `ACTIVE STOP ${activeStop.sequence} OF ${stops.length}` : 'ACTIVE COLLECTION'}</small><h2 style={{ margin: 'var(--space-1) 0' }}>{activeStop?.name || task.assignment.targetAddress || task.assignment.title}</h2><p style={{ margin: 0, color: 'var(--muted)' }}>{activeStop?.address || task.assignment.targetAddress || 'Collection location'}</p><p style={{ margin: 'var(--space-3) 0 0' }}>Stop: <b>{sampleSubmitted ? 'Sample submitted' : sampleCaptured ? 'Sample captured' : arrived ? 'Arrived' : 'In progress'}</b></p><p style={{ margin: 'var(--space-2) 0 0', color: 'var(--muted)' }}>Route: <b>{routeStatus}</b></p></div>
      {!arrived && <Button variant="primary" loading={action === 'arrive'} onClick={arrive}>{lastLocation ? 'Arrive at stop' : 'Waiting for GPS'}</Button>}
      {arrived && !activeSample && (!scannerOpen ? <Button variant="primary" onClick={() => setScannerOpen(true)}>Scan barcode</Button> : <><BarcodeScanner onDetected={(value) => { setBarcode(value); setScannerOpen(false); }} /><label style={{ display: 'block', marginTop: 'var(--space-3)' }}>Barcode<input value={barcode} onChange={(event) => setBarcode(event.target.value)} placeholder="Scan result or enter barcode" /></label><div className="form-actions"><Button variant="primary" loading={action === 'capture'} onClick={capture}>Create sample</Button></div></>) }
      {sampleCaptured && <Button variant="primary" loading={action === 'submit'} onClick={submit}>Submit sample</Button>}
      {sampleSubmitted && activeStop && <Button variant="success" loading={action === 'complete-stop'} onClick={completeStop}>Complete stop</Button>}
    <div className="list" style={{ marginTop: 'var(--space-5)' }}>{stops.map((stop) => <div className={`list-item ${uid(stop) === uid(activeStop) ? 'is-current' : ''}`} key={uid(stop)}><span><b>{stop.sequence}. {stop.name}</b><small>{stop.address || 'Collection location'}</small></span><StatusBadge status={terminal.has(stop.status) ? stop.status : uid(stop) === uid(activeStop) ? 'IN_PROGRESS' : 'PENDING'} /></div>)}</div>
    {task.canCompleteJourney && <div className="form-actions" style={{ marginTop: 'var(--space-5)' }}><Button variant="success" loading={action === 'complete-journey'} onClick={completeJourney}>Complete journey</Button></div>}</SectionCard></Page>;
}
