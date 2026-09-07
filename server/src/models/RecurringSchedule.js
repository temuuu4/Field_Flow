import mongoose from 'mongoose';
import { ASSIGNMENT_TYPES, RECURRING_SCHEDULE_STATUSES } from './constants.js';
import { objectId, pointSchema } from './common.js';

const recurringScheduleSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 160 },
    description: { type: String, trim: true, maxlength: 2000 },
    createdBy: objectId('User', { required: true }),
    driverId: objectId('User', { required: true }),
    assignmentType: { type: String, required: true, enum: Object.values(ASSIGNMENT_TYPES) },
    routeId: objectId('Route'),
    targetLocation: { type: pointSchema },
    targetAddress: { type: String, trim: true, maxlength: 500 },
    sampleType: { type: String, trim: true, maxlength: 120 },
    frequency: { type: String, required: true, enum: ['DAILY', 'WEEKLY', 'MONTHLY'], default: 'WEEKLY' },
    daysOfWeek: {
      type: [Number],
      required: true,
      default: [],
      validate: { validator: (days) => Array.isArray(days) && new Set(days).size === days.length && days.every((day) => Number.isInteger(day) && day >= 0 && day <= 6), message: 'daysOfWeek values must be unique integers from 0 to 6' },
    },
    dayOfMonth: { type: Number, min: 1, max: 31, validate: Number.isInteger },
    timeOfDay: { type: String, required: true, match: /^(?:[01]\d|2[0-3]):[0-5]\d$/ },
    timezone: { type: String, required: true, trim: true, maxlength: 80 },
    startDate: { type: Date, required: true },
    endDate: { type: Date },
    status: { type: String, required: true, enum: Object.values(RECURRING_SCHEDULE_STATUSES), default: RECURRING_SCHEDULE_STATUSES.ACTIVE },
    nextOccurrenceAt: { type: Date },
    lastGeneratedAt: { type: Date },
  },
  { timestamps: true },
);

recurringScheduleSchema.pre('validate', function validateSchedule(next) {
  const isSpecificLocation = this.assignmentType === ASSIGNMENT_TYPES.SPECIFIC_LOCATION;
  const isLandmarkRoute = this.assignmentType === ASSIGNMENT_TYPES.LANDMARK_ROUTE;

  if (isSpecificLocation && (!this.targetLocation || !this.sampleType || this.routeId)) {
    this.invalidate('targetLocation', 'Specific-location schedules require a target location and sample type, and cannot reference a route');
  }
  if (isLandmarkRoute && (!this.routeId || this.targetLocation || this.sampleType)) {
    this.invalidate('routeId', 'Landmark-route schedules require a route and cannot use a specific target location or schedule-level sample type');
  }
  if (this.endDate && this.endDate < this.startDate) {
    this.invalidate('endDate', 'The schedule end date must be after the start date');
  }
  const daysOfWeek = this.daysOfWeek ?? [];
  if (this.frequency === 'WEEKLY' && daysOfWeek.length === 0) {
    this.invalidate('daysOfWeek', 'Weekly schedules require at least one day of the week');
  }
  if (this.frequency !== 'WEEKLY' && daysOfWeek.length > 0) {
    this.invalidate('daysOfWeek', 'Only weekly schedules may specify days of the week');
  }
  if (this.frequency === 'MONTHLY' && this.dayOfMonth === undefined) {
    this.invalidate('dayOfMonth', 'Monthly schedules require a day of the month');
  }
  if (this.frequency !== 'MONTHLY' && this.dayOfMonth !== undefined) {
    this.invalidate('dayOfMonth', 'Only monthly schedules may specify a day of the month');
  }
  next();
});

recurringScheduleSchema.index({ status: 1, nextOccurrenceAt: 1 });
recurringScheduleSchema.index({ driverId: 1, status: 1 });

export const RecurringSchedule = mongoose.model('RecurringSchedule', recurringScheduleSchema);
