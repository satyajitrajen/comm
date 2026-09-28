import { Notification, BrowserWindow } from 'electron';
import { appIcon } from './icon';

let dndEnabled = false;

export function setDndEnabled(enabled: boolean) {
  dndEnabled = enabled;
}

export function isDndEnabled(): boolean {
  return dndEnabled;
}

/** Same-origin relative paths only, so a payload cannot navigate anywhere else. */
export function safeAppPath(url: string | undefined): string | null {
  if (typeof url === 'string' && url.startsWith('/') && !url.startsWith('//')) return url;
  return null;
}

export function showNativeNotification(
  title: string,
  body: string | undefined,
  mainWindow: BrowserWindow | null,
  options?: { tag?: string; url?: string },
) {
  if (!Notification.isSupported()) return;
  if (dndEnabled) return;

  const notification = new Notification({
    title,
    body: body || '',
    silent: false,
    icon: appIcon(),
  });

  notification.on('click', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
    const target = safeAppPath(options?.url);
    if (target) mainWindow.webContents.send('app:navigate', target);
  });

  notification.show();
}
