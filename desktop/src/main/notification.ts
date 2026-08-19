import { Notification, BrowserWindow, nativeImage } from 'electron';
import path from 'path';

let dndEnabled = false;

export function setDndEnabled(enabled: boolean) {
  dndEnabled = enabled;
}

export function isDndEnabled(): boolean {
  return dndEnabled;
}

export function showNativeNotification(
  title: string,
  body?: string,
  mainWindow?: BrowserWindow | null,
  tag?: string,
) {
  if (!Notification.isSupported()) return;
  if (dndEnabled) return;

  const notification = new Notification({
    title,
    body: body || '',
    silent: false,
    icon: nativeImage.createFromPath(
      path.join(__dirname, '../../resources/icon.png'),
    ),
    ...(tag ? { tag } : {}),
  });

  notification.on('click', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  notification.show();
}
