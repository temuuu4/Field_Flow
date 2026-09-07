import { RecurringSchedule } from '../models/RecurringSchedule.js';
import { Route } from '../models/Route.js';
import { RouteStop } from '../models/RouteStop.js';
import { User } from '../models/User.js';
import { ASSIGNMENT_TYPES, AUDIT_ENTITY_TYPES, RECURRING_SCHEDULE_STATUSES } from '../models/constants.js';
import { ApiError } from '../errors/ApiError.js';
import { recordAudit } from '../services/auditLogService.js';
import { calculateNextOccurrence, generateDueAssignments } from '../services/recurringAssignmentService.js';
import { assertOperatorRole, assertUserRole } from '../services/operationRules.js';
import { parseRecurringPayload, recurringScheduleUpdateFields } from '../utils/recurringValidation.js';
import { parseObjectId, rejectUnknownFields } from '../utils/operationValidation.js';

const serialize = (document) => {
  const serialized = document?.toObject ? document.toObject({ virtuals: true }) : document;
  if (serialized) delete serialized.__v;
  return serialized;
};

async function validateReferences(document) {
  const driver = await User.findById(document.driverId);
  assertUserRole(driver, 'DRIVER', 'driver');
  const creator = await User.findById(document.createdBy);
  assertOperatorRole(creator, 'creator');
  if (document.assignmentType === ASSIGNMENT_TYPES.LANDMARK_ROUTE) {
    const route = await Route.findById(document.routeId);
    if (!route) throw new ApiError(404, 'Route not found');
    if (route.status !== 'ACTIVE') throw new ApiError(400, 'Only active routes can be used by recurring schedules');
    const stopCount = await RouteStop.countDocuments({ routeId: route._id, status: 'ACTIVE' });
    if (stopCount === 0) throw new ApiError(400, 'A recurring route schedule requires at least one active route stop');
  }
}

function toRawSchedule(schedule) {
  const location = schedule.targetLocation
    ? {
      latitude: schedule.targetLocation.coordinates[1],
      longitude: schedule.targetLocation.coordinates[0],
      address: schedule.targetAddress,
    }
    : undefined;
  return {
    name: schedule.name,
    description: schedule.description,
    createdBy: schedule.createdBy,
    driverId: schedule.driverId,
    assignmentType: schedule.assignmentType,
    routeId: schedule.routeId,
    targetLocation: location,
    sampleType: schedule.sampleType,
    frequency: schedule.frequency,
    daysOfWeek: schedule.daysOfWeek,
    dayOfMonth: schedule.dayOfMonth,
    timeOfDay: schedule.timeOfDay,
    timezone: schedule.timezone,
    startDate: schedule.startDate,
    endDate: schedule.endDate,
    status: schedule.status,
  };
}

export async function createRecurringSchedule(request, response) {
  const document = parseRecurringPayload({ ...request.body, createdBy: request.user.userId });
  await validateReferences(document);
  const schedule = new RecurringSchedule({ ...document });
  schedule.nextOccurrenceAt = calculateNextOccurrence(schedule, new Date(schedule.startDate.getTime() - 1));
  if (!schedule.nextOccurrenceAt) schedule.status = RECURRING_SCHEDULE_STATUSES.ENDED;
  await schedule.save();
  await recordAudit({ actorId: schedule.createdBy, action: 'RECURRING_SCHEDULE_CREATED', entityType: AUDIT_ENTITY_TYPES.RECURRING_SCHEDULE, entityId: schedule._id, metadata: { scheduleId: schedule._id }, request });
  response.status(201).json({ success: true, data: { schedule: serialize(schedule) } });
}

export async function getRecurringSchedules(request, response) {
  const filter = {};
  if (request.query.driverId !== undefined) filter.driverId = parseObjectId(request.query.driverId, 'driverId');
  if (request.query.routeId !== undefined) filter.routeId = parseObjectId(request.query.routeId, 'routeId');
  if (request.query.status !== undefined) {
    if (!Object.values(RECURRING_SCHEDULE_STATUSES).includes(String(request.query.status).toUpperCase())) throw new ApiError(400, 'Invalid recurring schedule status');
    filter.status = String(request.query.status).toUpperCase();
  }
  if (request.query.active !== undefined) {
    if (!['true', 'false'].includes(String(request.query.active).toLowerCase())) throw new ApiError(400, 'active must be true or false');
    filter.status = String(request.query.active).toLowerCase() === 'true' ? RECURRING_SCHEDULE_STATUSES.ACTIVE : { $ne: RECURRING_SCHEDULE_STATUSES.ACTIVE };
  }
  if (request.query.assignmentType !== undefined) {
    const assignmentType = String(request.query.assignmentType).toUpperCase();
    if (!Object.values(ASSIGNMENT_TYPES).includes(assignmentType)) throw new ApiError(400, 'Invalid assignment type');
    filter.assignmentType = assignmentType;
  }
  const schedules = await RecurringSchedule.find(filter)
    .sort({ nextOccurrenceAt: 1, createdAt: -1 })
    .populate('driverId', 'firstName lastName email role status')
    .populate('createdBy', 'firstName lastName email role status')
    .populate('routeId', 'name version status');
  response.json({ success: true, data: { schedules: schedules.map(serialize) } });
}

export async function getRecurringSchedule(request, response) {
  const schedule = await RecurringSchedule.findById(parseObjectId(request.params.id, 'recurring schedule id'))
    .populate('driverId', 'firstName lastName email role status')
    .populate('createdBy', 'firstName lastName email role status')
    .populate('routeId', 'name version status');
  if (!schedule) throw new ApiError(404, 'Recurring schedule not found');
  response.json({ success: true, data: { schedule: serialize(schedule) } });
}

export async function updateRecurringSchedule(request, response) {
  rejectUnknownFields(request.body, recurringScheduleUpdateFields, 'recurring schedule');
  const schedule = await RecurringSchedule.findById(parseObjectId(request.params.id, 'recurring schedule id'));
  if (!schedule) throw new ApiError(404, 'Recurring schedule not found');
  if (schedule.status === RECURRING_SCHEDULE_STATUSES.ENDED && request.body.status !== RECURRING_SCHEDULE_STATUSES.ENDED) {
    throw new ApiError(409, 'Ended recurring schedules cannot be reactivated');
  }
  const actorId = request.user.userId;
  const actor = await User.findById(actorId);
  assertOperatorRole(actor, 'updatedBy');
  const merged = { ...toRawSchedule(schedule), ...request.body, createdBy: schedule.createdBy };
  const document = parseRecurringPayload(merged, { update: true });
  await validateReferences(document);
  Object.assign(schedule, document);
  if (schedule.status === RECURRING_SCHEDULE_STATUSES.ENDED) {
    schedule.nextOccurrenceAt = undefined;
  } else if (schedule.status === RECURRING_SCHEDULE_STATUSES.ACTIVE) {
    schedule.nextOccurrenceAt = calculateNextOccurrence(schedule, new Date());
  }
  await schedule.save();
  await recordAudit({ actorId, action: schedule.status === RECURRING_SCHEDULE_STATUSES.ENDED ? 'RECURRING_SCHEDULE_DEACTIVATED' : 'RECURRING_SCHEDULE_UPDATED', entityType: AUDIT_ENTITY_TYPES.RECURRING_SCHEDULE, entityId: schedule._id, metadata: { scheduleId: schedule._id }, request });
  response.json({ success: true, data: { schedule: serialize(schedule) } });
}

export async function deleteRecurringSchedule(request, response) {
  rejectUnknownFields(request.body ?? {}, new Set(['actorId']), 'recurring schedule deactivation');
  const schedule = await RecurringSchedule.findById(parseObjectId(request.params.id, 'recurring schedule id'));
  if (!schedule) throw new ApiError(404, 'Recurring schedule not found');
  const actorId = request.user.userId;
  const actor = await User.findById(actorId);
  assertOperatorRole(actor, 'actor');
  if (schedule.status !== RECURRING_SCHEDULE_STATUSES.ENDED) {
    schedule.status = RECURRING_SCHEDULE_STATUSES.ENDED;
    schedule.nextOccurrenceAt = undefined;
    await schedule.save();
    await recordAudit({ actorId, action: 'RECURRING_SCHEDULE_DEACTIVATED', entityType: AUDIT_ENTITY_TYPES.RECURRING_SCHEDULE, entityId: schedule._id, metadata: { scheduleId: schedule._id }, request });
  }
  response.json({ success: true, data: { schedule: serialize(schedule) } });
}

function serializeGeneration(results) {
  return results.map((result) => ({
    scheduleId: result.scheduleId,
    assignments: result.assignments.map((item) => ({ assignment: serialize(item.assignment), created: item.created, occurrenceAt: item.occurrenceAt })),
  }));
}

export async function generateRecurringAssignments(request, response) {
  const results = await generateDueAssignments();
  response.json({ success: true, data: { schedules: serializeGeneration(results) } });
}

export async function generateRecurringScheduleAssignments(request, response) {
  const scheduleId = parseObjectId(request.params.id, 'recurring schedule id');
  const results = await generateDueAssignments({ scheduleId });
  response.json({ success: true, data: { schedules: serializeGeneration(results) } });
}
