import webPush from 'web-push';
import { PushSubscription } from '../models/PushSubscription.js';

const vapidSubject = process.env.VAPID_SUBJECT;
const vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;

if (vapidPublicKey && vapidPrivateKey) {
  webPush.setVapidDetails(vapidSubject || 'mailto:admin@example.com', vapidPublicKey, vapidPrivateKey);
}

export function isPushConfigured() {
  return Boolean(vapidPublicKey && vapidPrivateKey);
}

export async function sendPushToUser(userId, notification) {
  if (!isPushConfigured()) return [];

  let subscriptions;
  try {
    subscriptions = await PushSubscription.find({ userId, isActive: true });
  } catch (error) {
    console.error('Failed to fetch push subscriptions:', error);
    return [];
  }

  if (!subscriptions.length) return [];

  const payload = JSON.stringify({
    notificationId: notification._id?.toString(),
    title: notification.message,
    body: notification.message,
    type: notification.type,
    assignmentId: notification.assignmentId?.toString(),
    journeyId: notification.journeyId?.toString(),
    sampleId: notification.sampleId?.toString(),
    // The notification service chooses a recipient-role-specific HashRouter
    // destination. The fragment is required after a cold browser launch.
    url: notification.metadata?.clickUrl || '/#/notifications',
  });

  await Promise.allSettled(
    subscriptions.map(async (sub) => {
      try {
        await webPush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload
        );
        sub.lastUsedAt = new Date();
        await sub.save();
      } catch (error) {
        if (error.statusCode === 410 || error.statusCode === 404) {
          await PushSubscription.findByIdAndDelete(sub._id);
        } else {
          console.error(`Push delivery failed for subscription ${sub._id}:`, error.message);
        }
      }
    })
  );

  return subscriptions;
}
