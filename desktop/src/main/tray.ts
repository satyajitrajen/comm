import { Tray, Menu, app, BrowserWindow, nativeImage, ipcMain } from 'electron';
import path from 'path';
import { setDndEnabled } from './notification';

let tray: Tray | null = null;

export function setupSystemTray(mainWindow: BrowserWindow): Tray {
  // Create a 16x16 icon programmatically or load blank native image if asset missing
  const icon = nativeImage.createEmpty();
  tray = new Tray(icon);
  tray.setToolTip('Comm Desktop');

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

function setTrayStatus(status: 'online' | 'away' | 'dnd') {
  console.log(`[Tray] User set status to: ${status}`);
  setDndEnabled(status === 'dnd');
  // Notify renderer so it can suppress browser notifications too
  const windows = BrowserWindow.getAllWindows();
  for (const win of windows) {
    win.webContents.send('tray:statusChanged', status);
  }
}
