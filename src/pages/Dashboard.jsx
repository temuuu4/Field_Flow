import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { assignmentsApi, journeysApi, notificationsApi, samplesApi, schedulesApi } from '../api/fieldflow';
import { useLoad, Page, Notice, uid, fail, uname, when } from './utils';
import { Button, SectionCard, StatusBadge } from '../components/ui';

const id = (value) => value?._id || value?.id || value;
const asArray = (value) => Array.isArray(value) ? value : [];
const count = (items, status) => asArray(items).filter((item) => item?.status === status).length;

export default function Dashboard({ user }) {
  const currentUser = user || null;
  const currentUserId = currentUser ? currentUser.id || currentUser._id || null : null;
  const currentRole = currentUser?.role || '';
  const [data, setData] = useState({ assignments: [], samples: [], journeys: [], notifications: [], schedules: [] });
  const [loading, setLoading] = useState(Boolean(currentUserId));
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        setError('');
        if (!currentUser || !currentUserId) {
          if (live) { setData({ assignments: [], samples: [], journeys: [], notifications: [], schedules: [] }); setLoading(false); }
          return;
        }
        setLoading(true);
        // For DRIVER users the backend scopes their own lists automatically
        // based on the JWT, but we still pass `driverId` for the legacy
        // filters (assignments, samples, journeys). The backend ignores
        // this for staff (admin/operator) and returns all.
        const filters = currentRole === 'DRIVER' ? { driverId: currentUserId } : {};
        const [assignments, samples, journeys, notifications, schedules] = await Promise.all([
          assignmentsApi.list(filters).catch(() => []),
          samplesApi.list(filters).catch(() => []),
          journeysApi.list(filters).catch(() => []),
          notificationsApi.list().catch(() => []),
          currentRole === 'DRIVER' ? Promise.resolve([]) : schedulesApi.list({ active: true }).catch(() => []),
        ]);
        if (live) {
          setData({
            assignments: asArray(assignments),
            samples: asArray(samples),
            journeys: asArray(journeys),
            notifications: asArray(notifications),
            schedules: asArray(schedules),
          });
        }
      } catch (e) {
        if (live) setError(e?.message || 'Unable to load dashboard data.');
      } finally {
        if (live) setLoading(false);
      }
    })();
    return () => { live = false; };
  }, [currentUserId, currentRole]);

  if (!currentUser) {
    return <Page title="Dashboard" u={currentUser}><SectionCard title="Dashboard"><p>Not signed in.</p></SectionCard></Page>;
  }
  if (error) {
    return <Page title="Dashboard" u={currentUser}><SectionCard title="Dashboard"><p className="form-error">{error}</p></SectionCard></Page>;
  }
  if (loading) {
    return <Page title="Dashboard" u={currentUser}><div className="loading-overlay"><div className="spinner" /><p className="loading-text">Loading real operational data…</p></div></Page>;
  }

  const unread = data.notifications.filter((item) => !item?.readAt).length;
  const cards = currentRole === 'DRIVER'
    ? [
        { label: 'Assigned work', value: count(data.assignments, 'ASSIGNED'), icon: '📋', tone: 'primary' },
        { label: 'In progress', value: count(data.assignments, 'IN_PROGRESS'), icon: '🚀', tone: 'warning' },
        { label: 'Pending samples', value: count(data.samples, 'PENDING'), icon: '🧪', tone: 'info' },
        { label: 'Active journeys', value: count(data.journeys, 'IN_PROGRESS'), icon: '📍', tone: 'success' },
      ]
    : [
        { label: 'Assignments', value: data.assignments.length, icon: '📋', tone: 'primary' },
        { label: 'In progress', value: count(data.assignments, 'IN_PROGRESS'), icon: '🚀', tone: 'warning' },
        { label: 'Submitted samples', value: count(data.samples, 'SUBMITTED'), icon: '🧪', tone: 'info' },
        { label: 'Active journeys', value: count(data.journeys, 'IN_PROGRESS'), icon: '📍', tone: 'success' },
        { label: 'Upcoming schedules', value: data.schedules.length, icon: '📅', tone: 'purple' },
        { label: 'Unread alerts', value: unread, icon: '🔔', tone: unread > 0 ? 'danger' : 'muted' },
      ];

  return (
    <Page title="Dashboard" u={currentUser}>
      <div className="stats-grid">
        {cards.map((card) => (
          <div className="stat-card" key={card.label}>
            <div className={`stat-icon ${card.tone}`}>{card.icon}</div>
            <div className="stat-content">
              <div className="stat-label">{card.label}</div>
              <div className="stat-value">{card.value}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid-2">
        <SectionCard
          title={currentRole === 'DRIVER' ? 'My recent work' : 'Recent assignments'}
          actions={<Link to="/work/list" className="section-link">{currentRole === 'DRIVER' ? 'Open list of work' : 'Open assignments'} →</Link>}
        >
          {data.assignments.length ? (
            <div className="list">
              {data.assignments.slice(0, 5).map((assignment) => (
                <div className="list-item" key={id(assignment)}>
                  <div className="list-item-content">
                    <b>{assignment?.title || 'Untitled assignment'}</b>
                    <small>{assignment?.status || 'UNKNOWN'} · {assignment?.scheduledStartAt ? new Date(assignment.scheduledStartAt).toLocaleString() : 'No scheduled time'}</small>
                  </div>
                  <StatusBadge status={assignment?.status} />
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state" style={{ padding: 'var(--space-8) var(--space-4)' }}>
              <div className="empty-state-icon">📭</div>
              <p className="empty-state-title">No assignments</p>
              <p className="empty-state-description">You don't have any assignments yet.</p>
            </div>
          )}
        </SectionCard>

        <SectionCard
          title="Recent notifications"
          actions={<Link to="/notifications" className="section-link">All notifications</Link>}
        >
          {data.notifications.length ? (
            <div className="list">
              {data.notifications.slice(0, 5).map((notification) => (
                <div className={`notification-item ${notification?.readAt ? '' : 'unread'}`} key={id(notification)}>
                  <div className="notification-icon">🔔</div>
                  <div className="notification-content">
                    <b>{notification?.message || 'Notification'}</b>
                    <small>{notification?.readAt ? 'Read' : 'Unread'} · {notification?.createdAt ? new Date(notification.createdAt).toLocaleString() : 'No timestamp'}</small>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state" style={{ padding: 'var(--space-8) var(--space-4)' }}>
              <div className="empty-state-icon">🔕</div>
              <p className="empty-state-title">No notifications</p>
              <p className="empty-state-description">You're all caught up.</p>
            </div>
          )}
        </SectionCard>
      </div>

      <SectionCard title="Recent sample activity" actions={<Link to="/samples" className="section-link">Open samples</Link>}>
        {data.samples.length ? (
          <div className="list">
            {data.samples.slice(0, 5).map((sample) => (
              <div className="list-item" key={id(sample)}>
                <div className="list-item-content">
                  <b>{sample?.sampleNumber || 'Sample'}</b>
                  <small>{sample?.status || 'UNKNOWN'} · {sample?.sampleType || 'No sample type'} · {uname(sample.driverId)}</small>
                </div>
                <StatusBadge status={sample?.status} />
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-state" style={{ padding: 'var(--space-8) var(--space-4)' }}>
            <div className="empty-state-icon">🧪</div>
            <p className="empty-state-title">No samples</p>
            <p className="empty-state-description">No sample activity yet.</p>
          </div>
        )}
      </SectionCard>
    </Page>
  );
}
