/**
 * MyWork — Driver active-work page.
 *
 * Phases rendered when a journey is active:
 *   NAVIGATING  → live map + Arrive button
 *   ARRIVED     → Scan barcode
 *   CAPTURED    → Submit sample
 *   SUBMITTED   → Complete stop  (multi-stop) OR auto-flows to journey end
 *   ALL DONE    → Complete journey button
 *
 * When there is no active journey the page shows the assignment list so
 * the driver can pick one and start.
 */
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { assignmentsApi, journeysApi, samplesApi } from '../api/fieldflow';
import { Page, Notice, uid, fail, when } from './utils';
import { Button, SectionCard } from '../components/ui';
import { StatusBadge } from '../components/ui/Badge';
import BarcodeScanner from '../components/BarcodeScanner';
import DriverNavigationMap from '../components/DriverNavigationMap';
import { DeclineAssignmentModal } from '../components/DeclineAssignmentModal';
import { useToast } from '../components/Toast';
import { getCurrentPosition } from '../services/geolocation';
import { useDriverNavigation } from '../hooks/useDriverNavigation';

// Stops whose server state is terminal — they never become active again.
const TERMINAL = new Set(['COMPLETED', 'SKIPPED']);

// Human-friendly label for the current stop's progress phase.
function stopPhaseLabel(arrived, activeSample) {
  if (!arrived) return 'Navigating';
  if (!activeSample) return 'Arrived — scan barcode';
  if (activeSample.status === 'PENDING') return 'Sample captured — submit';
  if (activeSample.status === 'SUBMITTED') return 'Sample submitted — complete stop';
  return 'Stop in progress';
}

export default function MyWork({ u }) {
  const toast = useToast();

  const [assignments, setAssignments] = useState([]);
  const [task, setTask] = useState(null);
  const [selected, setSelected] = useState(null);
  const [declineTarget, setDeclineTarget] = useState(null);
  const [barcode, setBarcode] = useState('');
  const [scannerOpen, setScannerOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState('');
  const [error, setError] = useState('');

  // ── Active stop derived from authoritative server state ─────────────────
  const activeStop = task?.activeStop ?? null;

  // ── Navigation hook — GPS + route pipeline ──────────────────────────────
  const {
    driverLocation,
    route,
    gpsStatus,
    routeStatus,
    routeWarning,
    tracking,
    networkOnline,
    startTracking,
    stopTracking,
    trackingJourneyId,
  } = useDriverNavigation({ activeStop });

  // ── Data loading ─────────────────────────────────────────────────────────
  const reload = useCallback(async () => {
    const [assignmentList, activeTask] = await Promise.all([
      assignmentsApi.list({ driverId: u.id }),
      journeysApi.activeTask(),
    ]);
    setAssignments(assignmentList);
    setTask(activeTask);
    return activeTask;
  }, [u.id]);

  useEffect(() => {
    let live = true;
    reload()
      .catch((cause) => live && setError(friendlyError(cause)))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
      stopTracking();
    };
  }, [reload, stopTracking]);

  // Reconnect tracking if the journey was already active when the page
  // mounted (e.g. driver navigated away and came back).
  useEffect(() => {
    if (task?.journey && trackingJourneyId !== uid(task.journey)) {
      startTracking(uid(task.journey));
    }
  }, [task, trackingJourneyId, startTracking]);

  // ── Generic action runner ────────────────────────────────────────────────
  const run = async (name, work, successMsg) => {
    setAction(name);
    setError('');
    try {
      await work();
      await reload();
      if (successMsg) toast(successMsg);
    } catch (cause) {
      setError(friendlyError(cause));
    } finally {
      setAction('');
    }
  };

  // ── Friendly error messages — never expose raw server/JS errors ──────────
  function friendlyError(cause) {
    const raw = cause?.message || String(cause || '');
    if (!raw) return 'Something went wrong. Please try again.';

    // GPS errors
    if (raw.includes('permission') || cause?.code === 1)
      return 'GPS permission denied. Please allow location access in your browser settings.';
    if (raw.includes('not supported') || raw.includes('unsupported'))
      return 'Location tracking is not supported on this device.';
    if (raw.includes('timeout') || cause?.code === 3)
      return 'GPS timed out — move to an open area and try again.';
    if (raw.includes('unavailable') || cause?.code === 2)
      return 'GPS signal unavailable. Move to an open area.';

    // Network / server errors
    if (raw.includes('Failed to fetch') || raw.includes('NetworkError') || raw.includes('network'))
      return 'Network error — check your connection and try again.';
    if (raw.includes('401') || raw.includes('Unauthori'))
      return 'Your session has expired. Please sign in again.';
    if (raw.includes('403') || raw.includes('Forbidden') || raw.includes('permission'))
      return 'You do not have permission to perform this action.';
    if (raw.includes('409') || raw.includes('Conflict'))
      return fail(cause); // 409 messages from the server are always user-safe
    if (raw.includes('404'))
      return 'The requested resource was not found. Reload and try again.';

    // Barcode
    if (raw.includes('barcode') || raw.includes('Barcode'))
      return raw; // Our own validation messages are already user-friendly

    return 'Something went wrong. Please try again.';
  }

  // ── Journey actions ──────────────────────────────────────────────────────
  const startJourney = () => run('start', async () => {
    const pos = await getCurrentPosition({ enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
    if (selected?.status === 'ASSIGNED') {
      await assignmentsApi.accept(uid(selected));
    }
    const journey = await journeysApi.start({
      assignmentId: uid(selected),
      latitude: pos.lat,
      longitude: pos.lng,
      accuracy: Math.round(pos.accuracy),
      timestamp: new Date(pos.ts).toISOString(),
    });
    startTracking(uid(journey));
  }, 'Journey started. Your live location is now shared with the operator.');

  const arrive = () => run('arrive', async () => {
    if (activeStop) {
      // Multi-stop (LANDMARK_ROUTE): arrive at the specific stop
      await assignmentsApi.stopAction(
        uid(task.assignment),
        uid(activeStop),
        'arrive',
        { driverId: u.id },
      );
    } else {
      // Single-location (SPECIFIC_LOCATION): arrive at the journey
      await journeysApi.arrive(uid(task.journey));
    }
  }, 'Arrival confirmed. You can now scan the barcode.');

  const capture = () => run('capture', async () => {
    if (!barcode.trim()) throw new Error('Scan or enter a barcode before capturing the sample.');
    const pos = await getCurrentPosition({ enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
    const sample = await samplesApi.create({
      barcodeValue: barcode.trim(),
      driverId: u.id,
      assignmentId: uid(task.assignment),
      journeyId: uid(task.journey),
      assignmentStopId: activeStop ? uid(activeStop) : undefined,
      latitude: pos.lat,
      longitude: pos.lng,
      accuracy: Math.round(pos.accuracy),
      collectedAt: new Date(pos.ts).toISOString(),
    });
    setBarcode('');
    setScannerOpen(false);
    // Immediately submit so the operator sees SUBMITTED status
    try {
      await samplesApi.submit(uid(sample), { driverId: u.id });
    } catch (submitErr) {
      // Sample exists; operator sees PENDING. Surface warning but don't block.
      setError('Sample captured but submission failed — the operator will see it as Pending.');
    }
    // Single-location assignments: auto-end the journey after sample capture
    const isSingle = task?.assignment?.assignmentType === 'SPECIFIC_LOCATION';
    if (isSingle) {
      try {
        const endPos = await getCurrentPosition({ enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
        await journeysApi.end(uid(task.journey), {
          latitude: endPos.lat,
          longitude: endPos.lng,
          accuracy: Math.round(endPos.accuracy),
          timestamp: new Date(endPos.ts).toISOString(),
        });
      } catch {
        // Journey can be closed by the operator if GPS fails at end
      }
      stopTracking();
    }
  }, 'Sample submitted successfully.');

  const submitSample = () => run('submit', () =>
    samplesApi.submit(uid(task.activeSample), { driverId: u.id }),
    'Sample submitted. You can complete this stop.',
  );

  const completeStop = () => run('complete-stop', () =>
    assignmentsApi.stopAction(uid(task.assignment), uid(activeStop), 'complete', { driverId: u.id }),
    'Stop completed. The next stop is now active.',
  );

  const completeJourney = () => run('complete-journey', async () => {
    const pos = await getCurrentPosition({ enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
    await journeysApi.end(uid(task.journey), {
      latitude: pos.lat,
      longitude: pos.lng,
      accuracy: Math.round(pos.accuracy),
      timestamp: new Date(pos.ts).toISOString(),
    });
    stopTracking();
  }, 'Journey completed. Well done!');

  // ── Loading screen ────────────────────────────────────────────────────────
  if (loading) {
    return (
      <Page title="My Work" u={u}>
        <div className="loading-overlay">
          <div className="spinner" />
          <p className="loading-text">Loading your active work…</p>
        </div>
      </Page>
    );
  }

  // ── No active journey — assignment picker ─────────────────────────────────
  if (!task) {
    const visible = assignments.filter(
      (a) => !['COMPLETED', 'CANCELLED', 'EXPIRED'].includes(a.status),
    );
    return (
      <Page title="My Work" u={u}>
        <SectionCard
          title="Assigned work"
          subtitle="Choose an assignment to start the journey."
          actions={<Link to="/work/list" className="section-link">Open List of Work →</Link>}
        >
          <Notice error={error} />
          {visible.length ? (
            <div className="list">
              {visible.map((item) => (
                <button
                  key={uid(item)}
                  type="button"
                  className={`driver-list-item${uid(selected) === uid(item) ? ' is-active' : ''}`}
                  onClick={() => { setSelected(item); setError(''); setDeclineTarget(null); }}
                >
                  <span className="list-main">
                    <b>{item.title}</b>
                    <small>{item.assignmentType} · {when(item.scheduledStartAt)}</small>
                  </span>
                  <StatusBadge status={item.status} />
                </button>
              ))}
            </div>
          ) : (
            <p className="empty-state-description">You have no assignments right now.</p>
          )}

          {selected && (
            <div className="form-actions" style={{ marginTop: 'var(--space-4)' }}>
              {selected.status === 'ASSIGNED' && (
                <>
                  <Button
                    variant="primary"
                    loading={action === 'start'}
                    onClick={startJourney}
                  >
                    Start Journey
                  </Button>
                  <Button
                    variant="danger"
                    loading={action === 'decline'}
                    onClick={() => { setError(''); setDeclineTarget(selected); }}
                  >
                    Decline
                  </Button>
                </>
              )}
              {(selected.status === 'IN_PROGRESS' || selected.status === 'ACCEPTED') && (
                <Button
                  variant="primary"
                  loading={action === 'start'}
                  onClick={startJourney}
                >
                  Continue Journey
                </Button>
              )}
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
            await run(
              'decline',
              () => assignmentsApi.decline(uid(target), { status: 'DECLINED', declineReason: reason }),
              'Assignment declined.',
            );
            setDeclineTarget(null);
          }}
        />
      </Page>
    );
  }

  // ── Active journey ────────────────────────────────────────────────────────
  const stops = task.stops || [];
  const activeSample = task.activeSample;

  // Arrival: either the stop has arrivedAt or (for single-location) the journey has arrivedAt
  const arrived = Boolean(activeStop?.arrivedAt || task.journey?.arrivedAt);
  const sampleCaptured = activeSample?.status === 'PENDING';
  const sampleSubmitted = activeSample?.status === 'SUBMITTED';

  // Destination for the map: active stop coordinates or single-location target
  const destinationLocation = (() => {
    if (activeStop?.location?.coordinates) {
      const [lng, lat] = activeStop.location.coordinates;
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        return {
          lat,
          lng,
          title: activeStop.name || task.assignment?.title || 'Active stop',
        };
      }
    }
    if (task.assignment?.targetLocation?.coordinates) {
      const [lng, lat] = task.assignment.targetLocation.coordinates;
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        return {
          lat,
          lng,
          title: task.assignment?.targetAddress || task.assignment?.title || 'Collection point',
        };
      }
    }
    return null;
  })();

  const stopLabel = stops.length > 0
    ? `STOP ${activeStop?.sequence ?? '?'} OF ${stops.length}`
    : 'ACTIVE COLLECTION';

  const phaseLabel = stopPhaseLabel(arrived, activeSample);

  return (
    <Page title="My Work" u={u}>
      <SectionCard
        title={task.assignment.title}
        subtitle={`${task.assignment.routeId?.name || task.assignment.assignmentType} · Journey active`}
        actions={<Link to="/work/list" className="section-link">View all →</Link>}
      >
        <Notice error={error} />

        {/* ── Status bar ───────────────────────────────────────────────── */}
        <div className="driver-status-bar">
          <div className="driver-status-item">
            <span className="driver-status-label">Journey</span>
            <span className="driver-status-value">
              <StatusBadge status={task.journey.status} />
              {' '}
              {tracking
                ? <span className="driver-gps-live">● GPS live</span>
                : <span className="driver-gps-reconnecting">◌ reconnecting</span>}
            </span>
          </div>
          <div className="driver-status-item">
            <span className="driver-status-label">Network</span>
            <span className="driver-status-value">
              {networkOnline
                ? <span className="driver-net-online">● Online</span>
                : <span className="driver-net-offline">✕ Offline</span>}
            </span>
          </div>
          <div className="driver-status-item">
            <span className="driver-status-label">GPS</span>
            <span className="driver-status-value driver-status-gps">{gpsStatus}</span>
          </div>
        </div>

        {/* ── Map ──────────────────────────────────────────────────────── */}
        {destinationLocation && (
          <DriverNavigationMap
            driverLocation={driverLocation}
            destinationLocation={destinationLocation}
            route={route}
            gpsStatus={gpsStatus}
            routeStatus={routeStatus}
            routeWarning={routeWarning}
            stopLabel={stopLabel}
            networkOnline={networkOnline}
            journeyStatus={task.journey.status}
          />
        )}

        {/* ── Active stop card ─────────────────────────────────────────── */}
        <div className="driver-stop-card">
          <div className="driver-stop-header">
            <div>
              <span className="driver-stop-label">{stopLabel}</span>
              <h2 className="driver-stop-name">
                {activeStop?.name || task.assignment?.targetAddress || task.assignment.title}
              </h2>
              {(activeStop?.address || task.assignment?.targetAddress) && (
                <p className="driver-stop-address">
                  {activeStop?.address || task.assignment?.targetAddress}
                </p>
              )}
            </div>
            <div className="driver-phase-badge" data-phase={arrived ? 'arrived' : 'navigating'}>
              {phaseLabel}
            </div>
          </div>

          <div className="driver-stop-meta">
            <span>Route: <b>{routeStatus}</b></span>
            {routeWarning && (
              <span className="driver-route-warning">⚠ {routeWarning}</span>
            )}
          </div>
        </div>

        {/* ── Phase actions ────────────────────────────────────────────── */}

        {/* Phase 1: NAVIGATING → Arrive */}
        {!arrived && (
          <div className="driver-action-zone">
            <p className="driver-action-hint">
              Follow the route above. Tap <b>Arrive</b> when you reach the collection point.
            </p>
            <Button
              variant="primary"
              loading={action === 'arrive'}
              disabled={!driverLocation}
              onClick={arrive}
            >
              {driverLocation ? 'Arrive at stop' : 'Waiting for GPS…'}
            </Button>
          </div>
        )}

        {/* Phase 2: ARRIVED → Scan barcode */}
        {arrived && !activeSample && (
          <div className="driver-action-zone">
            {!scannerOpen ? (
              <>
                <p className="driver-action-hint">
                  You have arrived. Scan the barcode on the sample container.
                </p>
                <Button variant="primary" onClick={() => setScannerOpen(true)}>
                  Scan barcode
                </Button>
              </>
            ) : (
              <>
                <BarcodeScanner onDetected={(value) => { setBarcode(value); setScannerOpen(false); }} />
                <div className="driver-barcode-manual">
                  <label className="driver-barcode-label" htmlFor="barcode-input">
                    Or enter barcode manually
                  </label>
                  <input
                    id="barcode-input"
                    className="driver-barcode-input"
                    value={barcode}
                    onChange={(e) => setBarcode(e.target.value)}
                    placeholder="Scan result or enter barcode"
                    autoComplete="off"
                  />
                </div>
                <div className="driver-action-row">
                  <Button
                    variant="primary"
                    loading={action === 'capture'}
                    disabled={!barcode.trim()}
                    onClick={capture}
                  >
                    Create sample
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => { setScannerOpen(false); setBarcode(''); }}
                  >
                    Cancel
                  </Button>
                </div>
              </>
            )}
          </div>
        )}

        {/* Phase 3: CAPTURED → Submit */}
        {sampleCaptured && (
          <div className="driver-action-zone">
            <p className="driver-action-hint">
              Sample captured. Submit it to send it to the operator for review.
            </p>
            <Button variant="primary" loading={action === 'submit'} onClick={submitSample}>
              Submit sample
            </Button>
          </div>
        )}

        {/* Phase 4: SUBMITTED → Complete stop (multi-stop only) */}
        {sampleSubmitted && activeStop && (
          <div className="driver-action-zone">
            <p className="driver-action-hint">
              Sample submitted. Mark this stop as complete to activate the next one.
            </p>
            <Button variant="success" loading={action === 'complete-stop'} onClick={completeStop}>
              Complete stop
            </Button>
          </div>
        )}

        {/* Phase 5: Complete journey */}
        {task.canCompleteJourney && (
          <div className="driver-action-zone driver-action-zone--final">
            <p className="driver-action-hint">
              All stops are complete. Tap below to end the journey and synchronise with FieldFlow.
            </p>
            <Button
              variant="success"
              loading={action === 'complete-journey'}
              onClick={completeJourney}
            >
              Complete journey
            </Button>
          </div>
        )}

        {/* ── Stop progress list (multi-stop only) ─────────────────────── */}
        {stops.length > 0 && (
          <div className="driver-stops-list">
            <p className="driver-stops-list-title">Route stops</p>
            {stops.map((stop) => (
              <div
                key={uid(stop)}
                className={`driver-stop-row${uid(stop) === uid(activeStop) ? ' driver-stop-row--active' : ''}`}
              >
                <span className="driver-stop-row-name">
                  <b>{stop.sequence}.</b> {stop.name}
                </span>
                <StatusBadge
                  status={
                    TERMINAL.has(stop.status)
                      ? stop.status
                      : uid(stop) === uid(activeStop)
                        ? 'IN_PROGRESS'
                        : 'PENDING'
                  }
                />
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </Page>
  );
}
