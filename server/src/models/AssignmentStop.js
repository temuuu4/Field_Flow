import mongoose from 'mongoose';
import { ASSIGNMENT_STOP_STATUSES } from './constants.js';
import { objectId, pointSchema } from './common.js';

const assignmentStopSchema = new mongoose.Schema(
  {
    assignmentId: objectId('Assignment', { required: true }),
    routeId: objectId('Route', { required: true }),
    sourceRouteStopId: objectId('RouteStop', { required: true }),
    name: { type: String, required: true, trim: true, maxlength: 160 },
    location: { type: pointSchema, required: true },
    address: { type: String, trim: true, maxlength: 500 },
    sequence: { type: Number, required: true, min: 1, validate: Number.isInteger },
    status: { type: String, required: true, enum: Object.values(ASSIGNMENT_STOP_STATUSES), default: ASSIGNMENT_STOP_STATUSES.PENDING },
    startedAt: { type: Date },
    // These timestamps provide the driver workflow substates without adding
    // competing stop-status vocabularies. A stop remains IN_PROGRESS until it
    // is completed, while these fields record arrival and sample milestones.
    arrivedAt: { type: Date },
    sampleCapturedAt: { type: Date },
    sampleSubmittedAt: { type: Date },
    activeSampleId: objectId('Sample'),
    completedAt: { type: Date },
    skippedAt: { type: Date },
    skipReason: { type: String, trim: true, maxlength: 500 },
  },
  { timestamps: true },
);

assignmentStopSchema.pre('validate', function validateStop(next) {
  if (this.status === ASSIGNMENT_STOP_STATUSES.SKIPPED && !this.skipReason) {
    this.invalidate('skipReason', 'Skipped stops require a reason');
  }
  if (this.status !== ASSIGNMENT_STOP_STATUSES.SKIPPED && this.skipReason) {
    this.invalidate('skipReason', 'Only skipped stops may have a skip reason');
  }
  next();
});

assignmentStopSchema.index({ assignmentId: 1, sequence: 1 }, { unique: true });
assignmentStopSchema.index({ assignmentId: 1, status: 1 });
assignmentStopSchema.index(
  { assignmentId: 1 },
  { unique: true, partialFilterExpression: { status: ASSIGNMENT_STOP_STATUSES.IN_PROGRESS } },
);
assignmentStopSchema.index({ location: '2dsphere' });

export const AssignmentStop = mongoose.model('AssignmentStop', assignmentStopSchema);
