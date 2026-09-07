import { USER_ROLES } from '../models/constants.js';
import { ApiError } from '../errors/ApiError.js';

// Centralized authorization helpers.
//
// These helpers enforce object-level ownership on top of the existing
// role-based middleware (`requireRole`). They never trust role/identity
// values supplied by the client — they derive the caller from
// `request.user`, which is populated by the `authenticate` middleware
// after a database lookup that validates `status`, `tokenVersion`, and
// `role`. Role itself is sourced from the database on every request so
// admin-driven role changes take effect immediately without waiting
// for token expiration.
//
// All helpers throw `ApiError(403, ...)` when the caller is not
// permitted. Authentication failures (no `request.user`) propagate as
// 401 from the upstream `authenticate` middleware — we do NOT use 403
// for missing-authentication cases.

export const ADMIN_ROLES = Object.freeze([USER_ROLES.IT_ADMIN]);
export const OPERATOR_ROLES = Object.freeze([USER_ROLES.IT_ADMIN, USER_ROLES.OPERATOR]);
export const DRIVER_OR_OPERATOR_ROLES = Object.freeze([
  USER_ROLES.IT_ADMIN,
  USER_ROLES.OPERATOR,
  USER_ROLES.DRIVER,
]);

// Check that the caller's role is in `allowedRoles`. Used as a backup
// gate inside controllers when the route did not already apply
// `requireRole` for the same allowed set.
export function assertRole(caller, allowedRoles) {
  if (!caller || !caller.role) {
    throw new ApiError(401, 'Authentication required');
  }
  if (!allowedRoles.includes(caller.role)) {
    throw new ApiError(403, 'You do not have permission to perform this action');
  }
}

// Check that the resource's owning user (e.g. assignment.driverId,
// journey.driverId, sample.driverId, notification.recipientId) matches
// the caller, OR the caller has one of `staffRoles` (typically admin or
// operator) that grants blanket access.
export function assertOwnerOrStaff(caller, ownerId, { staffRoles = ADMIN_ROLES } = {}) {
  if (!caller || !caller.userId) {
    throw new ApiError(401, 'Authentication required');
  }
  if (staffRoles.includes(caller.role)) {
    return;
  }
  if (String(caller.userId) !== String(ownerId)) {
    throw new ApiError(403, 'You do not have permission to perform this action');
  }
}

// Convenience filter-builder: a DRIVER may only see resources whose
// `ownerField` equals their own id; staff roles see everything. Returns
// a Mongo filter fragment.
export function ownerScopedFilter(caller, ownerField, { staffRoles = ADMIN_ROLES } = {}) {
  if (!caller || !caller.userId) {
    throw new ApiError(401, 'Authentication required');
  }
  if (staffRoles.includes(caller.role)) {
    return {};
  }
  return { [ownerField]: caller.userId };
}