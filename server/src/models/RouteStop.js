import mongoose from 'mongoose';
import { ROUTE_STOP_STATUSES } from './constants.js';
import { objectId, pointSchema } from './common.js';

const routeStopSchema = new mongoose.Schema(
  {
    routeId: objectId('Route', { required: true }),
    name: { type: String, required: true, trim: true, maxlength: 160 },
    description: { type: String, trim: true, maxlength: 1000 },
    location: { type: pointSchema, required: true },
    address: { type: String, trim: true, maxlength: 500 },
    sequence: { type: Number, required: true, min: 1, validate: Number.isInteger },
    sampleType: { type: String, trim: true, maxlength: 120 },
    status: { type: String, enum: Object.values(ROUTE_STOP_STATUSES), default: ROUTE_STOP_STATUSES.ACTIVE },
  },
  { timestamps: true },
);

routeStopSchema.index({ routeId: 1, sequence: 1 }, { unique: true });
routeStopSchema.index({ routeId: 1, status: 1 });
routeStopSchema.index({ location: '2dsphere' });

export const RouteStop = mongoose.model('RouteStop', routeStopSchema);
