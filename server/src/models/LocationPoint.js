import mongoose from 'mongoose';
import { environment } from '../config/env.js';
import { LOCATION_EVENT_TYPES } from './constants.js';
import { objectId, pointSchema } from './common.js';

const locationPointSchema = new mongoose.Schema(
  {
    meta: {
      driverId: objectId('User', { required: true }),
      assignmentId: objectId('Assignment', { required: true }),
      journeyId: objectId('Journey', { required: true }),
    },
    location: { type: pointSchema, required: true },
    accuracy: { type: Number, required: true, min: 0 },
    speed: { type: Number, min: 0 },
    heading: { type: Number, min: 0, max: 360 },
    eventType: { type: String, required: true, enum: Object.values(LOCATION_EVENT_TYPES), default: LOCATION_EVENT_TYPES.GPS_UPDATE },
    recordedAt: { type: Date, required: true },
  },
  {
    collection: 'locationPoints',
    timeseries: {
      timeField: 'recordedAt',
      metaField: 'meta',
      granularity: 'seconds',
    },
    expireAfterSeconds: Math.round(environment.locationHistoryRetentionDays * 86400),
  },
);

locationPointSchema.index({ 'meta.driverId': 1, recordedAt: -1 });
locationPointSchema.index({ 'meta.journeyId': 1, recordedAt: 1 });
locationPointSchema.index({ 'meta.assignmentId': 1, recordedAt: 1 });

export const LocationPoint = mongoose.model('LocationPoint', locationPointSchema);
