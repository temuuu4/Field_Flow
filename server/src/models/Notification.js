import mongoose from 'mongoose';
import { NOTIFICATION_TYPES } from './constants.js';
import { objectId } from './common.js';

const notificationSchema = new mongoose.Schema(
  {
    recipientId: objectId('User', { required: true }),
    type: {
      type: String,
      required: true,
      enum: Object.values(NOTIFICATION_TYPES),
    },
    assignmentId: objectId('Assignment'),
    journeyId: objectId('Journey'),
    sampleId: objectId('Sample'),
    message: { type: String, required: true, trim: true, maxlength: 1000 },
    metadata: { type: mongoose.Schema.Types.Mixed },
    readAt: { type: Date, default: null },
  },
  { timestamps: true },
);

notificationSchema.index({ recipientId: 1, readAt: 1, createdAt: -1 });
notificationSchema.index({ recipientId: 1, createdAt: -1 });

export const Notification = mongoose.model('Notification', notificationSchema);
