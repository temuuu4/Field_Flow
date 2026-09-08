// Role-gated route guard. Compose with `RequireAuth`. When the caller's
// role is disallowed (or unknown), render `<AccessDenied />` rather
// than silently redirecting: a manual URL-bar entry should still reveal
// that the route exists and is blocked, and an empty `roles` list is
// treated as "deny everyone" (no privilege escalation to admin). The
// backend remains the security authority — a direct API call without
// the appropriate role returns 403 regardless.

import { useAuth } from '../../context/AuthContext';
import { AccessDenied } from './AccessDenied';

export function RequireRole({ roles, children, requestedPath }) {
  if (!Array.isArray(roles) || roles.length === 0) {
    return <AccessDenied requestedPath={requestedPath} />;
  }
  const { user } = useAuth();
  const role = user?.role ?? null;
  if (!role || !roles.includes(role)) {
    return <AccessDenied requestedPath={requestedPath} />;
  }
  return children;
}