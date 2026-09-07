import { Assignment } from '../models/Assignment.js';
import { AssignmentStop } from '../models/AssignmentStop.js';
import { DriverPresence } from '../models/DriverPresence.js';
import { Journey } from '../models/Journey.js';
import { LocationPoint } from '../models/LocationPoint.js';
import { Sample } from '../models/Sample.js';
import { User } from '../models/User.js';
import { ASSIGNMENT_STATUSES, ASSIGNMENT_TYPES, JOURNEY_STATUSES, LOCATION_EVENT_TYPES, USER_ROLES } from '../models/constants.js';
import { ApiError } from '../errors/ApiError.js';
import { assertJourneyActive, assertUserRole, isTerminalStop } from '../services/operationRules.js';
import { safeCreateNotification } from '../services/notificationService.js';
import { distanceBetweenPoints, shouldPersistLocationPoint } from '../services/locationSampling.js';
import { parseDate, parseGpsPayload, parseObjectId, rejectUnknownFields } from '../utils/operationValidation.js';

const journeyStartFields = new Set(['assignmentId', 'latitude', 'longitude', 'accuracy', 'speed', 'heading', 'timestamp']);
const journeyLocationFields = new Set(['latitude', 'longitude', 'accuracy', 'speed', 'heading', 'timestamp']);
const journeyEndFields = journeyLocationFields;

const serialize = (document) => {
  const serialized = document?.toObject ? document.toObject({ virtuals: true }) : document;
  if (serialized) delete serialized.__v;
  return serialized;
};

async function getActiveAssignment(assignmentId) {
  const assignment = await Assignment.findById(assignmentId);
  if (!assignment) {
    throw new ApiError(404, 'Assignment not found');
  }
  if (![ASSIGNMENT_STATUSES.ASSIGNED, ASSIGNMENT_STATUSES.ACCEPTED].includes(assignment.status)) {
    throw new ApiError(409, `Assignment must be ASSIGNED or ACCEPTED before a journey starts; current status is ${assignment.status}`);
  }
  return assignment;
}

async function updatePresence({ driverId, assignmentId, journeyId, location, accuracy, speed, heading, recordedAt }) {
  return DriverPresence.findOneAndUpdate(
    { driverId },
    {
      $set: {
        assignmentId,
        journeyId,
        location,
        accuracy,
        speed,
        heading,
        recordedAt,
        lastSeenAt: recordedAt,
      },
    },
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
  );
}

async function persistHistory({ driverId, assignmentId, journeyId, location, accuracy, speed, heading, recordedAt, eventType }) {
  return LocationPoint.create({
    meta: { driverId, assignmentId, journeyId },
    location,
    accuracy,
    speed,
    heading,
    recordedAt,
    eventType,
  });
}

async function getJourneyOrFail(journeyId) {
  const journey = await Journey.findById(journeyId)
    .populate('driverId', 'firstName lastName email role status')
    .populate('assignmentId');
  if (!journey) {
    throw new ApiError(404, 'Journey not found');
  }
  return journey;
}

// Throw 403 when a driver tries to access a journey they do not own.
// Operators/admins always pass.
function assertJourneyVisibleToCaller(journey, caller) {
  if (!caller) throw new ApiError(401, 'Authentication required');
  if ([USER_ROLES.IT_ADMIN, USER_ROLES.OPERATOR].includes(caller.role)) return;
  if (String(journey.driverId?._id ?? journey.driverId) !== String(caller.userId)) {
    throw new ApiError(403, 'You do not have permission to access this journey');
  }
}

export async function startJourney(request, response) {
  rejectUnknownFields(request.body, journeyStartFields, 'journey start');
  const assignmentId = parseObjectId(request.body.assignmentId, 'assignmentId');
  const assignment = await getActiveAssignment(assignmentId);
  const driver = await User.findById(assignment.driverId);
  assertUserRole(driver, 'DRIVER', 'driver');
  // Authorization: a driver may only start a journey for an assignment
  // they are actually assigned to. Operators/admins may start a journey
  // on behalf of any driver.
  if (request.user?.role === USER_ROLES.DRIVER && String(assignment.driverId) !== String(request.user.userId)) {
    throw new ApiError(403, 'You can only start journeys for assignments assigned to you');
  }
  const { assignmentId: ignoredAssignmentId, ...gpsPayload } = request.body;
  const gps = parseGpsPayload(gpsPayload);
  if (gps.accuracy === undefined) {
    throw new ApiError(400, 'accuracy is required when starting a journey');
  }

  const existingDriverJourney = await Journey.findOne({ driverId: assignment.driverId, status: JOURNEY_STATUSES.IN_PROGRESS });
  if (existingDriverJourney) {
    throw new ApiError(409, 'The driver already has an active journey');
  }
  const existingAssignmentJourney = await Journey.findOne({ assignmentId, status: JOURNEY_STATUSES.IN_PROGRESS });
  if (existingAssignmentJourney) {
    throw new ApiError(409, 'The assignment already has an active journey');
  }

  const journey = await Journey.create({
    driverId: assignment.driverId,
    assignmentId,
    status: JOURNEY_STATUSES.IN_PROGRESS,
    startedAt: gps.recordedAt,
    startLocation: gps.location,
    startAccuracy: gps.accuracy,
  });
  await Assignment.updateOne(
    { _id: assignmentId, status: { $in: [ASSIGNMENT_STATUSES.ASSIGNED, ASSIGNMENT_STATUSES.ACCEPTED] } },
    { $set: { status: ASSIGNMENT_STATUSES.IN_PROGRESS } },
  );
  // A route journey has one authoritative active stop from its first GPS
  // backed moment. The unique partial index on AssignmentStop prevents two
  // concurrent starts from activating more than one stop.
  if (assignment.assignmentType === ASSIGNMENT_TYPES.LANDMARK_ROUTE) {
    const firstStop = await AssignmentStop.findOne({ assignmentId, status: 'PENDING' }).sort({ sequence: 1 });
    if (!firstStop) throw new ApiError(409, 'This route assignment has no pending stops to start');
    firstStop.status = 'IN_PROGRESS';
    firstStop.startedAt = gps.recordedAt;
    await firstStop.save();
  }
  await updatePresence({
    driverId: assignment.driverId,
    assignmentId,
    journeyId: journey._id,
    location: gps.location,
    accuracy: gps.accuracy,
    speed: gps.speed,
    heading: gps.heading,
    recordedAt: gps.recordedAt,
  });
  await persistHistory({
    driverId: assignment.driverId,
    assignmentId,
    journeyId: journey._id,
    location: gps.location,
    accuracy: gps.accuracy,
    speed: gps.speed,
    heading: gps.heading,
    recordedAt: gps.recordedAt,
    eventType: LOCATION_EVENT_TYPES.JOURNEY_STARTED,
  });
  await safeCreateNotification({
    recipientId: assignment.createdBy,
    type: 'JOURNEY_STARTED',
    message: `Journey started for assignment ${assignment.title}`,
    assignmentId,
    journeyId: journey._id,
  });

  response.status(201).json({ success: true, data: { journey: serialize(await getJourneyOrFail(journey._id)) } });
}

export async function endJourney(request, response) {
  rejectUnknownFields(request.body ?? {}, journeyEndFields, 'journey end');
  const journeyId = parseObjectId(request.params.id, 'journey id');
  const journey = await Journey.findById(journeyId);
  assertJourneyActive(journey);
  // Object-level check: drivers can only end their own journey.
  assertJourneyVisibleToCaller(journey, request.user);
  const journeyAssignment = await Assignment.findById(journey.assignmentId);
  if (journeyAssignment?.assignmentType === ASSIGNMENT_TYPES.LANDMARK_ROUTE) {
    const unfinishedStop = await AssignmentStop.exists({
      assignmentId: journey.assignmentId,
      status: { $nin: ['COMPLETED', 'SKIPPED'] },
    });
    if (unfinishedStop) throw new ApiError(409, 'Complete or skip every route stop before completing the journey');
  }
  if (journeyAssignment?.assignmentType === ASSIGNMENT_TYPES.SPECIFIC_LOCATION) {
    const submittedSample = await Sample.exists({ journeyId, status: 'SUBMITTED', deletedAt: { $exists: false } });
    if (!submittedSample) throw new ApiError(409, 'Submit the collected sample before completing the journey');
  }
  const presence = await DriverPresence.findOne({ driverId: journey.driverId, journeyId });
  const hasLocationPayload = Object.keys(request.body ?? {}).length > 0;
  const gps = hasLocationPayload ? parseGpsPayload(request.body) : undefined;
  const location = gps?.location ?? presence?.location;
  const accuracy = gps?.accuracy ?? presence?.accuracy;
  const recordedAt = gps?.recordedAt ?? presence?.recordedAt ?? new Date();
  if (!location || accuracy === undefined) {
    throw new ApiError(400, 'An ending location with GPS accuracy is required when no current presence is available');
  }

  journey.status = JOURNEY_STATUSES.COMPLETED;
  journey.endedAt = recordedAt;
  journey.endLocation = location;
  journey.endAccuracy = accuracy;
  await journey.save();
  await persistHistory({
    driverId: journey.driverId,
    assignmentId: journey.assignmentId,
    journeyId,
    location,
    accuracy,
    speed: gps?.speed ?? presence?.speed,
    heading: gps?.heading ?? presence?.heading,
    recordedAt,
    eventType: LOCATION_EVENT_TYPES.JOURNEY_ENDED,
  });
  await updatePresence({
    driverId: journey.driverId,
    assignmentId: journey.assignmentId,
    journeyId,
    location,
    accuracy,
    speed: gps?.speed ?? presence?.speed,
    heading: gps?.heading ?? presence?.heading,
    recordedAt,
  });

  const assignment = await Assignment.findById(journey.assignmentId);
  if (assignment?.assignmentType === ASSIGNMENT_TYPES.SPECIFIC_LOCATION && assignment.status === ASSIGNMENT_STATUSES.IN_PROGRESS) {
    assignment.status = ASSIGNMENT_STATUSES.COMPLETED;
    assignment.completedAt = recordedAt;
    await assignment.save();
  }
  if (assignment?.assignmentType === ASSIGNMENT_TYPES.LANDMARK_ROUTE && assignment.status === ASSIGNMENT_STATUSES.IN_PROGRESS) {
    const stops = await AssignmentStop.find({ assignmentId: assignment._id });
    if (stops.length > 0 && stops.every((stop) => isTerminalStop(stop.status))) {
      assignment.status = ASSIGNMENT_STATUSES.COMPLETED;
      assignment.completedAt = recordedAt;
      await assignment.save();
    }
  }

  if (assignment?.createdBy) {
    await safeCreateNotification({
      recipientId: assignment.createdBy,
      type: 'JOURNEY_COMPLETED',
      message: `Journey completed for assignment ${assignment.title}`,
      assignmentId: assignment._id,
      journeyId,
    });
  }

  response.json({ success: true, data: { journey: serialize(await getJourneyOrFail(journeyId)) } });
}

export async function arriveJourney(request, response) {
  rejectUnknownFields(request.body ?? {}, new Set([]), 'journey arrival');
  const journey = await Journey.findById(parseObjectId(request.params.id, 'journey id'));
  assertJourneyActive(journey);
  assertJourneyVisibleToCaller(journey, request.user);
  const assignment = await Assignment.findById(journey.assignmentId);
  if (assignment?.assignmentType !== ASSIGNMENT_TYPES.SPECIFIC_LOCATION) {
    throw new ApiError(409, 'Route journeys record arrival on their active stop');
  }
  if (!journey.arrivedAt) {
    journey.arrivedAt = new Date();
    await journey.save();
  }
  response.json({ success: true, data: { journey: serialize(journey) } });
}

export async function getActiveDriverTask(request, response) {
  const driverId = request.user.userId;
  const journey = await Journey.findOne({ driverId, status: JOURNEY_STATUSES.IN_PROGRESS }).sort({ startedAt: -1 });
  if (!journey) {
    response.json({ success: true, data: { task: null } });
    return;
  }
  const assignment = await Assignment.findById(journey.assignmentId)
    .populate('routeId', 'name version')
    .populate('driverId', 'firstName lastName');
  if (!assignment) throw new ApiError(409, 'The active journey has no assignment');
  const stops = assignment.assignmentType === ASSIGNMENT_TYPES.LANDMARK_ROUTE
    ? await AssignmentStop.find({ assignmentId: assignment._id }).sort({ sequence: 1 })
    : [];
  const activeStop = stops.find((stop) => stop.status === 'IN_PROGRESS') || null;
  const nextStop = stops.find((stop) => stop.status === 'PENDING') || null;
  const activeSampleId = activeStop?.activeSampleId ?? journey.activeSampleId;
  const activeSample = activeSampleId ? await Sample.findById(activeSampleId) : null;
  const completedStops = stops.filter((stop) => isTerminalStop(stop.status));
  response.json({
    success: true,
    data: {
      task: {
        journey: serialize(journey), assignment: serialize(assignment), stops: stops.map(serialize),
        activeStop: serialize(activeStop), nextStop: serialize(nextStop), completedStops: completedStops.map(serialize),
        remainingStops: stops.filter((stop) => !isTerminalStop(stop.status)).map(serialize),
        activeSample: serialize(activeSample),
        canCompleteJourney: assignment.assignmentType !== ASSIGNMENT_TYPES.LANDMARK_ROUTE || stops.every((stop) => isTerminalStop(stop.status)),
      },
    },
  });
}

export async function updateJourneyLocation(request, response) {
  rejectUnknownFields(request.body, journeyLocationFields, 'location update');
  const journeyId = parseObjectId(request.params.id, 'journey id');
  const journey = await Journey.findById(journeyId);
  assertJourneyActive(journey);
  // Object-level check: drivers can only update their own journey.
  assertJourneyVisibleToCaller(journey, request.user);
  const gps = parseGpsPayload(request.body);
  const previousPresence = await DriverPresence.findOne({ driverId: journey.driverId, journeyId });
  const accuracy = gps.accuracy ?? previousPresence?.accuracy;
  if (accuracy === undefined) {
    throw new ApiError(400, 'accuracy is required for the first location update');
  }
  const currentUpdate = { ...gps, accuracy };
  const persist = shouldPersistLocationPoint(previousPresence, currentUpdate);
  const presence = await updatePresence({
    driverId: journey.driverId,
    assignmentId: journey.assignmentId,
    journeyId,
    location: gps.location,
    accuracy,
    speed: gps.speed,
    heading: gps.heading,
    recordedAt: gps.recordedAt,
  });
  if (persist) {
    await persistHistory({
      driverId: journey.driverId,
      assignmentId: journey.assignmentId,
      journeyId,
      location: gps.location,
      accuracy,
      speed: gps.speed,
      heading: gps.heading,
      recordedAt: gps.recordedAt,
      eventType: LOCATION_EVENT_TYPES.GPS_UPDATE,
    });
  }
  response.json({ success: true, data: { persistedHistory: persist, presence: serialize(presence) } });
}

export async function getJourneys(request, response) {
  const caller = request.user;
  const filter = {};
  // Driver scoping: drivers only see their own journeys. Operators/admins
  // see all and may also pass an explicit driverId query filter.
  if (caller?.role === USER_ROLES.DRIVER) {
    if (request.query.driverId !== undefined && String(parseObjectId(request.query.driverId, 'driverId')) !== String(caller.userId)) {
      throw new ApiError(403, 'Drivers may only list their own journeys');
    }
    filter.driverId = caller.userId;
  } else if (request.query.driverId !== undefined) {
    filter.driverId = parseObjectId(request.query.driverId, 'driverId');
  }
  if (request.query.assignmentId !== undefined) filter.assignmentId = parseObjectId(request.query.assignmentId, 'assignmentId');
  if (request.query.status !== undefined) {
    const status = String(request.query.status).trim().toUpperCase();
    if (!Object.values(JOURNEY_STATUSES).includes(status)) throw new ApiError(400, 'Invalid journey status');
    filter.status = status;
  }
  const journeys = await Journey.find(filter)
    .sort({ createdAt: -1 })
    .populate('driverId', 'firstName lastName email role status')
    .populate('assignmentId');
  response.json({ success: true, data: { journeys: journeys.map(serialize) } });
}

export async function getJourney(request, response) {
  const journey = await getJourneyOrFail(parseObjectId(request.params.id, 'journey id'));
  // Object-level check: drivers can only fetch their own journey.
  assertJourneyVisibleToCaller(journey, request.user);
  response.json({ success: true, data: { journey: serialize(journey) } });
}

export async function getJourneyHistory(request, response) {
  const journeyId = parseObjectId(request.params.id, 'journey id');
  const journey = await getJourneyOrFail(journeyId);
  // Object-level check: drivers can only fetch history for their own
  // journey.
  assertJourneyVisibleToCaller(journey, request.user);
  const points = await LocationPoint.find({ 'meta.journeyId': journeyId })
    .sort({ recordedAt: 1 })
    .select('location accuracy speed heading eventType recordedAt meta');
  response.json({ success: true, data: { points: points.map(serialize) } });
}

export async function getDriverPresence(request, response) {
  const driverId = parseObjectId(request.params.driverId, 'driver id');
  // Object-level check: drivers may only view their own presence.
  // Operators/admins may view any driver.
  if (request.user?.role === USER_ROLES.DRIVER && String(driverId) !== String(request.user.userId)) {
    throw new ApiError(403, 'You can only view your own presence');
  }
  const driver = await User.findById(driverId).select('firstName lastName email role status');
  assertUserRole(driver, 'DRIVER', 'driver');
  const presence = await DriverPresence.findOne({ driverId });
  const currentJourney = await Journey.findOne({ driverId, status: JOURNEY_STATUSES.IN_PROGRESS })
    .populate('assignmentId');
  response.json({
    success: true,
    data: {
      driver: serialize(driver),
      active: Boolean(currentJourney),
      currentJourney: currentJourney ? serialize(currentJourney) : null,
      currentAssignment: currentJourney?.assignmentId ? serialize(currentJourney.assignmentId) : null,
      latestLocation: presence ? serialize(presence) : null,
    },
  });
}
