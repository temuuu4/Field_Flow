import mongoose from 'mongoose';
import { SAMPLE_STATUSES } from './constants.js';
import { objectId, pointSchema } from './common.js';

const sampleSchema = new mongoose.Schema(
  {
    sampleNumber: { type: String, required: true, unique: true, trim: true, maxlength: 80 },
    barcodeValue: { type: String, required: true, trim: true, maxlength: 250 },
    sampleType: { type: String, required: true, trim: true, maxlength: 120 },
    driverId: objectId('User', { required: true }),
    assignmentId: objectId('Assignment', { required: true }),
    journeyId: objectId('Journey'),
    routeId: objectId('Route'),
    assignmentStopId: objectId('AssignmentStop'),
    collectionLocation: { type: pointSchema, required: true },
    gpsAccuracy: { type: Number, required: true, min: 0 },
    collectedAt: { type: Date, required: true },
    submittedAt: { type: Date },
    status: { type: String, required: true, enum: Object.values(SAMPLE_STATUSES), default: SAMPLE_STATUSES.PENDING },
    reviewedBy: objectId('User'),
    reviewedAt: { type: Date },
    rejectionReason: { type: String, trim: true, maxlength: 1000 },
    deletedAt: { type: Date },
    deletedBy: objectId('User'),
    deletionReason: { type: String, trim: true, maxlength: 500 },
  },
  { timestamps: true },
);

sampleSchema.pre('validate', function validateSample(next) {
  const isReviewed = [SAMPLE_STATUSES.APPROVED, SAMPLE_STATUSES.REJECTED].includes(this.status);
  const isSubmitted = [SAMPLE_STATUSES.SUBMITTED, SAMPLE_STATUSES.APPROVED, SAMPLE_STATUSES.REJECTED].includes(this.status);

  if (isSubmitted && !this.submittedAt) {
    this.invalidate('submittedAt', 'Submitted samples require a submission timestamp');
  }
  if (isReviewed && (!this.reviewedBy || !this.reviewedAt)) {
    this.invalidate('reviewedBy', 'Reviewed samples require reviewer and review timestamp');
  }
  if (this.status === SAMPLE_STATUSES.REJECTED && !this.rejectionReason) {
    this.invalidate('rejectionReason', 'Rejected samples require a rejection reason');
  }
  if (this.status !== SAMPLE_STATUSES.REJECTED && this.rejectionReason) {
    this.invalidate('rejectionReason', 'Only rejected samples may have a rejection reason');
  }
  if (!isReviewed && (this.reviewedBy || this.reviewedAt)) {
    this.invalidate('reviewedBy', 'Only approved or rejected samples may have review details');
  }
  if (this.deletedAt && !this.deletedBy) {
    this.invalidate('deletedBy', 'Deleted samples require the deleting user');
  }
  if (!this.deletedAt && (this.deletedBy || this.deletionReason)) {
    this.invalidate('deletedBy', 'Deletion details are only allowed for deleted samples');
  }
  next();
});

sampleSchema.index({ status: 1, submittedAt: -1 });
sampleSchema.index({ driverId: 1, collectedAt: -1 });
sampleSchema.index({ assignmentId: 1 });
sampleSchema.index({ barcodeValue: 1 });
sampleSchema.index({ journeyId: 1, collectedAt: -1 });
sampleSchema.index({ reviewedBy: 1, reviewedAt: -1 });
sampleSchema.index(
  { assignmentId: 1, barcodeValue: 1 },
  {
    unique: true,
    partialFilterExpression: { deletedAt: { $exists: false } },
  },
);

export const Sample = mongoose.model('Sample', sampleSchema);
