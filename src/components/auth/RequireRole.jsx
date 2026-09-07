// Role-gated route guard. Compose with `RequireAuth`:
//
//   <RequireAuth>
//     <RequireRole roles={[ROLE.ADMIN]}>
//       <UsersPage />
//     </RequireRole>
//   </RequireAuth>
//
// Behavior:
//   * If the role is known but disallowed, render `<AccessDenied />`.
//     We do NOT silently redirect, because silently redirecting a manual
//     URL bar entry hides the fact that the route exists and is blocked.
//   * If the role is unknown, render `<AccessDenied />` (no privilege
//     escalation to admin).
//   * The `roles` prop is required; passing an empty list is treated as
//     "deny everyone".
//
// This guard is purely UI-level. The backend is still authoritative — a
// direct API call without the appropriate role returns 403 regardless.

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