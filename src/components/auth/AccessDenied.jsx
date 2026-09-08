// Access-denied view rendered when an authenticated user's role does not
// grant access to the requested page. The view offers a clear message
// and a button back to the user's role-appropriate home route.

import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
  ROLE, getDefaultRouteForRole, roleLabel,
} from '../../auth/roles';

export function AccessDenied({ requestedPath }) {
  const { user } = useAuth();
  const role = user?.role ?? null;
  const home = getDefaultRouteForRole(role);
  // Unknown roles still get a button to `/`; they won't see privileged
  // data because the backend enforces authorization.
  const safeHome = role && role === ROLE.DRIVER ? home : '/';
  return (
    <div className="access-denied">
      <div className="access-denied-card" role="alert" aria-live="polite">
        <div className="access-denied-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
          </svg>
        </div>
        <h1 className="access-denied-title">Access denied</h1>
        <p className="access-denied-message">
          You do not have permission to view this page.
        </p>
        {requestedPath && (
          <p className="access-denied-detail">
            Requested page: <code>{requestedPath}</code>
          </p>
        )}
        <p className="access-denied-detail">
          Your role: <strong>{roleLabel(role)}</strong>
        </p>
        <div className="access-denied-actions">
          <Link to={safeHome} className="btn btn-primary">
            Go to your home
          </Link>
        </div>
      </div>
    </div>
  );
}