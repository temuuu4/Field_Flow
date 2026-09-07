import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { assignmentsApi, journeysApi } from '../api/fieldflow';
import { Page, Notice, uid, fail, when } from './utils';
import { Button, SectionCard, StatusBadge } from '../components/ui';
import { DeclineAssignmentModal } from '../components/DeclineAssignmentModal';
import { useToast } from '../components/Toast';
import { getCurrentPosition } from '../services/geolocation';
import { useTracking } from '../hooks/useTracking';

// Group order is intentionally chosen so the most actionable work floats to
// the top of the list. Drivers coming back from a journey should see what
// still needs their attention before they wade through history.
const GROUP_ORDER = [
  { id: 'pending', label: 'Awaiting your response', statuses: ['ASSIGNED'] },
  { id: 'active', label: 'In progress', statuses: ['ACCEPTED', 'IN_PROGRESS'] },
  { id: 'declined', label: 'Declined', statuses: ['DECLINED'] },
  { id: 'closed', label: 'Closed', statuses: ['COMPLETED', 'CANCELLED', 'EXPIRED'] },
];

const TERMINAL_STATUSES = new Set(['COMPLETED', 'CANCELLED', 'EXPIRED', 'DECLINED']);

function groupAssignments(assignments) {
  const groups = GROUP_ORDER.map((group) => ({ ...group, items: [] }));
  const indexByStatus = new Map();
  GROUP_ORDER.forEach((group, index) => {
    group.statuses.forEach((status) => indexByStatus.set(status, index));
  });
  assignments.forEach((assignment) => {
    const index = indexByStatus.get(assignment?.status);
    if (index === undefined) {
      // Unknown status: drop it into "closed" so the driver can still see
      // historical rows but they never silently disappear from the UI.
      groups[groups.length - 1].items.push(assignment);
      return;
    }
    groups[index].items.push(assignment);
  });
  // Sort within each group by scheduled start time (ascending), falling
  // back to createdAt so newly assigned work surfaces to the top.
  groups.forEach((group) => {
    group.items.sort((left, right) => {
      const leftDate = left?.scheduledStartAt ? new Date(left.scheduledStartAt).getTime() : Number.POSITIVE_INFINITY;
      const rightDate = right?.scheduledStartAt ? new Date(right.scheduledStartAt).getTime() : Number.POSITIVE_INFINITY;
      if (leftDate !== rightDate) return leftDate - rightDate;
      const leftCreated = left?.createdAt ? new Date(left.createdAt).getTime() : 0;
      const rightCreated = right?.createdAt ? new Date(right.createdAt).getTime() : 0;
      return rightCreated - leftCreated;
    });
  });
  return groups;
}

export default function ListOfWork({ u }) {
  const toast = useToast();
  const { startTracking, stopTracking } = useTracking();
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [actionKey, setActionKey] = useState('');
  const [declineTarget, setDeclineTarget] = useState(null);

  const reload = useCallback(async () => {
    const list = await assignmentsApi.list({ driverId: u.id });
    setAssignments(list);
    return list;
  }, [u.id]);

  useEffect(() => {
    let live = true;
    reload()
      .catch((cause) => live && setError(fail(cause)))
      .finally(() => live && setLoading(false));
    return () => { live = false; };
  }, [reload]);

  const run = async (key, work, success) => {
    setActionKey(key);
    setError('');
    setMessage('');
    try {
      await work();
      await reload();
      if (success) {
        setMessage(success);
        toast(success);
      }
    } catch (cause) {
      setError(fail(cause));
    } finally {
      setActionKey('');
    }
  };

  const groups = useMemo(() => groupAssignments(assignments), [assignments]);
  const hasAnyOpenWork = groups
    .filter((group) => group.id !== 'closed' && group.id !== 'declined')
    .some((group) => group.items.length > 0);

  // "Start Journey" replaces the legacy two-step Accept + Start flow.
  // One click accepts the assignment with the server, captures the
  // driver's GPS, opens the journey on the backend, and starts streaming
  // live location updates so the operator can see the driver in real
  // time until the sample is captured and the journey auto-ends.
  const handleStartJourney = (assignment) => run(`start:${uid(assignment)}`, async () => {
    const pos = await getCurrentPosition({ enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
    await assignmentsApi.accept(uid(assignment));
    const journey = await journeysApi.start({
      assignmentId: uid(assignment),
      latitude: pos.lat,
      longitude: pos.lng,
      accuracy: Math.round(pos.accuracy),
      timestamp: new Date(pos.ts).toISOString(),
    });
    startTracking(uid(journey));
  }, 'Journey started. Your live location is now being shared with the operator.');

  const handleDeclineClick = (assignment) => {
    setError('');
    setMessage('');
    setDeclineTarget(assignment);
  };

  const handleDeclineConfirm = async (reason) => {
    if (!declineTarget) return;
    const target = declineTarget;
    setActionKey(`decline:${uid(target)}`);
    try {
      await assignmentsApi.decline(uid(target), { status: 'DECLINED', declineReason: reason });
      setDeclineTarget(null);
      await reload();
      const success = 'Assignment declined. The operator has been notified.';
      setMessage(success);
      toast(success);
    } catch (cause) {
      setError(fail(cause));
    } finally {
      setActionKey('');
    }
  };

  const handleDeclineClose = () => {
    if (actionKey.startsWith('decline:')) return;
    setDeclineTarget(null);
  };

  const totalOpen = assignments.filter((a) => !TERMINAL_STATUSES.has(a.status)).length;
  const totalClosed = assignments.filter((a) => TERMINAL_STATUSES.has(a.status)).length;
  return (
    <Page title="List of Work" u={u}>
      <SectionCard
        title="All assigned work"
        subtitle={`${totalOpen} open · ${totalClosed} closed · Choose an assignment to accept or decline.`}
        actions={
          <Link to="/work" className="section-link">
            Back to My Work →
          </Link>
        }
      >
        <Notice error={error} message={message} />
        {loading ? (
          <div className="loading-overlay compact-loading-inline">
            <div className="spinner" />
            <p className="loading-text">Loading your assignments…</p>
          </div>
        ) : hasAnyOpenWork ? (
          groups
            .filter((group) => group.id !== 'closed' && group.id !== 'declined')
            .map((group) => (
              <AssignmentGroup
                key={group.id}
                group={group}
                actionKey={actionKey}
                onStart={handleStartJourney}
                onDecline={handleDeclineClick}
              />
            ))
        ) : (
          <div className="empty-state" style={{ padding: 'var(--space-8) var(--space-4)' }}>
            <div className="empty-state-icon">📭</div>
            <p className="empty-state-title">No open assignments</p>
            <p className="empty-state-description">You're all caught up. New assignments will appear here automatically.</p>
          </div>
        )}
      </SectionCard>

      {groups.some((group) => (group.id === 'closed' || group.id === 'declined') && group.items.length > 0) && (
        <SectionCard title="History" subtitle="Completed, declined and cancelled assignments.">
          {groups
            .filter((group) => group.id === 'closed' || group.id === 'declined')
            .filter((group) => group.items.length > 0)
            .map((group) => (
              <AssignmentGroup key={group.id} group={group} actionKey={actionKey} />
            ))}
        </SectionCard>
      )}

      <DeclineAssignmentModal
        open={Boolean(declineTarget)}
        assignment={declineTarget}
        busy={actionKey.startsWith('decline:')}
        onClose={handleDeclineClose}
        onConfirm={handleDeclineConfirm}
      />
    </Page>
  );
}

function AssignmentGroup({ group, actionKey, onStart, onDecline }) {
  if (!group.items.length) return null;
  return (
    <div style={{ marginBottom: 'var(--space-5)' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 'var(--space-2)' }}>
        <small style={{ textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--muted)' }}>{group.label}</small>
        <small style={{ color: 'var(--muted)' }}>{group.items.length} item{group.items.length === 1 ? '' : 's'}</small>
      </div>
      <div className="list">
        {group.items.map((item) => (
          <AssignmentRow
            key={uid(item)}
            assignment={item}
            actionKey={actionKey}
            onStart={onStart}
            onDecline={onDecline}
          />
        ))}
      </div>
    </div>
  );
}

function AssignmentRow({ assignment, actionKey, onStart, onDecline }) {
  const id = uid(assignment);
  const starting = actionKey === `start:${id}`;
  const declining = actionKey === `decline:${id}`;
  const canRespond = assignment.status === 'ASSIGNED';
  return (
    <div className="list-item" style={{ alignItems: 'flex-start', gap: 'var(--space-3)' }}>
      <div className="list-item-content" style={{ flex: 1 }}>
        <b>{assignment.title || 'Untitled assignment'}</b>
        <small>
          {assignment.assignmentType ? `${assignment.assignmentType} · ` : ''}
          {assignment.scheduledStartAt ? when(assignment.scheduledStartAt) : 'No scheduled time'}
        </small>
        {assignment.targetAddress ? (
          <small style={{ display: 'block', marginTop: '2px', color: 'var(--muted)' }}>{assignment.targetAddress}</small>
        ) : null}
        {assignment.status === 'DECLINED' && assignment.declineReason ? (
          <small style={{ display: 'block', marginTop: '4px', color: 'var(--muted)' }}>
            Reason: {assignment.declineReason}
          </small>
        ) : null}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 'var(--space-2)' }}>
        <StatusBadge status={assignment.status} />
        {canRespond && (
          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
            <Button
              variant="primary"
              size="sm"
              loading={starting}
              disabled={declining}
              onClick={() => onStart(assignment)}
            >
              Start Journey
            </Button>
            <Button
              variant="danger"
              size="sm"
              loading={declining}
              disabled={starting}
              onClick={() => onDecline(assignment)}
            >
              Decline
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

