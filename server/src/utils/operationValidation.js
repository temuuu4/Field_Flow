import mongoose from 'mongoose';
import { ASSIGNMENT_STATUSES, ASSIGNMENT_TYPES, ROUTE_STATUSES, ROUTE_STOP_STATUSES } from '../models/constants.js';
import { ApiError } from '../errors/ApiError.js';

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

export function rejectUnknownFields(payload, allowedFields, label) {
  if (!isObject(payload)) {
    throw new ApiError(400, `${label} must be a JSON object`);
  }
  const unknownFields = Object.keys(payload).filter((field) => !allowedFields.has(field));
  if (unknownFields.length > 0) {
    throw new ApiError(400, `Unexpected ${label} field(s): ${unknownFields.join(', ')}`);
  }
}

export function parseObjectId(value, field) {
  if (!mongoose.isObjectIdOrHexString(value)) {
    throw new ApiError(400, `Invalid ${field}`);
  }
  return value;
}

export function parseRequiredString(value, field, maxLength = 200) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new ApiError(400, `${field} is required`);
  }
  const normalizedValue = value.trim();
  if (normalizedValue.length > maxLength) {
    throw new ApiError(400, `${field} must not exceed ${maxLength} characters`);
  }
  return normalizedValue;
}

export function parseOptionalString(value, field, maxLength = 200) {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== 'string' || !value.trim()) {
    throw new ApiError(400, `${field} must be a non-empty string`);
  }
  const normalizedValue = value.trim();
  if (normalizedValue.length > maxLength) {
    throw new ApiError(400, `${field} must not exceed ${maxLength} characters`);
  }
  return normalizedValue;
}

export function parseDate(value, field, { required = false, defaultValue } = {}) {
  if (value === undefined || value === null || value === '') {
    if (required && defaultValue === undefined) {
      throw new ApiError(400, `${field} is required`);
    }
    return defaultValue;
  }
  const parsedDate = new Date(value);
  if (Number.isNaN(parsedDate.getTime())) {
    throw new ApiError(400, `${field} must be a valid date`);
  }
  return parsedDate;
}

export const parseNumber = (value, field, { required = false, min, max } = {}) => {
  if (value === undefined || value === null || value === '') {
    if (required) {
      throw new ApiError(400, `${field} is required`);
    }
    return undefined;
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new ApiError(400, `${field} must be a valid number`);
  }
  if (min !== undefined && value < min) {
    throw new ApiError(400, `${field} must be at least ${min}`);
  }
  if (max !== undefined && value > max) {
    throw new ApiError(400, `${field} must be at most ${max}`);
  }
  return value;
};

export function parseLocation(value, field = 'location', { required = false } = {}) {
  if (value === undefined || value === null) {
    if (required) {
      throw new ApiError(400, `${field} is required`);
    }
    return undefined;
  }
  rejectUnknownFields(value, new Set(['latitude', 'longitude', 'address']), field);
  const latitude = parseNumber(value.latitude, `${field}.latitude`, { required: true, min: -90, max: 90 });
  const longitude = parseNumber(value.longitude, `${field}.longitude`, { required: true, min: -180, max: 180 });
  const address = parseOptionalString(value.address, `${field}.address`, 500);
  return {
    point: { type: 'Point', coordinates: [longitude, latitude] },
    address,
  };
}

export function parseFlatLocation(value, field = 'location', { required = false } = {}) {
  return parseLocation(
    {
      latitude: value.latitude,
      longitude: value.longitude,
      address: value.address,
    },
    field,
    { required },
  );
}

export function parseGpsPayload(payload, { timestampRequired = false } = {}) {
  rejectUnknownFields(payload, new Set(['latitude', 'longitude', 'accuracy', 'speed', 'heading', 'timestamp']), 'location update');
  const latitude = parseNumber(payload.latitude, 'latitude', { required: true, min: -90, max: 90 });
  const longitude = parseNumber(payload.longitude, 'longitude', { required: true, min: -180, max: 180 });
  const accuracy = parseNumber(payload.accuracy, 'accuracy', { required: timestampRequired, min: 0 });
  const speed = parseNumber(payload.speed, 'speed', { min: 0 });
  const heading = parseNumber(payload.heading, 'heading', { min: 0, max: 360 });
  const recordedAt = parseDate(payload.timestamp, 'timestamp', { required: timestampRequired, defaultValue: new Date() });
  return {
    location: { type: 'Point', coordinates: [longitude, latitude] },
    accuracy,
    speed,
    heading,
    recordedAt,
  };
}

export function parseEnum(value, field, allowedValues, { required = false } = {}) {
  if (value === undefined || value === null || value === '') {
    if (required) {
      throw new ApiError(400, `${field} is required`);
    }
    return undefined;
  }
  if (typeof value !== 'string') {
    throw new ApiError(400, `${field} must be a string`);
  }
  const normalizedValue = value.trim().toUpperCase();
  if (!allowedValues.includes(normalizedValue)) {
    throw new ApiError(400, `${field} must be one of: ${allowedValues.join(', ')}`);
  }
  return normalizedValue;
}

export function parseAssignmentType(value, { required = false } = {}) {
  return parseEnum(value, 'assignmentType', Object.values(ASSIGNMENT_TYPES), { required });
}

export function parseAssignmentStatus(value, { required = false } = {}) {
  return parseEnum(value, 'status', Object.values(ASSIGNMENT_STATUSES), { required });
}

export function parseRouteStatus(value) {
  return parseEnum(value, 'status', Object.values(ROUTE_STATUSES));
}

export function parseRouteStopStatus(value) {
  return parseEnum(value, 'status', Object.values(ROUTE_STOP_STATUSES));
}
