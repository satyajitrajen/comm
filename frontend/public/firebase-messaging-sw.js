/* TeamTime FCM service worker — background web push when no tab is focused.
 * Client Firebase config is public by design (same as google-services.json). */

importScripts('https://www.gstatic.com/firebasejs/11.10.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/11.10.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyC3roBcnu89HENGclwwhPrhvYbUS4DSDyk',
  authDomain: 'communication-5f5bd.firebaseapp.com',
  projectId: 'communication-5f5bd',
  storageBucket: 'communication-5f5bd.firebasestorage.app',
  messagingSenderId: '427120049634',
  appId: '1:427120049634:web:6b6722b254f07bd6dfcdbb',
});

const messaging = firebase.messaging();

/** Only same-origin relative paths may be navigated to from a push payload. */
function safeNotificationUrl(url) {
  if (typeof url === 'string' && url.startsWith('/') && !url.startsWith('//')) return url;
  return '/';
}

messaging.onBackgroundMessage((payload) => {
  const notification = payload.notification || {};
  const data = payload.data || {};
  const title = notification.title || data.title || 'TeamTime';
  const body = notification.body || data.body || '';
  const url = safeNotificationUrl(data.url);

  return self.registration.showNotification(title, {
    body,
    icon: '/teamtime-favicon.png',
    badge: '/teamtime-favicon.png',
    tag: url,
    renotify: true,
    data: { url },
  });
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = safeNotificationUrl(event.notification.data && event.notification.data.url);

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
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
