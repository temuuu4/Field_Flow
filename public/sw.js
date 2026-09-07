self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data?.json() || {};
  } catch {
    payload = { title: 'FieldFlow', body: 'You have a new notification' };
  }

  const title = String(payload.title || payload.body || 'FieldFlow Notification');
  const body = String(payload.body || payload.title || '');
  const tag = payload.notificationId ? `fieldflow-${payload.notificationId}` : undefined;

  const options = {
    body,
    tag,
    data: {
      url: payload.url || '/#/notifications',
      notificationId: payload.notificationId,
      type: payload.type,
      assignmentId: payload.assignmentId,
      journeyId: payload.journeyId,
      sampleId: payload.sampleId,
    },
    renotify: false,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const data = event.notification.data || {};
  const type = String(data.type || '').toUpperCase();
  const origin = self.location.origin;

  let path = '/#/notifications';
  if (['SAMPLE_SUBMITTED', 'SAMPLE_APPROVED', 'SAMPLE_REJECTED'].includes(type)) {
    path = '/#/samples';
  } else if (['JOURNEY_STARTED', 'JOURNEY_COMPLETED'].includes(type)) {
    path = '/#/work';
  } else if (['ASSIGNMENT_CREATED', 'ASSIGNMENT_ASSIGNED', 'ASSIGNMENT_UPDATED', 'ASSIGNMENT_REMINDER', 'ASSIGNMENT_DECLINED'].includes(type)) {
    path = '/#/work';
  } else if (type === 'RECURRING_ASSIGNMENT_GENERATED') {
    path = '/#/work';
  }

  const defaultUrl = data.url || '/#/notifications';
  const url = new URL(defaultUrl === '/notifications' || defaultUrl === '/#/notifications' ? path : defaultUrl, origin).toString();

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(origin) && 'focus' in client) {
          return client.focus().then(() => client.navigate(url));
        }
      }
      return self.clients.openWindow(url);
    })
  );
});
