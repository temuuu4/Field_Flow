import { pushSubscriptionsApi } from '../api/fieldflow.js';

export async function getPushState() {
  if (typeof window === 'undefined') {
    return { supported: false, permission: 'unsupported', reason: 'no-window' };
  }
  const hasNotification = 'Notification' in window;
  const hasServiceWorker = 'serviceWorker' in navigator;
  const hasPushManager = 'PushManager' in navigator;
  const isSecure = window.isSecureContext;

  let supported = false;
  let reason = '';

  if (!isSecure) {
    reason = 'Push notifications require a secure context (HTTPS or localhost).';
  } else if (!hasNotification) {
    reason = 'This browser does not support the Notification API.';
  } else if (!hasServiceWorker) {
    reason = 'This browser does not support Service Workers.';
  } else if (!hasPushManager) {
    reason = 'This browser does not support the Push API.';
  } else {
    supported = true;
  }

  return {
    supported,
    permission: hasNotification ? Notification.permission : 'unsupported',
    reason,
    capabilities: {
      notification: hasNotification,
      serviceWorker: hasServiceWorker,
      pushManager: hasPushManager,
      secureContext: isSecure,
    },
  };
}

function urlBase64ToUint8Array(base64String) {
  const cleaned = String(base64String || '').replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/');
  const padded = cleaned + '='.repeat((4 - cleaned.length % 4) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export async function registerServiceWorker() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return null;
  const registration = await navigator.serviceWorker.register('/sw.js');
  await navigator.serviceWorker.ready;
  return registration;
}

export async function getVapidPublicKey() {
  try {
    const data = await pushSubscriptionsApi.vapidPublicKey();
    return data?.publicKey || '';
  } catch {
    return '';
  }
}

export async function enablePushNotifications() {
  if (typeof window === 'undefined') {
    throw new Error('Push notifications are not supported in this environment.');
  }

  const hasServiceWorker = 'serviceWorker' in navigator;
  const hasPushManager = 'PushManager' in navigator;
  const hasNotification = 'Notification' in window;

  if (!hasNotification) {
    throw new Error('This browser does not support the Notification API.');
  }
  if (!hasServiceWorker) {
    throw new Error('This browser does not support Service Workers, which are required for push notifications.');
  }
  if (!hasPushManager) {
    throw new Error('This browser does not support the Push API.');
  }
  if (!window.isSecureContext) {
    throw new Error('Push notifications require a secure context (HTTPS or localhost).');
  }

  const registration = await registerServiceWorker();

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error('Notification permission was denied. Enable notifications in your browser settings.');
  }

  const vapidKey = await getVapidPublicKey();
  if (!vapidKey) {
    throw new Error('Push notifications are not configured on the server. VAPID keys are missing.');
  }

  const applicationServerKey = urlBase64ToUint8Array(vapidKey);

  let subscription;
  try {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey,
    });
  } catch (error) {
    if (error.name === 'NotAllowedError') {
      throw new Error('Push subscription was blocked by the browser or permission settings.');
    }
    throw new Error(`Failed to subscribe to push notifications: ${error.message}`);
  }

  const subJson = subscription.toJSON();
  if (!subJson.endpoint || !subJson.keys?.p256dh || !subJson.keys?.auth) {
    throw new Error('Push subscription did not return valid endpoint or keys.');
  }

  // The backend derives the owning user from the authenticated session,
  // so no userId is sent.
  await pushSubscriptionsApi.create({
    provider: 'WEB_PUSH',
    endpoint: subJson.endpoint,
    p256dh: subJson.keys.p256dh,
    auth: subJson.keys.auth,
    platform: navigator.platform,
    deviceName: getDeviceName(),
  });

  return subscription;
}

export async function disablePushNotifications() {
  let registration;
  try {
    registration = await navigator.serviceWorker.getRegistration('/sw.js');
  } catch {
    registration = null;
  }

  // Capture the endpoint before unsubscribing. Subscriptions are
  // deliberately endpoint-scoped: falling back to an arbitrary server
  // record could disable a different device owned by the same user.
  const subscription = registration ? await registration.pushManager.getSubscription() : null;
  const endpoint = subscription?.endpoint;
  if (subscription) await subscription.unsubscribe();
  if (!endpoint) return;

  const subscriptions = await pushSubscriptionsApi.list();
  const currentDevice = subscriptions.find((item) => item.endpoint === endpoint);
  if (currentDevice) await pushSubscriptionsApi.remove(currentDevice.id);
}

function getDeviceName() {
  const ua = navigator.userAgent;
  if (ua.includes('Chrome') && ua.includes('Mobile')) return 'Mobile Chrome';
  if (ua.includes('Safari') && ua.includes('Mobile')) return 'Mobile Safari';
  if (ua.includes('Chrome')) return 'Desktop Chrome';
  if (ua.includes('Firefox')) return 'Desktop Firefox';
  if (ua.includes('Safari')) return 'Desktop Safari';
  if (ua.includes('Edg')) return 'Desktop Edge';
  return 'Browser';
}
