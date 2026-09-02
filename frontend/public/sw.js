/* TeamTime service worker — browser push only.
 *
 * Deliberately does not cache anything: this app is dynamic and a stale
 * offline cache would show wrong message history. Its whole job is to receive
 * pushes while no tab is open and to focus an existing tab on click. */

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

/** Only same-origin relative paths may be navigated to from a push payload. */
function safeNotificationUrl(url) {
  if (typeof url === 'string' && url.startsWith('/') && !url.startsWith('//')) return url;
  return '/';
}

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { title: 'TeamTime', body: event.data ? event.data.text() : '' };
  }

  const title = payload.title || 'TeamTime';
  const url = safeNotificationUrl(payload.url);
  event.waitUntil(
    self.registration.showNotification(title, {
      body: payload.body || '',
      icon: '/teamtime-favicon.png',
      badge: '/teamtime-favicon.png',
      // Collapses repeat notifications from the same conversation.
      tag: url || 'teamtime',
      renotify: true,
      data: { url: url || '/home' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = safeNotificationUrl(event.notification.data && event.notification.data.url);

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      // Reuse an open tab where possible rather than piling up windows.
      for (const client of clients) {
        if ('focus' in client) {
          client.navigate(target);
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});
