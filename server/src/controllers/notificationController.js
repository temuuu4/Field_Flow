import { Notification } from '../models/Notification.js';
import { NOTIFICATION_TYPES } from '../models/constants.js';
import { ApiError } from '../errors/ApiError.js';
import { assertRole, OPERATOR_ROLES, DRIVER_OR_OPERATOR_ROLES } from '../middleware/authorization.js';
import { parseEnum, parseObjectId, rejectUnknownFields } from '../utils/operationValidation.js';

const serialize = (document) => {
  const serialized = document?.toObject ? document.toObject({ virtuals: true }) : document;
  if (serialized) delete serialized.__v;
  return serialized;
};

// Staff roles can read/mark notifications for any user. Drivers can only
// read/mark their own.
const NOTIFICATION_STAFF_ROLES = OPERATOR_ROLES;

function parsePagination(query) {
  const limit = query.limit === undefined ? 50 : Number(query.limit);
  const page = query.page === undefined ? 1 : Number(query.page);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new ApiError(400, 'limit must be an integer from 1 to 100');
  if (!Number.isInteger(page) || page < 1) throw new ApiError(400, 'page must be a positive integer');
  return { limit, skip: (page - 1) * limit, page };
}

async function getNotificationOrFail(notificationId, recipientId) {
  const notification = await Notification.findOne({ _id: notificationId, recipientId })
    .populate('assignmentId', 'assignmentType title status scheduledStartAt')
    .populate('journeyId', 'status startedAt endedAt')
    .populate('sampleId', 'sampleNumber barcodeValue status');
  if (!notification) throw new ApiError(404, 'Notification not found');
  return notification;
}

export async function getNotifications(request, response) {
  const caller = request.user;
  assertRole(caller, [...DRIVER_OR_OPERATOR_ROLES]);
  const isStaff = NOTIFICATION_STAFF_ROLES.includes(caller.role);
  let recipientId = caller.userId;
  if (isStaff && request.query.recipientId !== undefined) {
    recipientId = parseObjectId(request.query.recipientId, 'recipientId');
  }
  const filter = { recipientId };
  const unreadOnly = request.query.unreadOnly === undefined
    ? undefined
    : (() => {
      const value = String(request.query.unreadOnly).toLowerCase();
      if (!['true', 'false'].includes(value)) throw new ApiError(400, 'unreadOnly must be true or false');
      return value === 'true';
    })();
  if (unreadOnly) filter.readAt = null;
  if (request.query.type !== undefined) filter.type = parseEnum(request.query.type, 'type', Object.values(NOTIFICATION_TYPES), { required: true });
  const { limit, skip, page } = parsePagination(request.query);
  const [notifications, total] = await Promise.all([
    Notification.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit)
      .populate('assignmentId', 'assignmentType title status scheduledStartAt')
      .populate('journeyId', 'status startedAt endedAt')
      .populate('sampleId', 'sampleNumber barcodeValue status'),
    Notification.countDocuments(filter),
  ]);
  response.json({ success: true, data: { notifications: notifications.map(serialize), pagination: { page, limit, total } } });
}

export async function getNotification(request, response) {
  const caller = request.user;
  assertRole(caller, [...DRIVER_OR_OPERATOR_ROLES]);
  const isStaff = NOTIFICATION_STAFF_ROLES.includes(caller.role);
  const notificationId = parseObjectId(request.params.id, 'notification id');
  // For non-staff callers, force the recipientId to be the caller. For
  // staff callers, allow an explicit `recipientId` query param so they
  // can look up a specific user's notifications.
  const recipientId = isStaff && request.query.recipientId !== undefined
    ? parseObjectId(request.query.recipientId, 'recipientId')
    : caller.userId;
  response.json({ success: true, data: { notification: serialize(await getNotificationOrFail(notificationId, recipientId)) } });
}

export async function markNotificationRead(request, response) {
  const caller = request.user;
  assertRole(caller, [...DRIVER_OR_OPERATOR_ROLES]);
  const isStaff = NOTIFICATION_STAFF_ROLES.includes(caller.role);
  rejectUnknownFields(request.body, new Set(['recipientId']), 'notification read request');
  const notificationId = parseObjectId(request.params.id, 'notification id');
  const recipientId = isStaff && request.body.recipientId !== undefined
    ? parseObjectId(request.body.recipientId, 'recipientId')
    : caller.userId;
  await getNotificationOrFail(notificationId, recipientId);
  const notification = await Notification.findOneAndUpdate(
    { _id: notificationId, recipientId },
    { $set: { readAt: new Date() } },
    { new: true, runValidators: true },
  );
  response.json({ success: true, data: { notification: serialize(notification) } });
}

export async function markAllNotificationsRead(request, response) {
  const caller = request.user;
  assertRole(caller, [...DRIVER_OR_OPERATOR_ROLES]);
  const isStaff = NOTIFICATION_STAFF_ROLES.includes(caller.role);
  rejectUnknownFields(request.body, new Set(['recipientId']), 'notifications read request');
  const recipientId = isStaff && request.body.recipientId !== undefined
    ? parseObjectId(request.body.recipientId, 'recipientId')
    : caller.userId;
  const result = await Notification.updateMany({ recipientId, readAt: null }, { $set: { readAt: new Date() } });
  response.json({ success: true, data: { modifiedCount: result.modifiedCount } });
}