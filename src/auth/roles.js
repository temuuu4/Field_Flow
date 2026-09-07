// Centralized role authorization helper for the frontend.
//
// The backend remains the security authority. This module is the single
// source of truth for the FE's role display strings, role-gated navigation
// labels, role-gated route allow-lists, and role-based landing defaults.
//
// IMPORTANT: never trust a role from URL params, query strings, or local
// state. The authenticated role always comes from `AuthContext.user.role`,
// which originates from `/api/auth/me` and the backend session.

// Role constants must match the backend `server/src/models/constants.js`
// values exactly.
export const ROLE = Object.freeze({
  ADMIN: 'IT_ADMIN',
  OPERATOR: 'OPERATOR',
  DRIVER: 'DRIVER',
});

// Canonical list of all known roles in the expected backend order.
export const ALL_ROLES = Object.freeze([ROLE.ADMIN, ROLE.OPERATOR, ROLE.DRIVER]);

// Sets for fast membership testing.
export const ROLE_SET = Object.freeze(new Set(ALL_ROLES));

// Convenience helpers used across the app.
export const isKnownRole = (role) => typeof role === 'string' && ROLE_SET.has(role);

export const hasRole = (user, role) => Boolean(user && user.role === role);

export const hasAnyRole = (user, roles) => Boolean(
  user && Array.isArray(roles) && roles.includes(user.role),
);

// Display labels for the sidebar/profile UI. The Driver label is
// intentionally short ("Driver"); operators/admins get their formal role.
export const ROLE_LABEL = Object.freeze({
  [ROLE.ADMIN]: 'IT Administrator',
  [ROLE.OPERATOR]: 'Operations Admin',
  [ROLE.DRIVER]: 'Driver',
});

export const roleLabel = (role) => ROLE_LABEL[role] || (typeof role === 'string' ? role : '—');

// Stable role landing route. Admins and operators share the operator
// dashboard at `/`. Drivers land on Dashboard (`/`), not `/work`. An
// unknown role falls back to `/` (no privilege escalation to admin).
export const DEFAULT_ROUTE_BY_ROLE = Object.freeze({
  [ROLE.ADMIN]: '/',
  [ROLE.OPERATOR]: '/',
  [ROLE.DRIVER]: '/',
});

export const getDefaultRouteForRole = (role) => DEFAULT_ROUTE_BY_ROLE[role] || '/';

// Sidebar navigation. Each role's list is the single source of truth for
// what links appear in the sidebar. Pages with role-gated access use the
// `ROUTE_ROLES` map below so navigation and route protection stay in sync.
//
// `notificationsLabel` is computed at render time (it depends on the live
// unread count) so we expose a factory that accepts it as a parameter.
export function buildNavLinksForRole(role, { notificationsLabel = 'Notifications' } = {}) {
  switch (role) {
    case ROLE.DRIVER:
      // Drivers have both a Dashboard (the app landing page) and a
      // dedicated "My Work" page for their assigned assignments.
      return [
        ['/', 'Dashboard'],
        ['/work', 'My Work'],
        ['/tracking', 'Journey & GPS'],
        ['/scan', 'Collect sample'],
        ['/samples', 'My samples'],
        ['/map', 'Map'],
        ['/notifications', 'Notifications'],
        ['/account', 'Account'],
      ];
    case ROLE.OPERATOR:
      return [
        ['/', 'Dashboard'],
        ['/assignments', 'Assignments'],
        ['/routes', 'Routes'],
        ['/samples', 'Sample review'],
        ['/schedules', 'Recurring schedules'],
        ['/map', 'Map'],
        ['/notifications', notificationsLabel],
        ['/locations', 'Collection locations'],
        ['/account', 'Account'],
      ];
    case ROLE.ADMIN:
      return [
        ['/', 'Dashboard'],
        ['/assignments', 'Assignments'],
        ['/routes', 'Routes'],
        ['/samples', 'Sample review'],
        ['/schedules', 'Recurring schedules'],
        ['/map', 'Map'],
        ['/notifications', notificationsLabel],
        ['/locations', 'Collection locations'],
        ['/users', 'Users'],
        ['/account', 'Account'],
      ];
    default:
      // Unknown role: empty list. The user can still navigate by URL but
      // route guards will deny them; logout remains available.
      return [];
  }
}

// Per-route allowed roles. Routes not listed here are reachable by every
// authenticated user (matching the backend's "any authenticated" default).
// Keep this in sync with `server/src/routes/*` role guards.
export const ROUTE_ROLES = Object.freeze({
  '/users': [ROLE.ADMIN],
  '/locations': [ROLE.OPERATOR, ROLE.ADMIN],
  '/assignments': [ROLE.OPERATOR, ROLE.ADMIN, ROLE.DRIVER],
  '/work': [ROLE.DRIVER],
  '/work/list': [ROLE.DRIVER],
  '/tracking': [ROLE.DRIVER],
  '/scan': [ROLE.DRIVER],
  '/notifications': [ROLE.OPERATOR, ROLE.ADMIN, ROLE.DRIVER],
});

// Returns the allowed-roles list for a given path, or `null` when the
// route is open to every authenticated user.
export function getAllowedRolesForPath(pathname) {
  if (!pathname) return null;
  // Strip any trailing slash so `/users/` matches `/users`.
  const normalized = pathname.length > 1 && pathname.endsWith('/')
    ? pathname.slice(0, -1)
    : pathname;
  return ROUTE_ROLES[normalized] ?? null;
}