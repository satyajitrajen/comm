import { Notification, BrowserWindow } from 'electron';

export function showNativeNotification(
  title: string,
  body?: string,
  mainWindow?: BrowserWindow | null
) {
  if (!Notification.isSupported()) return;

  const notification = new Notification({
    title,
    body: body || '',
    silent: false,
  });

  notification.on('click', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  notification.show();
}
