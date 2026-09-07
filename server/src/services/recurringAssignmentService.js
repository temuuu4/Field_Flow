import mongoose from 'mongoose';
import { Assignment } from '../models/Assignment.js';
import { AssignmentStop } from '../models/AssignmentStop.js';
import { RecurringSchedule } from '../models/RecurringSchedule.js';
import { Route } from '../models/Route.js';
import { RouteStop } from '../models/RouteStop.js';
import { User } from '../models/User.js';
import { ASSIGNMENT_STATUSES, ASSIGNMENT_TYPES, AUDIT_ENTITY_TYPES, RECURRING_SCHEDULE_STATUSES } from '../models/constants.js';
import { ApiError } from '../errors/ApiError.js';
import { recordAudit } from './auditLogService.js';
import { safeCreateNotification } from './notificationService.js';
import { assertOperatorRole, assertUserRole } from './operationRules.js';

function getTimezoneParts(date, timezone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(date);
  return Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, Number(part.value)]));
}

function calendarDateUtc(year, month, day) {
  return new Date(Date.UTC(year, month - 1, day, 12));
}

function zonedDateTimeToUtc(year, month, day, hour, minute, timezone) {
  const targetAsUtc = Date.UTC(year, month - 1, day, hour, minute);
  let guess = new Date(targetAsUtc);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const actual = getTimezoneParts(guess, timezone);
    const actualAsUtc = Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour, actual.minute);
    guess = new Date(guess.getTime() + targetAsUtc - actualAsUtc);
  }
  return guess;
}

function getTimeParts(timeOfDay) {
  const [hour, minute] = timeOfDay.split(':').map(Number);
  return { hour, minute };
}

export function calculateNextOccurrence(schedule, after = new Date()) {
  const { hour, minute } = getTimeParts(schedule.timeOfDay);
  const start = getTimezoneParts(schedule.startDate, schedule.timezone);
  const afterParts = getTimezoneParts(after, schedule.timezone);
  const startCursor = calendarDateUtc(start.year, start.month, start.day);
  const afterCursor = calendarDateUtc(afterParts.year, afterParts.month, afterParts.day);
  const cursor = startCursor > afterCursor ? startCursor : afterCursor;

  for (let offset = 0; offset < 370; offset += 1) {
    const year = cursor.getUTCFullYear();
    const month = cursor.getUTCMonth() + 1;
    const day = cursor.getUTCDate();
    const weekday = cursor.getUTCDay();
    const matches = schedule.frequency === 'DAILY'
      || (schedule.frequency === 'WEEKLY' && schedule.daysOfWeek.includes(weekday))
      || (schedule.frequency === 'MONTHLY' && schedule.dayOfMonth === day);
    if (matches) {
      const occurrence = zonedDateTimeToUtc(year, month, day, hour, minute, schedule.timezone);
      if (occurrence > after && occurrence >= schedule.startDate && (!schedule.endDate || occurrence <= schedule.endDate)) {
        return occurrence;
      }
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return null;
}

async function loadUsableScheduleReferences(schedule) {
  const driver = await User.findById(schedule.driverId);
  assertUserRole(driver, 'DRIVER', 'driver');
  const creator = await User.findById(schedule.createdBy);
  assertOperatorRole(creator, 'creator');
  let route;
  let routeStops;
  if (schedule.assignmentType === ASSIGNMENT_TYPES.LANDMARK_ROUTE) {
    route = await Route.findById(schedule.routeId);
    if (!route) throw new ApiError(404, 'Route not found');
    if (route.status !== 'ACTIVE') throw new ApiError(409, 'Only active routes can generate assignments');
    routeStops = await RouteStop.find({ routeId: route._id, status: 'ACTIVE' }).sort({ sequence: 1 });
    if (routeStops.length === 0) throw new ApiError(409, 'A route assignment requires at least one active route stop');
  }
  return { driver, creator, route, routeStops };
}

async function generateOccurrence(schedule, occurrenceAt) {
  const { route, routeStops } = await loadUsableScheduleReferences(schedule);
  const occurrenceKey = occurrenceAt.toISOString();
  const document = {
    assignmentType: schedule.assignmentType,
    driverId: schedule.driverId,
    createdBy: schedule.createdBy,
    title: schedule.name,
    description: schedule.description,
    scheduledStartAt: occurrenceAt,
    status: ASSIGNMENT_STATUSES.ASSIGNED,
    recurringScheduleId: schedule._id,
    occurrenceKey,
    assignedAt: new Date(),
  };
  if (schedule.assignmentType === ASSIGNMENT_TYPES.SPECIFIC_LOCATION) {
    document.targetLocation = schedule.targetLocation;
    document.targetAddress = schedule.targetAddress;
    document.sampleType = schedule.sampleType;
  } else {
    document.routeId = route._id;
    document.routeVersion = route.version;
  }

  let assignment;
  let created = true;
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const existing = await Assignment.findOne({ recurringScheduleId: schedule._id, occurrenceKey }).session(session);
      if (existing) {
        assignment = existing;
        created = false;
        return;
      }
      [assignment] = await Assignment.create([document], { session });
      if (routeStops) {
        await AssignmentStop.insertMany(routeStops.map((stop) => ({
          assignmentId: assignment._id,
          routeId: route._id,
          sourceRouteStopId: stop._id,
          name: stop.name,
          location: stop.location,
          address: stop.address,
          sequence: stop.sequence,
        })), { session });
      }
    });
  } catch (error) {
    if (error.code !== 11000) throw error;
    assignment = await Assignment.findOne({ recurringScheduleId: schedule._id, occurrenceKey });
    if (!assignment) throw error;
    created = false;
  } finally {
    await session.endSession();
  }

  if (created) {
    await recordAudit({
      actorId: schedule.createdBy,
      action: 'RECURRING_ASSIGNMENT_GENERATED',
      entityType: AUDIT_ENTITY_TYPES.ASSIGNMENT,
      entityId: assignment._id,
      metadata: { recurringScheduleId: schedule._id, occurrenceKey },
    });
    await safeCreateNotification({
      recipientId: schedule.driverId,
      type: 'RECURRING_ASSIGNMENT_GENERATED',
      message: `A recurring assignment is scheduled for ${occurrenceAt.toISOString()}`,
      assignmentId: assignment._id,
      metadata: { recurringScheduleId: schedule._id, occurrenceKey },
    });
  }
  return { assignment, created, occurrenceAt };
}

async function generateForSchedule(schedule, now) {
  let nextOccurrenceAt = schedule.nextOccurrenceAt ?? calculateNextOccurrence(schedule, new Date(schedule.startDate.getTime() - 1));
  if (!nextOccurrenceAt) {
    schedule.status = RECURRING_SCHEDULE_STATUSES.ENDED;
    await schedule.save();
    return [];
  }
  const generated = [];
  let count = 0;
  while (nextOccurrenceAt <= now && count < 100) {
    const result = await generateOccurrence(schedule, nextOccurrenceAt);
    generated.push(result);
    schedule.lastGeneratedAt = nextOccurrenceAt;
    nextOccurrenceAt = calculateNextOccurrence(schedule, nextOccurrenceAt);
    schedule.nextOccurrenceAt = nextOccurrenceAt;
    if (!nextOccurrenceAt) schedule.status = RECURRING_SCHEDULE_STATUSES.ENDED;
    await schedule.save();
    count += 1;
  }
  if (!schedule.nextOccurrenceAt) {
    schedule.status = RECURRING_SCHEDULE_STATUSES.ENDED;
    await schedule.save();
  }
  return generated;
}

export async function generateDueAssignments({ scheduleId, now = new Date() } = {}) {
  let schedules;
  if (scheduleId) {
    schedules = await RecurringSchedule.findById(scheduleId);
    if (!schedules) throw new ApiError(404, 'Recurring schedule not found');
    if (schedules.status !== RECURRING_SCHEDULE_STATUSES.ACTIVE) throw new ApiError(409, 'Only active recurring schedules can generate assignments');
    schedules = [schedules];
  } else {
    schedules = await RecurringSchedule.find({ status: RECURRING_SCHEDULE_STATUSES.ACTIVE }).sort({ nextOccurrenceAt: 1 });
  }
  const results = [];
  for (const schedule of schedules) {
    const generated = await generateForSchedule(schedule, now);
    results.push({ scheduleId: schedule._id, assignments: generated });
  }
  return results;
}
