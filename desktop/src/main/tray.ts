import { Tray, Menu, app, BrowserWindow, nativeImage } from 'electron';
import path from 'path';

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
        { label: '🟢 Online', type: 'radio', checked: true, click: () => setStatus('online') },
        { label: '🟡 Away', type: 'radio', click: () => setStatus('away') },
        { label: '🔴 Do Not Disturb', type: 'radio', click: () => setStatus('dnd') },
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

function setStatus(status: 'online' | 'away' | 'dnd') {
  console.log(`[Tray] User set status to: ${status}`);
}
