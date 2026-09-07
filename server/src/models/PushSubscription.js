import mongoose from 'mongoose';
import { PUSH_PROVIDERS } from './constants.js';
import { objectId } from './common.js';

const pushSubscriptionSchema = new mongoose.Schema(
  {
    userId: objectId('User', { required: true }),
    provider: { type: String, required: true, enum: Object.values(PUSH_PROVIDERS) },
    token: { type: String, trim: true },
    endpoint: { type: String, trim: true },
    p256dh: { type: String, trim: true },
    auth: { type: String, trim: true },
    platform: { type: String, trim: true, maxlength: 40 },
    deviceId: { type: String, trim: true, maxlength: 200 },
    deviceName: { type: String, trim: true, maxlength: 160 },
    isActive: { type: Boolean, required: true, default: true },
    lastUsedAt: { type: Date },
    expiresAt: { type: Date },
  },
  { timestamps: true },
);

pushSubscriptionSchema.pre('validate', function validateSubscription(next) {
  if (this.provider === PUSH_PROVIDERS.FCM && !this.token) {
    this.invalidate('token', 'FCM subscriptions require a token');
  }
  if (this.provider === PUSH_PROVIDERS.WEB_PUSH && (!this.endpoint || !this.p256dh || !this.auth)) {
    this.invalidate('endpoint', 'Web Push subscriptions require endpoint, p256dh, and auth values');
  }
  next();
});

pushSubscriptionSchema.index(
  { provider: 1, token: 1 },
  { unique: true, partialFilterExpression: { provider: 'FCM', token: { $type: 'string' } } },
);
pushSubscriptionSchema.index(
  { provider: 1, endpoint: 1 },
  { unique: true, partialFilterExpression: { provider: 'WEB_PUSH', endpoint: { $type: 'string' } } },
);
pushSubscriptionSchema.index({ userId: 1, isActive: 1 });

export const PushSubscription = mongoose.model('PushSubscription', pushSubscriptionSchema);
