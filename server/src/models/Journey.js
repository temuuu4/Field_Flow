import mongoose from 'mongoose';
import { JOURNEY_STATUSES } from './constants.js';
import { objectId, pointSchema } from './common.js';

const journeySchema = new mongoose.Schema(
  {
    driverId: objectId('User', { required: true }),
    assignmentId: objectId('Assignment', { required: true }),
    status: { type: String, required: true, enum: Object.values(JOURNEY_STATUSES), default: JOURNEY_STATUSES.NOT_STARTED },
    startedAt: { type: Date },
    startLocation: { type: pointSchema },
    startAccuracy: { type: Number, min: 0 },
    arrivedAt: { type: Date },
    activeSampleId: objectId('Sample'),
    endedAt: { type: Date },
    endLocation: { type: pointSchema },
    endAccuracy: { type: Number, min: 0 },
    cancelledReason: { type: String, trim: true, maxlength: 500 },
  },
  { timestamps: true },
);

journeySchema.pre('validate', function validateJourney(next) {
  const requiresStart = [JOURNEY_STATUSES.IN_PROGRESS, JOURNEY_STATUSES.COMPLETED].includes(this.status);
  const requiresEnd = [JOURNEY_STATUSES.COMPLETED, JOURNEY_STATUSES.CANCELLED].includes(this.status);

  if (requiresStart && (!this.startedAt || !this.startLocation || this.startAccuracy === undefined)) {
    this.invalidate('startedAt', 'Started journeys require start time, location, and GPS accuracy');
  }
  if (requiresEnd && (!this.endedAt || !this.endLocation || this.endAccuracy === undefined)) {
    this.invalidate('endedAt', 'Ended journeys require end time, location, and GPS accuracy');
  }
  if (this.status === JOURNEY_STATUSES.CANCELLED && !this.cancelledReason) {
    this.invalidate('cancelledReason', 'Cancelled journeys require a reason');
  }
  if (this.startedAt && this.endedAt && this.endedAt < this.startedAt) {
    this.invalidate('endedAt', 'The journey end time must be after the start time');
  }
  next();
});

journeySchema.index({ driverId: 1, status: 1 });
journeySchema.index({ assignmentId: 1, startedAt: -1 });
journeySchema.index({ status: 1, startedAt: -1 });
journeySchema.index(
  { assignmentId: 1 },
  { unique: true, partialFilterExpression: { status: JOURNEY_STATUSES.IN_PROGRESS } },
);
journeySchema.index(
  { driverId: 1 },
  { unique: true, partialFilterExpression: { status: JOURNEY_STATUSES.IN_PROGRESS } },
);

export const Journey = mongoose.model('Journey', journeySchema);
