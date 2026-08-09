import { notificationsAPI } from '../services/api';

/**
 * Browser push enrolment.
 *
 * Everything degrades quietly: unsupported browsers, denied permission, and a
 * server without VAPID keys all end up "not subscribed" rather than throwing
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

async function registration(): Promise<ServiceWorkerRegistration> {
  return await navigator.serviceWorker.register('/sw.js');
}

export async function getPushState(): Promise<PushState> {
  if (!isPushSupported()) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';

  try {
    const { publicKey } = await notificationsAPI.getPushPublicKey();
    if (!publicKey) return 'unconfigured';
    const reg = await registration();
    const existing = await reg.pushManager.getSubscription();
    return existing ? 'on' : 'off';
  } catch {
    return 'unconfigured';
  }
}

/** Prompts for permission if needed, then registers the subscription. */
export async function enablePush(): Promise<PushState> {
  if (!isPushSupported()) return 'unsupported';

  const { publicKey } = await notificationsAPI.getPushPublicKey();
  if (!publicKey) return 'unconfigured';

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'off';

  const reg = await registration();
  const subscription =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
    }));

  await notificationsAPI.subscribePush(subscription.toJSON());
  return 'on';
}

export async function disablePush(): Promise<PushState> {
  if (!isPushSupported()) return 'unsupported';

  const reg = await registration();
  const subscription = await reg.pushManager.getSubscription();
  if (subscription) {
    await notificationsAPI.unsubscribePush(subscription.toJSON()).catch(() => {});
    await subscription.unsubscribe().catch(() => {});
  }
  return 'off';
}
