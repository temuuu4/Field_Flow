import { ASSIGNMENT_STATUSES, ASSIGNMENT_STOP_STATUSES, JOURNEY_STATUSES, USER_ROLES, USER_STATUSES } from '../models/constants.js';
import { ApiError } from '../errors/ApiError.js';

const assignmentTransitions = Object.freeze({
  [ASSIGNMENT_STATUSES.DRAFT]: [ASSIGNMENT_STATUSES.ASSIGNED, ASSIGNMENT_STATUSES.CANCELLED],
  [ASSIGNMENT_STATUSES.ASSIGNED]: [ASSIGNMENT_STATUSES.ACCEPTED, ASSIGNMENT_STATUSES.IN_PROGRESS, ASSIGNMENT_STATUSES.CANCELLED, ASSIGNMENT_STATUSES.EXPIRED, ASSIGNMENT_STATUSES.DECLINED],
  [ASSIGNMENT_STATUSES.ACCEPTED]: [ASSIGNMENT_STATUSES.IN_PROGRESS, ASSIGNMENT_STATUSES.CANCELLED, ASSIGNMENT_STATUSES.EXPIRED, ASSIGNMENT_STATUSES.DECLINED],
  [ASSIGNMENT_STATUSES.DECLINED]: [],
  [ASSIGNMENT_STATUSES.IN_PROGRESS]: [ASSIGNMENT_STATUSES.COMPLETED, ASSIGNMENT_STATUSES.CANCELLED],
  [ASSIGNMENT_STATUSES.COMPLETED]: [],
  [ASSIGNMENT_STATUSES.CANCELLED]: [],
  [ASSIGNMENT_STATUSES.EXPIRED]: [],
});

export function assertAssignmentTransition(currentStatus, nextStatus) {
  if (currentStatus === nextStatus) {
    return;
  }
  if (!assignmentTransitions[currentStatus]?.includes(nextStatus)) {
    throw new ApiError(400, `Invalid assignment status transition: ${currentStatus} to ${nextStatus}`);
  }
}

export function assertUserRole(user, role, field) {
  if (!user) {
    throw new ApiError(404, `${field} user not found`);
  }
  if (user.role !== role) {
    throw new ApiError(400, `${field} user must have the ${role} role`);
  }
  if (user.status !== USER_STATUSES.ACTIVE) {
    throw new ApiError(400, `${field} user must be active`);
  }
}

export function assertOperatorRole(user, field = 'creator') {
  if (!user) {
    throw new ApiError(404, `${field} user not found`);
  }
  if (![USER_ROLES.OPERATOR, USER_ROLES.IT_ADMIN].includes(user.role)) {
    throw new ApiError(400, `${field} user must have the OPERATOR or IT_ADMIN role`);
  }
  if (user.status !== USER_STATUSES.ACTIVE) {
    throw new ApiError(400, `${field} user must be active`);
  }
}

export function assertJourneyActive(journey) {
  if (!journey) {
    throw new ApiError(404, 'Journey not found');
  }
  if (journey.status !== JOURNEY_STATUSES.IN_PROGRESS) {
    throw new ApiError(409, 'Journey is not in progress');
  }
}

export function assertStopTransition(currentStatus, action) {
  const valid = action === 'start'
    ? currentStatus === ASSIGNMENT_STOP_STATUSES.PENDING
    : action === 'arrive'
      ? currentStatus === ASSIGNMENT_STOP_STATUSES.IN_PROGRESS
    : action === 'complete'
      ? currentStatus === ASSIGNMENT_STOP_STATUSES.IN_PROGRESS
      : [ASSIGNMENT_STOP_STATUSES.PENDING, ASSIGNMENT_STOP_STATUSES.IN_PROGRESS].includes(currentStatus);
  if (!valid) {
    throw new ApiError(400, `Cannot ${action} a stop in ${currentStatus} status`);
  }
}

export function isTerminalStop(status) {
  return [ASSIGNMENT_STOP_STATUSES.COMPLETED, ASSIGNMENT_STOP_STATUSES.SKIPPED].includes(status);
}
