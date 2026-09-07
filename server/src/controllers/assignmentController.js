import mongoose from 'mongoose';
import { Assignment } from '../models/Assignment.js';
import { AssignmentStop } from '../models/AssignmentStop.js';
import { Journey } from '../models/Journey.js';
import { Route } from '../models/Route.js';
import { RouteStop } from '../models/RouteStop.js';
import { CollectionLocation } from '../models/CollectionLocation.js';
import { User } from '../models/User.js';
import { ASSIGNMENT_STATUSES, ASSIGNMENT_STOP_STATUSES, ASSIGNMENT_TYPES, JOURNEY_STATUSES, USER_ROLES } from '../models/constants.js';
import { ApiError } from '../errors/ApiError.js';
import { assertAssignmentTransition, assertOperatorRole, assertStopTransition, assertUserRole, isTerminalStop } from '../services/operationRules.js';
import { safeCreateNotification } from '../services/notificationService.js';
import { parseAssignmentStatus, parseAssignmentType, parseDate, parseLocation, parseObjectId, parseOptionalString, parseRequiredString, rejectUnknownFields } from '../utils/operationValidation.js';

const assignmentFields = new Set([
  'assignmentType', 'type', 'driverId', 'createdBy', 'title', 'description', 'sampleType',
  'scheduledStartAt', 'scheduledAt', 'scheduledEndAt', 'dueAt', 'targetLocation', 'routeId', 'route', 'collectionLocationId', 'status',
]);

const updateFields = new Set([
  'driverId', 'title', 'description', 'sampleType', 'scheduledStartAt', 'scheduledAt',
  'scheduledEndAt', 'dueAt', 'targetLocation', 'collectionLocationId', 'status', 'declineReason',
]);

const stopActionFields = new Set(['skipReason', 'timestamp', 'driverId']);

const serialize = (document) => {
  const serialized = document?.toObject ? document.toObject({ virtuals: true }) : document;
  if (serialized) delete serialized.__v;
  return serialized;
};

const firstDefined = (payload, firstField, secondField) => {
  if (payload[firstField] !== undefined && payload[secondField] !== undefined && JSON.stringify(payload[firstField]) !== JSON.stringify(payload[secondField])) {
    throw new ApiError(400, `${firstField} and ${secondField} must match when both are provided`);
  }
  return payload[firstField] ?? payload[secondField];
};

async function assertDriver(driverId) {
  const driver = await User.findById(driverId);
  assertUserRole(driver, 'DRIVER', 'driver');
  return driver;
}

async function assertCreator(createdBy) {
  const creator = await User.findById(createdBy);
  assertOperatorRole(creator, 'creator');
  return creator;
}

async function getAssignmentOrFail(assignmentId) {
  const assignment = await Assignment.findById(assignmentId)
    .populate('driverId', 'firstName lastName email role status')
    .populate('createdBy', 'firstName lastName email role status')
    .populate('routeId', 'name version status');
  if (!assignment) {
    throw new ApiError(404, 'Assignment not found');
  }
  return assignment;
}

// Resolve the acting driver id used for ownership/authorization checks.
// Drivers may only act on their own assignments/stops — any
// client-supplied `driverId` is overridden with the server-validated
// caller id. Operators/admins can act on behalf of any driver.
function resolveActorDriverId(caller, requestedDriverId) {
  if (caller?.role === USER_ROLES.DRIVER) {
    if (requestedDriverId && String(requestedDriverId) !== String(caller.userId)) {
      throw new ApiError(403, 'Drivers may only act on their own assignments');
    }
    return caller.userId;
  }
  return requestedDriverId;
}

// Throw 403 when a driver tries to access an assignment they aren't
// assigned to. Operator/admin callers are always allowed.
function assertAssignmentVisibleToCaller(assignment, caller) {
  if (!caller) throw new ApiError(401, 'Authentication required');
  if ([USER_ROLES.IT_ADMIN, USER_ROLES.OPERATOR].includes(caller.role)) return;
  if (String(assignment.driverId?._id ?? assignment.driverId) !== String(caller.userId)) {
    throw new ApiError(403, 'You do not have permission to access this assignment');
  }
}

function normalizeAssignmentType(payload, { required = false } = {}) {
  const type = firstDefined(payload, 'assignmentType', 'type');
  return parseAssignmentType(type, { required });
}

function normalizeAssignmentDates(payload, { required = false } = {}) {
  const scheduledStartAt = parseDate(firstDefined(payload, 'scheduledStartAt', 'scheduledAt'), 'scheduledAt', { required });
  const scheduledEndAt = parseDate(firstDefined(payload, 'scheduledEndAt', 'dueAt'), 'dueAt');
  if (scheduledStartAt && scheduledEndAt && scheduledEndAt < scheduledStartAt) {
    throw new ApiError(400, 'dueAt must be after scheduledAt');
  }
  return { scheduledStartAt, scheduledEndAt };
}

function assertCreateStatus(status) {
  if (status && ![ASSIGNMENT_STATUSES.DRAFT, ASSIGNMENT_STATUSES.ASSIGNED].includes(status)) {
    throw new ApiError(400, 'New assignments may only start in DRAFT or ASSIGNED status');
  }
}

async function buildAssignmentDocument(payload) {
  rejectUnknownFields(payload, assignmentFields, 'assignment');
  const assignmentType = normalizeAssignmentType(payload, { required: true });
  const driverId = parseObjectId(payload.driverId, 'driverId');
  const createdBy = parseObjectId(payload.createdBy, 'createdBy');
  await assertDriver(driverId);
  await assertCreator(createdBy);

  const { scheduledStartAt, scheduledEndAt } = normalizeAssignmentDates(payload, { required: true });
  const status = parseAssignmentStatus(payload.status) ?? ASSIGNMENT_STATUSES.ASSIGNED;
  assertCreateStatus(status);

  const document = {
    assignmentType,
    driverId,
    createdBy,
    title: parseRequiredString(payload.title, 'title', 200),
    description: parseOptionalString(payload.description, 'description', 2000),
    scheduledStartAt,
    scheduledEndAt,
    status,
    assignedAt: status === ASSIGNMENT_STATUSES.ASSIGNED ? new Date() : undefined,
  };

  if (assignmentType === ASSIGNMENT_TYPES.SPECIFIC_LOCATION) {
    if (payload.routeId !== undefined || payload.route !== undefined) {
      throw new ApiError(400, 'Specific-location assignments cannot reference a route');
    }
    if (payload.collectionLocationId !== undefined) {
      const location = await CollectionLocation.findById(parseObjectId(payload.collectionLocationId, 'collectionLocationId'));
      if (!location) {
        throw new ApiError(404, 'Collection location not found');
      }
      document.targetLocation = location.location;
      document.targetAddress = location.address;
    } else {
      const targetLocation = parseLocation(payload.targetLocation, 'targetLocation', { required: true });
      document.targetLocation = targetLocation.point;
      document.targetAddress = targetLocation.address;
    }
    if (payload.sampleType !== undefined) {
      document.sampleType = parseOptionalString(payload.sampleType, 'sampleType', 120);
    }
  } else {
    if (payload.targetLocation !== undefined || payload.sampleType !== undefined) {
      throw new ApiError(400, 'Landmark-route assignments cannot use targetLocation or assignment-level sampleType');
    }
    const routeId = parseObjectId(firstDefined(payload, 'routeId', 'route'), 'routeId');
    const route = await Route.findById(routeId);
    if (!route) {
      throw new ApiError(404, 'Route not found');
    }
    if (route.status !== 'ACTIVE') {
      throw new ApiError(400, 'Only active routes can be assigned');
    }
    const stops = await RouteStop.find({ routeId, status: 'ACTIVE' }).sort({ sequence: 1 });
    if (stops.length === 0) {
      throw new ApiError(400, 'A route assignment requires at least one active route stop');
    }
    document.routeId = routeId;
    document.routeVersion = route.version;
    document._routeStops = stops;
  }

  return document;
}

async function populateAssignment(assignmentId) {
  const assignment = await getAssignmentOrFail(assignmentId);
  const stops = await AssignmentStop.find({ assignmentId }).sort({ sequence: 1 });
  return { assignment: serialize(assignment), stops: stops.map(serialize) };
}

export async function createAssignment(request, response) {
  // The authenticated operator is the immutable creator. Never allow a
  // browser to attribute operational actions to a different staff member.
  const document = await buildAssignmentDocument({ ...request.body, createdBy: request.user.userId });
  const routeStops = document._routeStops;
  delete document._routeStops;
  const session = await mongoose.startSession();
  let assignment;
  try {
    await session.withTransaction(async () => {
      [assignment] = await Assignment.create([document], { session });
      if (routeStops) {
        await AssignmentStop.insertMany(
          routeStops.map((stop) => ({
            assignmentId: assignment._id,
            routeId: assignment.routeId,
            sourceRouteStopId: stop._id,
            name: stop.name,
            location: stop.location,
            address: stop.address,
            sequence: stop.sequence,
          })),
          { session },
        );
      }
    });
  } finally {
    await session.endSession();
  }
  const data = await populateAssignment(assignment._id);
  await safeCreateNotification({
    recipientId: assignment.driverId,
    type: 'ASSIGNMENT_CREATED',
    message: `A new assignment is available: ${assignment.title}`,
    assignmentId: assignment._id,
  });
  response.status(201).json({ success: true, data });
}

export async function getAssignments(request, response) {
  const caller = request.user;
  const filter = {};
  // Driver scoping: a driver may only list their own assignments.
  // Operators/admins see all (and may also pass an explicit driverId
  // query parameter to filter).
  if (caller?.role === USER_ROLES.DRIVER) {
    if (request.query.driverId !== undefined && String(parseObjectId(request.query.driverId, 'driverId')) !== String(caller.userId)) {
      throw new ApiError(403, 'Drivers may only list their own assignments');
    }
    filter.driverId = caller.userId;
  } else if (request.query.driverId !== undefined) {
    filter.driverId = parseObjectId(request.query.driverId, 'driverId');
  }
  if (request.query.createdBy !== undefined) filter.createdBy = parseObjectId(request.query.createdBy, 'createdBy');
  if (request.query.routeId !== undefined) filter.routeId = parseObjectId(request.query.routeId, 'routeId');
  if (request.query.status !== undefined) filter.status = parseAssignmentStatus(request.query.status, { required: true });
  if (request.query.type !== undefined) filter.assignmentType = parseAssignmentType(request.query.type, { required: true });
  if (request.query.assignmentType !== undefined) filter.assignmentType = parseAssignmentType(request.query.assignmentType, { required: true });
  const assignments = await Assignment.find(filter)
    .sort({ createdAt: -1, scheduledStartAt: 1 })
    .populate('driverId', 'firstName lastName email role status')
    .populate('createdBy', 'firstName lastName email role status')
    .populate('routeId', 'name version status');
  response.json({ success: true, data: { assignments: assignments.map(serialize) } });
}

export async function getAssignment(request, response) {
  const assignmentId = parseObjectId(request.params.id, 'assignment id');
  const data = await populateAssignment(assignmentId);
  // Object-level check: a driver can only fetch their own assignment.
  assertAssignmentVisibleToCaller(data.assignment, request.user);
  response.json({ success: true, data });
}

export async function updateAssignment(request, response) {
  rejectUnknownFields(request.body, updateFields, 'assignment');
  const assignment = await Assignment.findById(parseObjectId(request.params.id, 'assignment id'));
  if (!assignment) {
    throw new ApiError(404, 'Assignment not found');
  }
  assertAssignmentVisibleToCaller(assignment, request.user);
  if (request.user.role === USER_ROLES.DRIVER) {
    const allowedDriverFields = new Set(['status', 'declineReason']);
    if (Object.keys(request.body).some((field) => !allowedDriverFields.has(field))) {
      throw new ApiError(403, 'Drivers may only decline their own assignments');
    }
    if (request.body.status !== ASSIGNMENT_STATUSES.DECLINED) {
      throw new ApiError(403, 'Drivers may only set an assignment to DECLINED');
    }
  }
  if ([ASSIGNMENT_STATUSES.COMPLETED, ASSIGNMENT_STATUSES.CANCELLED, ASSIGNMENT_STATUSES.EXPIRED].includes(assignment.status)) {
    throw new ApiError(409, 'Terminal assignments cannot be updated');
  }

  if (request.body.driverId !== undefined) {
    const driverId = parseObjectId(request.body.driverId, 'driverId');
    await assertDriver(driverId);
    assignment.driverId = driverId;
  }
  if (request.body.title !== undefined) assignment.title = parseRequiredString(request.body.title, 'title', 200);
  if (request.body.description !== undefined) assignment.description = parseOptionalString(request.body.description, 'description', 2000);
  if (request.body.sampleType !== undefined) assignment.sampleType = parseOptionalString(request.body.sampleType, 'sampleType', 120);
  if (request.body.scheduledStartAt !== undefined || request.body.scheduledAt !== undefined || request.body.scheduledEndAt !== undefined || request.body.dueAt !== undefined) {
    const dates = normalizeAssignmentDates(request.body, { required: false });
    if (dates.scheduledStartAt) assignment.scheduledStartAt = dates.scheduledStartAt;
    if (dates.scheduledEndAt) assignment.scheduledEndAt = dates.scheduledEndAt;
    if (assignment.scheduledEndAt && assignment.scheduledEndAt < assignment.scheduledStartAt) {
      throw new ApiError(400, 'dueAt must be after scheduledAt');
    }
  }
  if (request.body.targetLocation !== undefined || request.body.collectionLocationId !== undefined) {
    if (assignment.assignmentType !== ASSIGNMENT_TYPES.SPECIFIC_LOCATION) {
      throw new ApiError(400, 'Only specific-location assignments can update targetLocation');
    }
    if (request.body.collectionLocationId !== undefined) {
      const location = await CollectionLocation.findById(parseObjectId(request.body.collectionLocationId, 'collectionLocationId'));
      if (!location) {
        throw new ApiError(404, 'Collection location not found');
      }
      assignment.targetLocation = location.location;
      assignment.targetAddress = location.address;
    } else {
      const targetLocation = parseLocation(request.body.targetLocation, 'targetLocation', { required: true });
      assignment.targetLocation = targetLocation.point;
      assignment.targetAddress = targetLocation.address;
    }
  }
  if (request.body.status !== undefined) {
    const status = parseAssignmentStatus(request.body.status, { required: true });
    if ([ASSIGNMENT_STATUSES.IN_PROGRESS, ASSIGNMENT_STATUSES.COMPLETED].includes(status)) {
      throw new ApiError(400, 'IN_PROGRESS and COMPLETED are controlled by journey and stop workflows');
    }
    assertAssignmentTransition(assignment.status, status);
    assignment.status = status;
    if (status === ASSIGNMENT_STATUSES.ASSIGNED) assignment.assignedAt ||= new Date();
    if (status === ASSIGNMENT_STATUSES.CANCELLED) assignment.cancelledAt = new Date();
    if (status === ASSIGNMENT_STATUSES.DECLINED) {
      assignment.declinedAt = new Date();
      if (request.body.declineReason !== undefined) {
        assignment.declineReason = parseOptionalString(request.body.declineReason, 'declineReason', 1000);
      }
    }
  }
  if (request.body.declineReason !== undefined && assignment.status !== ASSIGNMENT_STATUSES.DECLINED) {
    if (!parseOptionalString(request.body.declineReason, 'declineReason', 1000)) {
      throw new ApiError(400, 'declineReason is only valid when status is DECLINED');
    }
  }
  await assignment.save();
  const data = await populateAssignment(assignment._id);
  if (assignment.status === ASSIGNMENT_STATUSES.DECLINED) {
    await safeCreateNotification({
      recipientId: assignment.createdBy,
      type: 'ASSIGNMENT_DECLINED',
      message: `Assignment declined: ${assignment.title}`,
      assignmentId: assignment._id,
      metadata: {
        driverId: assignment.driverId,
        declineReason: assignment.declineReason || '',
      },
    });
  } else if (request.user.role !== USER_ROLES.DRIVER) {
    await safeCreateNotification({
      recipientId: assignment.driverId,
      type: 'ASSIGNMENT_UPDATED',
      message: `Assignment updated: ${assignment.title}`,
      assignmentId: assignment._id,
    });
  }
  response.json({ success: true, data });
}

export async function deleteAssignment(request, response) {
  const assignment = await Assignment.findById(parseObjectId(request.params.id, 'assignment id'));
  if (!assignment) {
    throw new ApiError(404, 'Assignment not found');
  }
  assertAssignmentVisibleToCaller(assignment, request.user);
  if (assignment.status === ASSIGNMENT_STATUSES.COMPLETED || assignment.status === ASSIGNMENT_STATUSES.EXPIRED) {
    throw new ApiError(409, 'Completed or expired assignments cannot be cancelled');
  }
  if (assignment.status !== ASSIGNMENT_STATUSES.CANCELLED) {
    assertAssignmentTransition(assignment.status, ASSIGNMENT_STATUSES.CANCELLED);
    assignment.status = ASSIGNMENT_STATUSES.CANCELLED;
    assignment.cancelledAt = new Date();
    await assignment.save();
    await safeCreateNotification({
      recipientId: assignment.driverId,
      type: 'ASSIGNMENT_CANCELLED',
      message: `Assignment cancelled: ${assignment.title}`,
      assignmentId: assignment._id,
    });
  }
  response.json({ success: true, data: await populateAssignment(assignment._id) });
}

export async function acceptAssignment(request, response) {
  const assignmentId = parseObjectId(request.params.id, 'assignment id');
  const assignment = await Assignment.findById(assignmentId);
  if (!assignment) {
    throw new ApiError(404, 'Assignment not found');
  }
  assertAssignmentVisibleToCaller(assignment, request.user);
  if (request.user.role === USER_ROLES.DRIVER && String(assignment.driverId) !== String(request.user.userId)) {
    throw new ApiError(403, 'Drivers may only accept their own assignments');
  }
  if (![ASSIGNMENT_STATUSES.ASSIGNED, ASSIGNMENT_STATUSES.ACCEPTED].includes(assignment.status)) {
    throw new ApiError(409, `Assignment must be ASSIGNED or ACCEPTED to accept; current status is ${assignment.status}`);
  }
  assignment.status = ASSIGNMENT_STATUSES.ACCEPTED;
  assignment.declineReason = undefined;
  assignment.assignedAt ||= new Date();
  await assignment.save();
  const data = await populateAssignment(assignment._id);
  response.json({ success: true, data });
}

async function getProgressContext(request, action) {
  rejectUnknownFields(request.body, stopActionFields, 'stop action');
  const assignmentId = parseObjectId(request.params.assignmentId, 'assignment id');
  const stopId = parseObjectId(request.params.stopId, 'stop id');
  // Authorization: derive driverId from the authenticated caller for
  // DRIVER role. Operator/admin callers can act on behalf of any driver.
  const requestedDriverId = request.body.driverId !== undefined
    ? parseObjectId(request.body.driverId, 'driverId')
    : undefined;
  const driverId = resolveActorDriverId(request.user, requestedDriverId);
  const assignment = await Assignment.findById(assignmentId);
  if (!assignment) throw new ApiError(404, 'Assignment not found');
  if (assignment.assignmentType !== ASSIGNMENT_TYPES.LANDMARK_ROUTE) throw new ApiError(400, 'Only landmark-route assignments have route stops');
  if (String(assignment.driverId) !== String(driverId)) throw new ApiError(403, 'The driver is not assigned to this assignment');
  const driver = await User.findById(driverId);
  assertUserRole(driver, 'DRIVER', 'driver');
  const journey = await Journey.findOne({ assignmentId, driverId, status: JOURNEY_STATUSES.IN_PROGRESS });
  if (!journey) throw new ApiError(409, 'An active journey is required for stop progress');
  const stop = await AssignmentStop.findOne({ _id: stopId, assignmentId });
  if (!stop) throw new ApiError(404, 'Assignment stop not found');
  const stops = await AssignmentStop.find({ assignmentId }).sort({ sequence: 1 });
  const previousStops = stops.filter((item) => item.sequence < stop.sequence);
  if (previousStops.some((item) => !isTerminalStop(item.status))) {
    throw new ApiError(409, 'Stops must be completed or skipped in order');
  }
  assertStopTransition(stop.status, action);
  return { assignment, stop, stops, timestamp: parseDate(request.body.timestamp, 'timestamp', { defaultValue: new Date() }) };
}

async function completeAssignmentIfReady(assignment, stops) {
  if (stops.every((stop) => isTerminalStop(stop.status)) && assignment.status === ASSIGNMENT_STATUSES.IN_PROGRESS) {
    assignment.status = ASSIGNMENT_STATUSES.COMPLETED;
    assignment.completedAt = new Date();
    await assignment.save();
  }
}

async function activateNextStop(assignmentId, timestamp) {
  const next = await AssignmentStop.findOne({ assignmentId, status: ASSIGNMENT_STOP_STATUSES.PENDING }).sort({ sequence: 1 });
  if (!next) return null;
  next.status = ASSIGNMENT_STOP_STATUSES.IN_PROGRESS;
  next.startedAt = timestamp;
  await next.save();
  return next;
}

export async function getAssignmentStops(request, response) {
  const assignmentId = parseObjectId(request.params.assignmentId, 'assignment id');
  const assignment = await getAssignmentOrFail(assignmentId);
  // Object-level check: drivers can only fetch stops for their own
  // assignments.
  assertAssignmentVisibleToCaller(assignment, request.user);
  const stops = await AssignmentStop.find({ assignmentId }).sort({ sequence: 1 });
  response.json({ success: true, data: { stops: stops.map(serialize) } });
}

export async function startAssignmentStop(request, response) {
  const { stop, timestamp } = await getProgressContext(request, 'start');
  stop.status = ASSIGNMENT_STOP_STATUSES.IN_PROGRESS;
  stop.startedAt = timestamp;
  await stop.save();
  response.json({ success: true, data: { stop: serialize(stop) } });
}

export async function arriveAssignmentStop(request, response) {
  const { stop, timestamp } = await getProgressContext(request, 'arrive');
  if (!stop.arrivedAt) {
    stop.arrivedAt = timestamp;
    await stop.save();
  }
  response.json({ success: true, data: { stop: serialize(stop) } });
}

export async function completeAssignmentStop(request, response) {
  const context = await getProgressContext(request, 'complete');
  if (!context.stop.sampleSubmittedAt) {
    throw new ApiError(409, 'Submit a sample for this stop before completing it');
  }
  context.stop.status = ASSIGNMENT_STOP_STATUSES.COMPLETED;
  context.stop.completedAt = context.timestamp;
  await context.stop.save();
  const resultingStops = context.stops.map((stop) => stop._id.equals(context.stop.id) ? context.stop : stop);
  await completeAssignmentIfReady(context.assignment, resultingStops);
  const nextStop = context.assignment.status === ASSIGNMENT_STATUSES.IN_PROGRESS
    ? await activateNextStop(context.assignment._id, context.timestamp)
    : null;
  response.json({ success: true, data: { stop: serialize(context.stop), nextStop: serialize(nextStop) } });
}

export async function skipAssignmentStop(request, response) {
  const context = await getProgressContext(request, 'skip');
  const reason = parseRequiredString(request.body.skipReason, 'skipReason', 500);
  context.stop.status = ASSIGNMENT_STOP_STATUSES.SKIPPED;
  context.stop.skippedAt = context.timestamp;
  context.stop.skipReason = reason;
  await context.stop.save();
  await completeAssignmentIfReady(context.assignment, context.stops.map((stop) => stop._id.equals(context.stop.id) ? context.stop : stop));
  response.json({ success: true, data: { stop: serialize(context.stop) } });
}
