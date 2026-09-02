import { Notification, BrowserWindow, nativeImage } from 'electron';
import fs from 'fs';
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

  // Only pass the icon when the asset exists; otherwise let Electron use its default.
  const iconPath = path.join(__dirname, '../../resources/icon.png');
  const notification = new Notification({
    title,
    body: body || '',
    silent: false,
    ...(fs.existsSync(iconPath) ? { icon: nativeImage.createFromPath(iconPath) } : {}),
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
