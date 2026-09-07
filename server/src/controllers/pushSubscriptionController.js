import { PushSubscription } from '../models/PushSubscription.js';
import { PUSH_PROVIDERS } from '../models/constants.js';
import { User } from '../models/User.js';
import { ApiError } from '../errors/ApiError.js';
import { parseDate, parseEnum, parseObjectId, parseOptionalString, rejectUnknownFields } from '../utils/operationValidation.js';

const createFields = new Set(['provider', 'token', 'endpoint', 'p256dh', 'auth', 'deviceName', 'platform', 'deviceId', 'expiresAt']);
const updateFields = new Set(['isActive', 'deviceName', 'platform', 'deviceId', 'expiresAt']);

function serialize(document) {
  const serialized = document?.toObject ? document.toObject() : { ...document };
  delete serialized.__v;
  delete serialized.token;
  delete serialized.endpoint;
  delete serialized.p256dh;
  delete serialized.auth;
  serialized.id = serialized._id;
  return serialized;
}

async function assertUser(userId) {
  const user = await User.findById(userId).select('_id status');
  if (!user) throw new ApiError(404, 'User not found');
  return user;
}

function parseCreatePayload(payload) {
  // `userId` is intentionally NOT parsed from the client — the controller
  // always derives it from the authenticated session (`request.user.userId`).
  rejectUnknownFields(payload, createFields, 'push subscription');
  return {
    provider: parseEnum(payload.provider, 'provider', Object.values(PUSH_PROVIDERS), { required: true }),
    token: parseOptionalString(payload.token, 'token', 4000),
    endpoint: parseOptionalString(payload.endpoint, 'endpoint', 4000),
    p256dh: parseOptionalString(payload.p256dh, 'p256dh', 1000),
    auth: parseOptionalString(payload.auth, 'auth', 1000),
    deviceName: parseOptionalString(payload.deviceName, 'deviceName', 160),
    platform: parseOptionalString(payload.platform, 'platform', 40),
    deviceId: parseOptionalString(payload.deviceId, 'deviceId', 200),
    expiresAt: parseDate(payload.expiresAt, 'expiresAt'),
  };
}

export async function registerPushSubscription(request, response) {
  // Always derive the owning user from the authenticated session. Any
  // client-supplied `userId` is intentionally ignored so that a user
  // cannot register subscriptions for another account.
  const payload = parseCreatePayload(request.body);
  payload.userId = request.user.userId;
  await assertUser(payload.userId);
  const identity = payload.provider === PUSH_PROVIDERS.FCM ? { provider: payload.provider, token: payload.token } : { provider: payload.provider, endpoint: payload.endpoint };
  if (payload.provider === PUSH_PROVIDERS.FCM && !payload.token) throw new ApiError(400, 'FCM subscriptions require token');
  if (payload.provider === PUSH_PROVIDERS.WEB_PUSH && (!payload.endpoint || !payload.p256dh || !payload.auth)) throw new ApiError(400, 'Web Push subscriptions require endpoint, p256dh, and auth');
  let subscription = await PushSubscription.findOne(identity);
  if (subscription && String(subscription.userId) !== String(payload.userId)) throw new ApiError(409, 'This push subscription belongs to another user');
  if (subscription) {
    Object.assign(subscription, payload, { isActive: true, lastUsedAt: new Date() });
    await subscription.save();
  } else {
    subscription = await PushSubscription.create({ ...payload, isActive: true, lastUsedAt: new Date() });
  }
  response.status(201).json({ success: true, data: { subscription: serialize(subscription) } });
}

export async function getPushSubscriptions(request, response) {
  // Derive the user id from the authenticated session, not from a
  // client-supplied query parameter.
  const userId = request.user.userId;
  await assertUser(userId);
  const filter = { userId };
  if (request.query.active !== undefined) {
    if (!['true', 'false'].includes(String(request.query.active).toLowerCase())) throw new ApiError(400, 'active must be true or false');
    filter.isActive = String(request.query.active).toLowerCase() === 'true';
  }
  const subscriptions = await PushSubscription.find(filter).sort({ updatedAt: -1 });
  response.json({ success: true, data: { subscriptions: subscriptions.map(serialize) } });
}

export async function updatePushSubscription(request, response) {
  rejectUnknownFields(request.body, updateFields, 'push subscription update');
  // Always operate on the authenticated user's own subscriptions.
  const userId = request.user.userId;
  await assertUser(userId);
  const subscription = await PushSubscription.findOne({ _id: parseObjectId(request.params.id, 'subscription id'), userId });
  if (!subscription) throw new ApiError(404, 'Push subscription not found');
  if (request.body.isActive !== undefined) {
    if (typeof request.body.isActive !== 'boolean') throw new ApiError(400, 'isActive must be a boolean');
    subscription.isActive = request.body.isActive;
  }
  if (request.body.deviceName !== undefined) subscription.deviceName = parseOptionalString(request.body.deviceName, 'deviceName', 160);
  if (request.body.platform !== undefined) subscription.platform = parseOptionalString(request.body.platform, 'platform', 40);
  if (request.body.deviceId !== undefined) subscription.deviceId = parseOptionalString(request.body.deviceId, 'deviceId', 200);
  if (request.body.expiresAt !== undefined) subscription.expiresAt = parseDate(request.body.expiresAt, 'expiresAt');
  await subscription.save();
  response.json({ success: true, data: { subscription: serialize(subscription) } });
}

export async function deletePushSubscription(request, response) {
  rejectUnknownFields(request.body, new Set([]), 'push subscription deletion');
  // Always operate on the authenticated user's own subscriptions.
  const userId = request.user.userId;
  await assertUser(userId);
  const subscription = await PushSubscription.findOneAndDelete({ _id: parseObjectId(request.params.id, 'subscription id'), userId });
  if (!subscription) throw new ApiError(404, 'Push subscription not found');
  response.json({ success: true, data: { deleted: true } });
}
