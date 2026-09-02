import { notificationsAPI } from '../services/api';
import { isElectronDesktop } from './desktopRuntime';
import { getFirebaseApp, isFirebaseWebConfigured } from './firebase';

/**
 * Browser push enrolment.
 *
 * Prefer Firebase Cloud Messaging when the web app is configured. Fall back to
 * classic VAPID + /sw.js so existing web-push subscriptions keep working.
 * Electron uses native toasts — skip both paths there.
 *
 * Everything degrades quietly: unsupported browsers, denied permission, and a
 * server without keys all end up "not subscribed" rather than throwing
 * into the UI.
 */

export type PushState = 'unsupported' | 'unconfigured' | 'denied' | 'off' | 'on';

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(normalized);
  return Uint8Array.from([...raw].map((char) => char.charCodeAt(0)));
}

export function isPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

async function vapidRegistration(): Promise<ServiceWorkerRegistration> {
  return await navigator.serviceWorker.register('/sw.js');
}

async function fcmRegistration(): Promise<ServiceWorkerRegistration> {
  return await navigator.serviceWorker.register('/firebase-messaging-sw.js');
}

export async function getPushState(): Promise<PushState> {
  if (!isPushSupported()) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';

  try {
    if (isFirebaseWebConfigured()) {
      const reg = await fcmRegistration();
      const existing = await reg.pushManager.getSubscription();
      return existing ? 'on' : 'off';
    }
    const { publicKey } = await notificationsAPI.getPushPublicKey();
    if (!publicKey) return 'unconfigured';
    const reg = await vapidRegistration();
    const existing = await reg.pushManager.getSubscription();
    return existing ? 'on' : 'off';
  } catch {
    return 'unconfigured';
  }
}

/** Only same-origin relative paths may be navigated to from a push payload. */
function safeNotificationUrl(url: string | undefined | null): string {
  if (typeof url === 'string' && url.startsWith('/') && !url.startsWith('//')) return url;
  return '/';
}

async function enableFcmPush(): Promise<PushState> {
  const app = getFirebaseApp();
  if (!app) return 'unconfigured';

  const { getMessaging, getToken, isSupported, onMessage } = await import('firebase/messaging');
  if (!(await isSupported())) return 'unsupported';

  const permission =
    Notification.permission === 'granted'
      ? 'granted'
      : await Notification.requestPermission();
  if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'off';

  const reg = await fcmRegistration();
  const messaging = getMessaging(app);
  const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;
  const token = await getToken(messaging, {
    serviceWorkerRegistration: reg,
    ...(vapidKey ? { vapidKey } : {}),
  });
  if (!token) return 'off';

  await notificationsAPI.subscribePush({ token, deviceType: 'WEB' });

  onMessage(messaging, (payload) => {
    if (!document.hidden || Notification.permission !== 'granted') return;
    const title =
      payload.notification?.title || payload.data?.title || 'TeamTime';
    const body = payload.notification?.body || payload.data?.body || '';
    const url = safeNotificationUrl(payload.data?.url);
    const n = new Notification(title, {
      body,
      icon: '/teamtime-favicon.png',
      tag: url,
    });
    n.onclick = () => {
      window.focus();
      window.location.assign(url);
      n.close();
    };
  });

  return 'on';
}

/** Prompts for permission if needed, then registers a VAPID subscription. */
export async function enablePush(): Promise<PushState> {
  if (!isPushSupported()) return 'unsupported';

  const { publicKey } = await notificationsAPI.getPushPublicKey();
  if (!publicKey) return 'unconfigured';

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'off';

  const reg = await vapidRegistration();
  const subscription =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
    }));

  await notificationsAPI.subscribePush({ subscription: subscription.toJSON() });
  return 'on';
}

export async function disablePush(): Promise<PushState> {
  if (!isPushSupported()) return 'unsupported';

  try {
    if (isFirebaseWebConfigured()) {
      const app = getFirebaseApp();
      if (app) {
        const { getMessaging, getToken, deleteToken } = await import('firebase/messaging');
        const messaging = getMessaging(app);
        const token = await getToken(messaging).catch(() => null);
        if (token) {
          await notificationsAPI
            .unsubscribePush({ token, deviceType: 'WEB' })
            .catch(() => {});
        }
        await deleteToken(messaging).catch(() => {});
      }
    }
  } catch {
    // still drop VAPID below
  }

  const reg = await vapidRegistration().catch(() => null);
  const subscription = await reg?.pushManager.getSubscription();
  if (subscription) {
    await notificationsAPI.unsubscribePush({ subscription: subscription.toJSON() }).catch(() => {});
    await subscription.unsubscribe().catch(() => {});
  }
  return 'off';
}

/**
 * Enroll after login. FCM first; VAPID if Firebase web config is missing.
 * Never throws into the UI.
 */
export async function enrollBrowserPush(): Promise<PushState> {
  if (typeof window === 'undefined' || isElectronDesktop()) return 'unsupported';
  if (!isPushSupported()) return 'unsupported';
  try {
    if (isFirebaseWebConfigured()) {
      return await enableFcmPush();
    }
    return await enablePush();
  } catch {
    if (isFirebaseWebConfigured()) {
      try {
        return await enablePush();
      } catch {
        return 'unconfigured';
      }
    }
    return 'unconfigured';
  }
}

export async function unregisterBrowserPush(): Promise<void> {
  if (typeof window === 'undefined' || isElectronDesktop()) return;
  try {
    await disablePush();
  } catch {
    // logout must continue
  }
}
