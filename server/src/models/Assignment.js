import mongoose from 'mongoose';
import { ASSIGNMENT_STATUSES, ASSIGNMENT_TYPES } from './constants.js';
import { objectId, pointSchema } from './common.js';

const assignmentSchema = new mongoose.Schema(
  {
    assignmentType: { type: String, required: true, enum: Object.values(ASSIGNMENT_TYPES) },
    driverId: objectId('User', { required: true }),
    createdBy: objectId('User', { required: true }),
    title: { type: String, trim: true, maxlength: 200 },
    description: { type: String, trim: true, maxlength: 2000 },
    routeId: objectId('Route'),
    recurringScheduleId: objectId('RecurringSchedule'),
    targetLocation: { type: pointSchema },
    targetAddress: { type: String, trim: true, maxlength: 500 },
    sampleType: { type: String, trim: true, maxlength: 120 },
    scheduledStartAt: { type: Date, required: true },
    scheduledEndAt: { type: Date },
    status: { type: String, required: true, enum: Object.values(ASSIGNMENT_STATUSES), default: ASSIGNMENT_STATUSES.ASSIGNED },
    occurrenceKey: { type: String, trim: true, maxlength: 100 },
    routeVersion: { type: Number, min: 1 },
    assignedAt: { type: Date },
    completedAt: { type: Date },
    cancelledAt: { type: Date },
    declinedAt: { type: Date },
    declineReason: { type: String, trim: true, maxlength: 1000 },
  },
  { timestamps: true },
);

assignmentSchema.pre('validate', function validateAssignment(next) {
  const isSpecificLocation = this.assignmentType === ASSIGNMENT_TYPES.SPECIFIC_LOCATION;
  const isLandmarkRoute = this.assignmentType === ASSIGNMENT_TYPES.LANDMARK_ROUTE;

  if (isSpecificLocation && (!this.targetLocation || this.routeId)) {
    this.invalidate('targetLocation', 'Specific-location assignments require a target location and cannot reference a route');
  }

  if (isLandmarkRoute && (!this.routeId || this.targetLocation || this.sampleType)) {
    this.invalidate('routeId', 'Landmark-route assignments require a route and cannot use a specific target location or assignment-level sample type');
  }

  if (this.scheduledEndAt && this.scheduledEndAt < this.scheduledStartAt) {
    this.invalidate('scheduledEndAt', 'The scheduled end must be after the scheduled start');
  }

  if (this.recurringScheduleId && !this.occurrenceKey) {
    this.invalidate('occurrenceKey', 'Generated recurring assignments require an occurrence key');
  }

  if (!this.recurringScheduleId && this.occurrenceKey) {
    this.invalidate('recurringScheduleId', 'An occurrence key requires a recurring schedule reference');
  }

  if (!isSpecificLocation && !isLandmarkRoute) {
    this.invalidate('assignmentType', 'Unsupported assignment type');
  }

  next();
});

assignmentSchema.index({ driverId: 1, status: 1, scheduledStartAt: 1 });
assignmentSchema.index({ createdBy: 1, status: 1, scheduledStartAt: 1 });
assignmentSchema.index({ status: 1, scheduledStartAt: 1 });
assignmentSchema.index({ assignmentType: 1, status: 1, scheduledStartAt: 1 });
assignmentSchema.index({ routeId: 1 });
assignmentSchema.index(
  { recurringScheduleId: 1, occurrenceKey: 1 },
  {
    unique: true,
    partialFilterExpression: {
      recurringScheduleId: { $exists: true },
      occurrenceKey: { $exists: true },
    },
  },
);

export const Assignment = mongoose.model('Assignment', assignmentSchema);
