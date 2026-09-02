import { Tray, Menu, app, BrowserWindow, nativeImage, ipcMain } from 'electron';
import fs from 'fs';
import path from 'path';
import { setDndEnabled } from './notification';

let tray: Tray | null = null;

export function setupSystemTray(mainWindow: BrowserWindow): Tray {
  // Load resources/icon.png if present; drop a real icon there and it is picked up automatically.
  const iconPath = path.join(__dirname, '../../resources/icon.png');
  const icon = fs.existsSync(iconPath)
    ? nativeImage.createFromPath(iconPath)
    : nativeImage.createEmpty();
  tray = new Tray(icon);
  tray.setToolTip('Comm Desktop');
  tray.setTitle('TeamTime');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Open Comm Desktop',
      click: () => {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.show();
        mainWindow.focus();
      },
    },
    { type: 'separator' },
    {
      label: 'Status',
      submenu: [
        { label: '🟢 Online', type: 'radio', checked: true, click: () => setTrayStatus('online') },
        { label: '🟡 Away', type: 'radio', click: () => setTrayStatus('away') },
        { label: '🔴 Do Not Disturb', type: 'radio', click: () => setTrayStatus('dnd') },
      ],
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);

  tray.on('double-click', () => {
    if (mainWindow.isVisible()) {
      mainWindow.hide();
    } else {
      mainWindow.show();
      mainWindow.focus();
    }
  });

  return tray;
}

export function setTrayStatus(status: 'online' | 'away' | 'dnd') {
  console.log(`[Tray] User set status to: ${status}`);
  setDndEnabled(status === 'dnd');
  // Notify renderer so it can suppress browser notifications too
  const windows = BrowserWindow.getAllWindows();
  for (const win of windows) {
    win.webContents.send('tray:statusChanged', status);
  }
}
