import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter, Navigate, NavLink, Route, Routes, useNavigate } from 'react-router-dom';
import './styles.css';
import {
  useLoad, Page, Notice, Avatar, uname, present, when, fail, labels,
} from './pages/utils';
import {
  AssignmentEdit, RouteEdit, SampleActions, ScheduleEdit,
} from './components/EditControls';
import { getHealth } from './api/health';
import {
  assignmentsApi, collectionLocationsApi, journeysApi, notificationsApi, pushSubscriptionsApi,
  routesApi, samplesApi, schedulesApi,
} from './api/fieldflow';
import { ToastProvider, useToast } from './components/Toast';
import { disablePushNotifications, enablePushNotifications, getPushState } from './services/pushNotificationService';
import Dashboard from './pages/Dashboard';
import Assignments from './pages/Assignments';
import RoutesPage from './pages/RoutesPage';
import MyWork from './pages/MyWork';
import ListOfWork from './pages/ListOfWork';
import Tracking from './pages/Tracking';
import Scan from './pages/Scan';
import Samples from './pages/Samples';
import Schedules from './pages/Schedules';
import Notifications from './pages/Notifications';
import CollectionLocations from './pages/CollectionLocations';
import OperationalMap from './pages/OperationalMap';
import Users from './pages/Users';
import LoginPage from './pages/auth/LoginPage';
import RegisterPage from './pages/auth/RegisterPage';
import AccountPage from './pages/auth/AccountPage';
import WelcomePage from './pages/auth/WelcomePage';
import { RequireAuth } from './components/auth/RequireAuth';
import { RequireRole } from './components/auth/RequireRole';
import { AuthProvider, useAuth } from './context/AuthContext';
import {
  ROLE, buildNavLinksForRole, getDefaultRouteForRole, getAllowedRolesForPath,
  roleLabel, isKnownRole,
} from './auth/roles';

function LogoutButton() {
  const auth = useAuth();
  const [submitting, setSubmitting] = useState(false);

  const handleClick = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      await auth.logout();
      // After the backend clears the session, the AuthContext has no user
      // and the route guard sends the visitor to /login on next render.
      if (typeof window !== 'undefined') {
        window.location.assign('/#/login');
      }
    } catch (error) {
      // AuthContext.logout already swallows backend errors and clears state.
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <button
      type="button"
      className="btn btn-secondary account-logout"
      onClick={handleClick}
      disabled={submitting}
      aria-label="Sign out of FieldFlow"
    >
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
        <polyline points="16 17 21 12 16 7" />
        <line x1="21" y1="12" x2="9" y2="12" />
      </svg>
      <span>{submitting ? 'Signing out…' : 'Sign out'}</span>
    </button>
  );
}

function Shell({ u, status, children, unreadCount, sidebarOpen, onToggleSidebar }) {
  const notificationsLabel = unreadCount > 0 ? `Notifications (${unreadCount})` : 'Notifications';
  // Sidebar links come from the central role helper. Unknown roles render
  // an empty list — the user can still see the current page and log out,
  // but cannot navigate to anything else.
  const links = buildNavLinksForRole(u.role, { notificationsLabel });

  return (
    <div className={`app ${sidebarOpen ? 'sidebar-open' : 'sidebar-closed'}`}>
      <aside className={sidebarOpen ? 'open' : ''}>
        <div className="brand">◉ <span>fieldflow</span></div>
        <p className="nav-section-title">{u.roleLabel}</p>
        <nav style={{ display: 'grid', gap: '2px' }}>
          {links.map(([to, text]) => (
            <NavLink end={to === '/'} to={to} key={to} className="nav">
              <span className="nav-icon">{text.charAt(0)}</span>
              {text}
            </NavLink>
          ))}
        </nav>
        <div className="account">
          <small>Network: {status === 'ONLINE' ? 'Online' : status === 'RECONNECTING' ? 'Reconnecting' : status === 'OFFLINE' ? 'Offline' : 'Server unavailable'}</small>
          <div className="profile">
            <Avatar u={u} />
            <span>
              <b>{u.name}</b>
              <small>{u.roleLabel}</small>
            </span>
          </div>
          <LogoutButton />
        </div>
        {sidebarOpen && (
          <button className="sidebar-close" onClick={onToggleSidebar} aria-label="Close sidebar" type="button">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        )}
      </aside>
      <div className="sidebar-backdrop" onClick={onToggleSidebar} />
      <main>
        <button className="sidebar-toggle" onClick={onToggleSidebar} aria-label="Toggle navigation" type="button">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="4" y1="6" x2="20" y2="6" />
            <line x1="4" y1="12" x2="20" y2="12" />
            <line x1="4" y1="18" x2="20" y2="18" />
          </svg>
        </button>
        {children}
      </main>
    </div>
  );
}

// Single source of truth for the operational route table. The `roles`
// list is the FE's mirror of the backend's `requireRole(...)` guards in
// `server/src/routes/*`. A missing entry means "open to every
// authenticated role".
//
// Each entry is wrapped in `<RequireRole>` automatically; if the user's
// role is not allowed, the route renders `<AccessDenied />` (the user
// can manually navigate back). This makes the URL bar tell the truth:
// a manual `/users` entry from a DRIVER shows an explicit denial page
// rather than silently redirecting.
const OPERATIONAL_ROUTES = [
  { path: '/', element: Dashboard },
  // Admin-only area.
  { path: '/users', element: Users, roles: [ROLE.ADMIN] },
  // Operational management (admin + operator).
  { path: '/locations', element: CollectionLocations, roles: [ROLE.OPERATOR, ROLE.ADMIN] },
  { path: '/assignments', element: Assignments, roles: [ROLE.OPERATOR, ROLE.ADMIN, ROLE.DRIVER] },
  { path: '/schedules', element: Schedules, roles: [ROLE.OPERATOR, ROLE.ADMIN] },
  { path: '/routes', element: RoutesPage },
  { path: '/map', element: OperationalMap },
  { path: '/samples', element: Samples },
  // Staff-only — mirrors the backend's `assertRole` in
  // `notificationController.js`. Drivers see their notifications in-app
  // via the polling component in `AuthenticatedApp`, but the dedicated
  // page is restricted.
  { path: '/notifications', element: Notifications, roles: [ROLE.OPERATOR, ROLE.ADMIN, ROLE.DRIVER] },
  // Driver-only area.
  { path: '/work', element: MyWork, roles: [ROLE.DRIVER] },
  // Driver-only sub-page: every assignment currently assigned to the
  // driver. Reachable from inside My Work so drivers can review pending
  // work even while a journey is in progress.
  { path: '/work/list', element: ListOfWork, roles: [ROLE.DRIVER] },
  { path: '/tracking', element: Tracking, roles: [ROLE.DRIVER] },
  { path: '/scan', element: Scan, roles: [ROLE.DRIVER] },
  // Account / settings — every authenticated role can manage their own
  // password. The backend authoritatively checks the current password
  // and bumps tokenVersion; the page simply calls the API and clears
  // the local session on success.
  { path: '/account', element: AccountPage },
];

function AuthenticatedApp() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [status, setStatus] = useState(() => (typeof navigator !== 'undefined' && !navigator.onLine ? 'OFFLINE' : 'RECONNECTING'));
  const [unreadCount, setUnreadCount] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(() => (typeof window !== 'undefined' && window.innerWidth > 768));
  const audioRef = useRef(null);

  // Notification types that map to "a new thing needs your attention". When a
  // driver receives one of these, the toast becomes an in-app affordance to
  // jump straight to the page where they can respond (accept/decline).
  const assignmentActionTypes = new Set(['ASSIGNMENT_CREATED', 'ASSIGNMENT_ASSIGNED']);

  useEffect(() => {
    if (typeof window !== 'undefined') audioRef.current = new Audio('/notification.wav');
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    getPushState().then((state) => {
      if (!state.supported) return;
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js').catch(() => {});
      }
    });
  }, []);

  const playSound = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(() => {});
    }
  }, []);

  const toggleSidebar = useCallback(() => setSidebarOpen((prev) => !prev), []);

  useEffect(() => {
    let live = true;
    const checkServer = async () => {
      if (!navigator.onLine) {
        if (live) setStatus('OFFLINE');
        return;
      }
      if (live) setStatus('RECONNECTING');
      try {
        await getHealth();
        if (live) setStatus('ONLINE');
      } catch {
        if (live) setStatus('SERVER_UNAVAILABLE');
      }
    };
    const onOnline = () => { void checkServer(); };
    const onOffline = () => { if (live) setStatus('OFFLINE'); };
    void checkServer();
    const interval = setInterval(checkServer, 30000);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      live = false;
      clearInterval(interval);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  // Notifications polling. The backend already scopes notifications to the
  // authenticated user (operator/admin override allowed via `recipientId`),
  // so we no longer need to pass a user id from the client.
  //
  // All authenticated roles — including DRIVER — poll their own unread
  // notifications so the badge count updates in real time without a full
  // page refresh. The backend authorization in `notificationController.js`
  // enforces object-level scoping for each role.
  useEffect(() => {
    if (!user) return undefined;
    let newestSeenAt = null;
    let live = true;
    const poll = async () => {
      try {
        const notifications = await notificationsApi.list();
        if (!live) return;
        const unread = notifications.filter((n) => !n.readAt).length;
        setUnreadCount(unread);
        if (notifications.length > 0) {
          const newest = notifications[0];
          if (newestSeenAt === null) {
            newestSeenAt = newest.createdAt;
          } else if (newest.createdAt > newestSeenAt) {
            newestSeenAt = newest.createdAt;
            playSound();
            // Route server-push notifications through the shared toast system.
            // Actionable types (new assignment for a driver) get an onClick that
            // deep-links to the work list so the driver can respond immediately.
            const isActionable = assignmentActionTypes.has(newest.type);
            const isDriver = user?.role === ROLE.DRIVER;
            toast({
              message: newest.message,
              sub: (isActionable && isDriver) ? 'Tap to review' : undefined,
              type: isActionable ? 'actionable' : 'info',
              timeout: 8000,
              onClick: (isActionable && isDriver) ? () => navigate('/work/list') : undefined,
            });
          }
        }
      } catch (e) { /* ignore polling errors */ }
    };
    poll();
    const interval = setInterval(poll, 8000);
    return () => { live = false; clearInterval(interval); };
  }, [user, playSound, toast, navigate]);

  // Project the AuthContext user into the `{name, roleLabel, initials, color}`
  // shape that the existing `Avatar` / sidebar expect. The `present()`
  // helper already handles role label formatting.
  const presentedUser = useMemo(() => {
    if (!user) return null;
    return present({ ...user, _id: user.id || user._id });
  }, [user]);

  if (!presentedUser) return null;

  const wrap = (C) => (
    <Shell u={presentedUser} status={status} unreadCount={unreadCount} sidebarOpen={sidebarOpen} onToggleSidebar={toggleSidebar}>
      <C user={presentedUser} u={presentedUser} />
    </Shell>
  );

  return (
    <Routes>
       {OPERATIONAL_ROUTES.map(({ path, element: C, roles }) => (
         <Route
           key={path}
           path={path}
           element={
             roles
               ? <RequireRole roles={roles} requestedPath={path}>{wrap(C)}</RequireRole>
               : wrap(C)
           }
         />
       ))}
      <Route path="*" element={<Navigate to={getDefaultRouteForRole(presentedUser.role)} replace />} />
    </Routes>
  );
}

function App() {
  return (
    <Routes>
      {/* Public routes — never require auth. Authenticated visitors are
          bounced away from these by LoginPage/RegisterPage themselves. */}
      <Route path="/welcome" element={<WelcomePage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      {/* Everything else requires an authenticated session. */}
      <Route
        path="/*"
        element={
          <RequireAuth>
            <AuthenticatedApp />
          </RequireAuth>
        }
      />
    </Routes>
  );
}

createRoot(document.getElementById('root')).render(
  <HashRouter>
    <ToastProvider>
      <AuthProvider>
        <App />
      </AuthProvider>
    </ToastProvider>
  </HashRouter>,
);
