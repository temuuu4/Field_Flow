import mongoose from 'mongoose';
import { ROUTE_STATUSES } from './constants.js';
import { objectId } from './common.js';

const routeSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 160 },
    description: { type: String, trim: true, maxlength: 2000 },
    createdBy: objectId('User', { required: true }),
    status: { type: String, enum: Object.values(ROUTE_STATUSES), default: ROUTE_STATUSES.ACTIVE },
    version: { type: Number, required: true, min: 1, default: 1 },
  },
  { timestamps: true },
);

routeSchema.index({ createdBy: 1, status: 1 });
routeSchema.index({ name: 1, status: 1 });

export const Route = mongoose.model('Route', routeSchema);
