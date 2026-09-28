import { Tray, Menu, app, BrowserWindow } from 'electron';
import { setDndEnabled } from './notification';
import { appIcon } from './icon';

export type TrayStatus = 'online' | 'away' | 'dnd';

let tray: Tray | null = null;
let currentStatus: TrayStatus = 'online';
let windowRef: BrowserWindow | null = null;

export function showMainWindow() {
  const win = windowRef;
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

function buildMenu() {
  if (!tray) return;
  const statusItem = (label: string, status: TrayStatus) => ({
    label,
    type: 'radio' as const,
    checked: currentStatus === status,
    click: () => setTrayStatus(status, { fromTray: true }),
  });

  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Open TeamTime', click: showMainWindow },
      { type: 'separator' },
      {
        label: 'Status',
        submenu: [
          statusItem('Online', 'online'),
          statusItem('Away', 'away'),
          statusItem('Do not disturb', 'dnd'),
        ],
      },
      { type: 'separator' },
      {
        label: 'Quit TeamTime',
        click: () => {
          // before-quit flips the "really quit" flag in index.ts.
          app.quit();
        },
      },
    ]),
  );
}

export function setupSystemTray(mainWindow: BrowserWindow): Tray {
  windowRef = mainWindow;
  tray = new Tray(appIcon(16));
  tray.setToolTip('TeamTime');
  buildMenu();

  // Single click restores on Windows, where that is the convention.
  tray.on('click', showMainWindow);
  tray.on('double-click', showMainWindow);
  return tray;
}

/**
 * Updates the tray radio and DND suppression.
 *
 * Only a change made from the tray is broadcast to the renderer; a change the
 * renderer reports is applied locally without echoing it back, which would
 * otherwise loop.
 */
export function setTrayStatus(status: TrayStatus, options?: { fromTray?: boolean }) {
  currentStatus = status;
  setDndEnabled(status === 'dnd');
  buildMenu();

  if (options?.fromTray) {
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send('tray:statusChanged', status);
    }
  }
}
