import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { assignmentsApi, journeysApi, notificationsApi, samplesApi, schedulesApi } from '../api/fieldflow';

const id = (value) => value?._id || value?.id || value;
const asArray = (value) => Array.isArray(value) ? value : [];
const count = (items, status) => asArray(items).filter((item) => item?.status === status).length;

export default function Dashboard({ user, selectedUser, users }) {
  const currentUser = user ?? selectedUser ?? null;
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
          if (live) {
            setData({ assignments: [], samples: [], journeys: [], notifications: [], schedules: [] });
            setLoading(false);
          }
          return;
        }

        setLoading(true);
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
    return <section className="card"><h2>Dashboard</h2><p>No development user selected.</p></section>;
  }
  if (error) {
    return <section className="card"><h2>Dashboard</h2><p className="form-error">{error}</p></section>;
  }
  if (loading) {
    return <section className="card"><h2>Dashboard</h2><p>Loading real operational data…</p></section>;
  }

  const cards = currentRole === 'DRIVER'
    ? [['Assigned work', count(data.assignments, 'ASSIGNED')], ['In progress', count(data.assignments, 'IN_PROGRESS')], ['Pending samples', count(data.samples, 'PENDING')], ['Active journeys', count(data.journeys, 'IN_PROGRESS')]]
    : [['Assignments', data.assignments.length], ['In progress', count(data.assignments, 'IN_PROGRESS')], ['Submitted samples', count(data.samples, 'SUBMITTED')], ['Active journeys', count(data.journeys, 'IN_PROGRESS')], ['Upcoming schedules', data.schedules.length], ['Unread alerts', data.notifications.filter((item) => !item?.readAt).length]];

  return <><section className="stats dashboard-stats">{cards.map(([label, value]) => <div className="stat" key={label}><i className="purple">●</i><span><small>{label}</small><b>{value}</b></span></div>)}</section><section className="dashboard-grid"><div className="card"><div className="sectiontitle"><h2>{currentRole === 'DRIVER' ? 'My recent work' : 'Recent assignments'}</h2><Link to="/assignments">Open assignments</Link></div>{data.assignments.length ? data.assignments.slice(0, 5).map((assignment) => <div className="driver" key={id(assignment)}><span><b>{assignment?.title || 'Untitled assignment'}</b><small>{assignment?.status || 'UNKNOWN'} · {assignment?.scheduledStartAt ? new Date(assignment.scheduledStartAt).toLocaleString() : 'No scheduled time'}</small></span></div>) : <p>No assignments.</p>}</div><div className="card"><div className="sectiontitle"><h2>Recent notifications</h2><Link to="/notifications">All notifications</Link></div>{data.notifications.length ? data.notifications.slice(0, 5).map((notification) => <div className="driver" key={id(notification)}><span><b>{notification?.message || 'Notification'}</b><small>{notification?.readAt ? 'Read' : 'Unread'} · {notification?.createdAt ? new Date(notification.createdAt).toLocaleString() : 'No timestamp'}</small></span></div>) : <p>No notifications.</p>}</div></section><section className="card"><div className="sectiontitle"><h2>Recent sample activity</h2><Link to="/samples">Open samples</Link></div>{data.samples.length ? data.samples.slice(0, 5).map((sample) => <div className="driver" key={id(sample)}><span><b>{sample?.sampleNumber || 'Sample'}</b><small>{sample?.status || 'UNKNOWN'} · {sample?.sampleType || 'No sample type'}</small></span></div>) : <p>No samples.</p>}</section></>;
}
