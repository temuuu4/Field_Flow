import { useState, useEffect } from 'react';
import { notificationsApi, pushSubscriptionsApi } from '../api/fieldflow';
import { useLoad, Page, Notice, uid, fail } from './utils';
import { Button, SectionCard, StatusBadge } from '../components/ui';
import { enablePushNotifications, disablePushNotifications, getPushState } from '../services/pushNotificationService';
import { useToast } from '../components/Toast';

function permissionLabel(permission) {
  if (permission === 'granted') return 'Browser notifications are enabled';
  if (permission === 'denied') return 'Browser notifications are blocked';
  if (permission === 'unsupported') return 'Browser notifications are not supported';
  return 'Browser notifications are waiting for permission';
}

function permissionDescription(permission) {
  if (permission === 'granted') return 'You will receive FieldFlow notifications even when the website is in the background.';
  if (permission === 'denied') return 'To receive notifications, allow notifications for this site in your browser settings, then refresh the page.';
  if (permission === 'unsupported') return 'This browser does not support the Web Notifications API.';
  return 'Enable notifications to receive important updates about assignments, samples, and journeys.';
}

function typeLabel(type) {
  switch (type) {
    case 'ASSIGNMENT_CREATED': return 'New assignment';
    case 'ASSIGNMENT_ASSIGNED': return 'Assignment assigned';
    case 'ASSIGNMENT_UPDATED': return 'Assignment updated';
    case 'ASSIGNMENT_REMINDER': return 'Assignment reminder';
    case 'ASSIGNMENT_CANCELLED': return 'Assignment cancelled';
    case 'ASSIGNMENT_DECLINED': return 'Assignment declined';
    case 'JOURNEY_STARTED': return 'Journey started';
    case 'JOURNEY_COMPLETED': return 'Journey completed';
    case 'SAMPLE_SUBMITTED': return 'Sample submitted';
    case 'SAMPLE_APPROVED': return 'Sample approved';
    case 'SAMPLE_REJECTED': return 'Sample rejected';
    case 'RECURRING_ASSIGNMENT_GENERATED': return 'Recurring assignment generated';
    default: return type;
  }
}

function capabilityIcon(supported) {
  return supported ? '✓' : '✗';
}

export default function Notifications({ u }) {
  const toast = useToast();
  const q = useLoad(() => notificationsApi.list(), []);
  const p = useLoad(() => pushSubscriptionsApi.list(), []);
  const [pushState, setPushState] = useState({ supported: false, permission: 'default', reason: '', capabilities: {} });
  const [pushError, setPushError] = useState('');
  const [localError, setLocalError] = useState('');
  const [pushLoading, setPushLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState({});
  const [online, setOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    let cancelled = false;
    getPushState().then((state) => {
      if (!cancelled) setPushState(state);
    });
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      cancelled = true;
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const enablePush = async () => {
    setPushLoading(true);
    try {
      setPushError('');
      await enablePushNotifications();
      p.load();
      toast('Push notifications enabled.');
    } catch (e) {
      setPushError(fail(e));
    } finally {
      setPushLoading(false);
    }
  };
  const disablePush = async () => {
    setPushLoading(true);
    try {
      setPushError('');
      await disablePushNotifications();
      p.load();
      toast('Push notifications disabled.');
    } catch (e) {
      setPushError(fail(e));
    } finally {
      setPushLoading(false);
    }
  };
  const run = async (fn, id) => {
    if (id) setActionLoading((prev) => ({ ...prev, [id]: true }));
    try { await fn(); q.setError(''); q.load(); p.load(); } catch (e) { q.setError(fail(e)); } finally {
      if (id) setActionLoading((prev) => ({ ...prev, [id]: false }));
    }
  };

  const hasActiveWebPush = p.data?.some((s) => s.provider === 'WEB_PUSH' && s.isActive);
  const permissionGranted = pushState.permission === 'granted';
  const permissionDenied = pushState.permission === 'denied';

  return (
    <Page title="Notifications" u={u}>
      <SectionCard title="Connection status">
        <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap', alignItems: 'center' }}>
          <StatusBadge status={online ? 'ACTIVE' : 'INACTIVE'} />
          <span style={{ fontSize: 'var(--text-sm)', color: 'var(--muted)' }}>
            {online ? 'Notifications connected' : 'Notifications offline — will resume when connection returns'}
          </span>
        </div>
      </SectionCard>

      <SectionCard title="Backend notifications">
        <Notice error={q.error} />
        {q.loading ? (
          <div className="loading-overlay">
            <div className="spinner" />
            <p className="loading-text">Loading notifications…</p>
          </div>
        ) : (
          <div>
            <div style={{ marginBottom: 'var(--space-4)' }}>
              <Button variant="secondary" size="sm" loading={actionLoading['readAll']} onClick={() => run(() => notificationsApi.readAll(), 'readAll')}>
                Mark all read
              </Button>
            </div>
            {q.data.length ? (
              <div className="list">
                {q.data.map((n) => (
                  <div className={`notification-item ${n.readAt ? '' : 'unread'}`} key={uid(n)}>
                    <div className="notification-icon">🔔</div>
                    <div className="notification-content">
                      <b>{n.message}</b>
                      <small>{typeLabel(n.type)} · {new Date(n.createdAt).toLocaleString()} · {n.readAt ? 'Read' : 'Unread'}</small>
                    </div>
                    {!n.readAt && (
                      <Button variant="ghost" size="sm" loading={actionLoading[uid(n)]} onClick={() => run(() => notificationsApi.read(uid(n)), uid(n))}>
                        Mark read
                      </Button>
                    )}
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
          </div>
        )}
      </SectionCard>

      <SectionCard title="Push notifications">
        {!pushState.supported ? (
          <div style={{ display: 'grid', gap: 'var(--space-4)' }}>
            <p style={{ color: 'var(--muted)' }}>Push notifications are not supported in this browser.</p>
            {pushState.reason && <p style={{ fontSize: 'var(--text-sm)', color: 'var(--muted)' }}>{pushState.reason}</p>}
            {pushState.capabilities && (
              <div style={{ display: 'grid', gap: 'var(--space-2)', fontSize: 'var(--text-sm)', color: 'var(--muted)' }}>
                <div>{capabilityIcon(pushState.capabilities.secureContext)} Secure context (HTTPS/localhost)</div>
                <div>{capabilityIcon(pushState.capabilities.notification)} Notification API</div>
                <div>{capabilityIcon(pushState.capabilities.serviceWorker)} Service Worker</div>
                <div>{capabilityIcon(pushState.capabilities.pushManager)} Push API</div>
              </div>
            )}
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 'var(--space-4)' }}>
            <div style={{ display: 'grid', gap: 'var(--space-3)', fontSize: 'var(--text-sm)' }}>
              <div><b>Browser permission:</b> {permissionLabel(pushState.permission)}</div>
              <div style={{ color: 'var(--muted)' }}>{permissionDescription(pushState.permission)}</div>
              <div><b>This device:</b> {hasActiveWebPush ? 'Registered for push notifications' : 'Not registered'}</div>
            </div>

            {(pushError || localError) && <p className="form-error">{pushError || localError}</p>}

            {permissionGranted && !hasActiveWebPush && (
              <Button variant="primary" onClick={enablePush} loading={pushLoading}>Enable notifications</Button>
            )}
            {permissionGranted && hasActiveWebPush && (
              <Button variant="danger" onClick={disablePush} loading={pushLoading}>Disable notifications</Button>
            )}
            {permissionDenied && (
              <div style={{ padding: 'var(--space-3)', background: 'var(--background)', border: '1px solid var(--line)', borderRadius: 'var(--radius-md)', fontSize: 'var(--text-sm)', color: 'var(--muted)' }}>
                Notifications are blocked by your browser. To receive FieldFlow notifications, allow notifications for this site in your browser settings, then refresh the page.
              </div>
            )}

            <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: 'var(--text-md)', fontWeight: 600, margin: '0 0 var(--space-3)' }}>Registered devices</h3>
            {p.loading ? (
              <div className="loading-overlay">
                <div className="spinner" />
                <p className="loading-text">Loading subscriptions…</p>
              </div>
            ) : p.data.length ? (
              <div className="list">
                {p.data.map((s) => (
                  <div className="driver-list-item" key={uid(s)}>
                    <div className="list-main">
                      <b>{s.deviceName || s.platform || 'Unnamed device'}</b>
                      <small>{s.provider} · {s.isActive ? 'Active' : 'Inactive'}</small>
                    </div>
                    <div className="list-actions">
                        {s.isActive && (
                         <Button variant="ghost" size="sm" loading={actionLoading[s.id]} onClick={() => run(() => pushSubscriptionsApi.update(s.id, { isActive: false }), s.id)}>
                           Deactivate
                         </Button>
                       )}
                       <Button variant="danger" size="sm" loading={actionLoading[s.id]} onClick={() => run(() => pushSubscriptionsApi.remove(s.id), s.id)}>
                         Delete
                       </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ color: 'var(--muted)', fontSize: 'var(--text-sm)' }}>No registered devices.</p>
            )}
          </div>
        )}
      </SectionCard>
    </Page>
  );
}
