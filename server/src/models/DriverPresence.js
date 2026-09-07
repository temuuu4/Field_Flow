import mongoose from 'mongoose';
import { objectId, pointSchema } from './common.js';

const driverPresenceSchema = new mongoose.Schema(
  {
    driverId: objectId('User', { required: true }),
    assignmentId: objectId('Assignment'),
    journeyId: objectId('Journey'),
    location: { type: pointSchema, required: true },
    accuracy: { type: Number, required: true, min: 0 },
    speed: { type: Number, min: 0 },
    heading: { type: Number, min: 0, max: 360 },
    recordedAt: { type: Date, required: true },
    lastSeenAt: { type: Date, required: true },
  },
  { timestamps: true },
);

driverPresenceSchema.index({ driverId: 1 }, { unique: true });
driverPresenceSchema.index({ location: '2dsphere' });
driverPresenceSchema.index({ lastSeenAt: -1 });

export const DriverPresence = mongoose.model('DriverPresence', driverPresenceSchema);
