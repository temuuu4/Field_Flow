import { Assignment } from '../models/Assignment.js';
import { Journey } from '../models/Journey.js';
import { Notification } from '../models/Notification.js';
import { Sample } from '../models/Sample.js';
import { User } from '../models/User.js';
import { ApiError } from '../errors/ApiError.js';
import { isPushConfigured, sendPushToUser } from './pushService.js';

const relatedModels = { assignmentId: Assignment, journeyId: Journey, sampleId: Sample };

function destinationFor(recipientRole, type) {
  const isDriver = recipientRole === 'DRIVER';
  if (['SAMPLE_SUBMITTED', 'SAMPLE_APPROVED', 'SAMPLE_REJECTED'].includes(type)) return '/#/samples';
  if (['JOURNEY_STARTED', 'JOURNEY_COMPLETED'].includes(type)) return isDriver ? '/#/work' : '/#/map';
  if (type === 'RECURRING_ASSIGNMENT_GENERATED') return isDriver ? '/#/work' : '/#/schedules';
  if (type.startsWith('ASSIGNMENT_')) return isDriver ? '/#/work' : '/#/assignments';
  return '/#/notifications';
}

export async function createNotification(payload) {
  const { recipientId, type, message, assignmentId, journeyId, sampleId, metadata } = payload;
  const recipient = await User.findById(recipientId).select('_id');
  if (!recipient) throw new ApiError(404, 'Notification recipient not found');
  for (const [field, Model] of Object.entries(relatedModels)) {
    if (payload[field] !== undefined && !(await Model.exists({ _id: payload[field] }))) {
      throw new ApiError(404, `Notification ${field.replace('Id', '')} not found`);
    }
  }
  return Notification.create({
    recipientId, type, message, assignmentId, journeyId, sampleId,
    metadata: { ...(metadata ?? {}), clickUrl: destinationFor(recipient.role, type) },
  });
}

export async function safeCreateNotification(payload) {
  try {
    const notification = await createNotification(payload);
    if (notification && isPushConfigured()) {
      try {
        await sendPushToUser(notification.recipientId, notification);
      } catch (pushError) {
        if (process.env.NODE_ENV !== 'production') {
          console.error('Push delivery failed:', pushError);
        }
      }
    }
    return notification;
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') console.error(error);
    return null;
  }
}
