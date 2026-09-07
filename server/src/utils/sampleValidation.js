import { SAMPLE_STATUSES } from '../models/constants.js';
import { ApiError } from '../errors/ApiError.js';
import { parseDate, parseEnum, parseObjectId, parseNumber, parseOptionalString, parseRequiredString, rejectUnknownFields } from './operationValidation.js';

export const sampleCreateFields = new Set([
  'barcodeValue', 'sampleType', 'driverId', 'assignmentId', 'journeyId', 'routeId',
  'assignmentStopId', 'latitude', 'longitude', 'accuracy', 'collectedAt',
]);

export const sampleUpdateFields = new Set([
  'driverId', 'barcodeValue', 'sampleType', 'latitude', 'longitude', 'accuracy', 'collectedAt',
]);

export const sampleSubmitFields = new Set(['driverId']);
export const sampleReviewFields = new Set(['reviewedBy']);
export const sampleRejectFields = new Set(['reviewedBy', 'rejectionReason']);
export const sampleDeleteFields = new Set(['driverId', 'reason']);

export function parseSampleFilters(query) {
  const filter = { deletedAt: { $exists: false } };
  for (const field of ['driverId', 'assignmentId', 'journeyId', 'routeId', 'assignmentStopId']) {
    if (query[field] !== undefined) filter[field] = parseObjectId(query[field], field);
  }
  if (query.status !== undefined) {
    filter.status = parseEnum(query.status, 'status', Object.values(SAMPLE_STATUSES), { required: true });
  }
  return filter;
}

export function parseSampleLocation(payload, { required = true } = {}) {
  const latitude = parseNumber(payload.latitude, 'latitude', { required, min: -90, max: 90 });
  const longitude = parseNumber(payload.longitude, 'longitude', { required, min: -180, max: 180 });
  if (latitude === undefined && longitude === undefined) return undefined;
  if (latitude === undefined || longitude === undefined) {
    throw new ApiError(400, 'latitude and longitude must be provided together');
  }
  return { type: 'Point', coordinates: [longitude, latitude] };
}

export function parseSampleCreatePayload(payload) {
  rejectUnknownFields(payload, sampleCreateFields, 'sample');
  return {
    barcodeValue: parseRequiredString(payload.barcodeValue, 'barcodeValue', 250),
    sampleType: parseOptionalString(payload.sampleType, 'sampleType', 120),
    driverId: parseObjectId(payload.driverId, 'driverId'),
    assignmentId: parseObjectId(payload.assignmentId, 'assignmentId'),
    journeyId: payload.journeyId === undefined ? undefined : parseObjectId(payload.journeyId, 'journeyId'),
    routeId: payload.routeId === undefined ? undefined : parseObjectId(payload.routeId, 'routeId'),
    assignmentStopId: payload.assignmentStopId === undefined ? undefined : parseObjectId(payload.assignmentStopId, 'assignmentStopId'),
    collectionLocation: parseSampleLocation(payload, { required: true }),
    gpsAccuracy: parseNumber(payload.accuracy, 'accuracy', { required: true, min: 0 }),
    collectedAt: parseDate(payload.collectedAt, 'collectedAt', { defaultValue: new Date() }),
  };
}

export function parseSampleUpdatePayload(payload) {
  rejectUnknownFields(payload, sampleUpdateFields, 'sample update');
  const update = {};
  if (payload.driverId !== undefined) update.driverId = parseObjectId(payload.driverId, 'driverId');
  if (payload.barcodeValue !== undefined) update.barcodeValue = parseRequiredString(payload.barcodeValue, 'barcodeValue', 250);
  if (payload.sampleType !== undefined) update.sampleType = parseRequiredString(payload.sampleType, 'sampleType', 120);
  if (payload.latitude !== undefined || payload.longitude !== undefined) {
    update.collectionLocation = parseSampleLocation(payload, { required: true });
  }
  if (payload.accuracy !== undefined) update.gpsAccuracy = parseNumber(payload.accuracy, 'accuracy', { required: true, min: 0 });
  if (payload.collectedAt !== undefined) update.collectedAt = parseDate(payload.collectedAt, 'collectedAt', { required: true });
  return update;
}
