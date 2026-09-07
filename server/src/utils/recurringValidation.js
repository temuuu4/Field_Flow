import { RECURRING_SCHEDULE_STATUSES, ASSIGNMENT_TYPES } from '../models/constants.js';
import { ApiError } from '../errors/ApiError.js';
import { parseDate, parseEnum, parseLocation, parseObjectId, parseOptionalString, parseRequiredString, rejectUnknownFields } from './operationValidation.js';

export const recurringScheduleFields = new Set([
  'name', 'description', 'createdBy', 'driverId', 'assignmentType', 'routeId', 'targetLocation',
  'sampleType', 'frequency', 'daysOfWeek', 'dayOfMonth', 'timeOfDay', 'timezone', 'startDate', 'endDate', 'status',
]);

export const recurringScheduleUpdateFields = new Set([
  ...recurringScheduleFields,
  'updatedBy',
]);

export function parseTimeOfDay(value) {
  if (typeof value !== 'string' || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value.trim())) {
    throw new ApiError(400, 'timeOfDay must use HH:mm format');
  }
  return value.trim();
}

export function parseTimezone(value) {
  const timezone = parseRequiredString(value, 'timezone', 80);
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format();
  } catch {
    throw new ApiError(400, 'timezone must be a valid IANA timezone');
  }
  return timezone;
}

export function parseDaysOfWeek(value, frequency) {
  if (value === undefined) {
    if (frequency === 'WEEKLY') throw new ApiError(400, 'daysOfWeek is required for weekly schedules');
    return [];
  }
  if (!Array.isArray(value) || value.length === 0 && frequency === 'WEEKLY') {
    throw new ApiError(400, 'daysOfWeek must be a non-empty array for weekly schedules');
  }
  if (new Set(value).size !== value.length || value.some((day) => !Number.isInteger(day) || day < 0 || day > 6)) {
    throw new ApiError(400, 'daysOfWeek must contain unique integers from 0 to 6');
  }
  return [...value].sort((first, second) => first - second);
}

export function parseRecurringPayload(payload, { update = false } = {}) {
  rejectUnknownFields(payload, update ? recurringScheduleUpdateFields : recurringScheduleFields, 'recurring schedule');
  const assignmentType = parseEnum(payload.assignmentType, 'assignmentType', Object.values(ASSIGNMENT_TYPES), { required: true });
  const frequency = parseEnum(payload.frequency, 'frequency', ['DAILY', 'WEEKLY', 'MONTHLY'], { required: true });
  const document = {
    name: parseRequiredString(payload.name, 'name', 160),
    description: parseOptionalString(payload.description, 'description', 2000),
    createdBy: payload.createdBy === undefined ? undefined : parseObjectId(payload.createdBy, 'createdBy'),
    driverId: parseObjectId(payload.driverId, 'driverId'),
    assignmentType,
    routeId: payload.routeId === undefined ? undefined : parseObjectId(payload.routeId, 'routeId'),
    sampleType: parseOptionalString(payload.sampleType, 'sampleType', 120),
    frequency,
    daysOfWeek: parseDaysOfWeek(payload.daysOfWeek, frequency),
    dayOfMonth: payload.dayOfMonth,
    timeOfDay: parseTimeOfDay(payload.timeOfDay),
    timezone: parseTimezone(payload.timezone),
    startDate: parseDate(payload.startDate, 'startDate', { required: true }),
    endDate: parseDate(payload.endDate, 'endDate'),
    status: parseEnum(payload.status, 'status', Object.values(RECURRING_SCHEDULE_STATUSES)) ?? RECURRING_SCHEDULE_STATUSES.ACTIVE,
  };
  if (document.endDate && document.endDate < document.startDate) {
    throw new ApiError(400, 'endDate must be after startDate');
  }
  if (frequency === 'MONTHLY') {
    if (!Number.isInteger(document.dayOfMonth) || document.dayOfMonth < 1 || document.dayOfMonth > 31) {
      throw new ApiError(400, 'dayOfMonth must be an integer from 1 to 31 for monthly schedules');
    }
  } else if (document.dayOfMonth !== undefined) {
    throw new ApiError(400, 'dayOfMonth is only valid for monthly schedules');
  }
  if (assignmentType === ASSIGNMENT_TYPES.SPECIFIC_LOCATION) {
    const location = parseLocation(payload.targetLocation, 'targetLocation', { required: true });
    document.targetLocation = location.point;
    document.targetAddress = location.address;
    document.sampleType = parseRequiredString(payload.sampleType, 'sampleType', 120);
    if (document.routeId) throw new ApiError(400, 'Specific-location schedules cannot reference a route');
  } else {
    if (payload.targetLocation !== undefined || document.sampleType !== undefined) {
      throw new ApiError(400, 'Landmark-route schedules cannot use targetLocation or schedule-level sampleType');
    }
    if (!document.routeId) throw new ApiError(400, 'Landmark-route schedules require routeId');
  }
  return document;
}
