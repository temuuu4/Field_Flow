import { authenticate, requireRole } from './auth.js';
import { csrfProtection } from './security.js';
import { USER_ROLES } from '../models/constants.js';

// Convenience helpers for consistent route protection across the API.
//
// `protect()` applies the authentication middleware to a router.
// `protectMutation()` applies both auth and CSRF protection to a router that
// will only ever serve state-changing requests (POST/PATCH/DELETE).
//
// Role-based access is composed with `requireRole`.

export { authenticate, requireRole };

export const protect = () => authenticate;
export const protectMutation = () => [authenticate, csrfProtection];

// Common role groupings used throughout the API.
export const roles = Object.freeze({
  // Operations that should only be performed by IT administrators.
  adminOnly: [USER_ROLES.IT_ADMIN],
  // Operations that operators and IT admins can both perform.
  operatorOrAdmin: [USER_ROLES.IT_ADMIN, USER_ROLES.OPERATOR],
  // Operations that any authenticated user can perform (rare).
  anyAuthenticated: [USER_ROLES.IT_ADMIN, USER_ROLES.OPERATOR, USER_ROLES.DRIVER],
  // Driver-only operations (starting journeys, completing stops, etc.).
  driverOnly: [USER_ROLES.DRIVER],
  // Drivers, operators, and admins can all perform these (read-only data).
  driverOrOperatorOrAdmin: [USER_ROLES.IT_ADMIN, USER_ROLES.OPERATOR, USER_ROLES.DRIVER],
});
