"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setupSystemTray = setupSystemTray;
const electron_1 = require("electron");
const notification_1 = require("./notification");
let tray = null;
function setupSystemTray(mainWindow) {
    // Create a 16x16 icon programmatically or load blank native image if asset missing
    const icon = electron_1.nativeImage.createEmpty();
    tray = new electron_1.Tray(icon);
    tray.setToolTip('Comm Desktop');
    const contextMenu = electron_1.Menu.buildFromTemplate([
        {
            label: 'Open Comm Desktop',
            click: () => {
                if (mainWindow.isMinimized())
                    mainWindow.restore();
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
                electron_1.app.quit();
            },
        },
    ]);
    tray.setContextMenu(contextMenu);
    tray.on('double-click', () => {
        if (mainWindow.isVisible()) {
            mainWindow.hide();
        }
        else {
            mainWindow.show();
            mainWindow.focus();
        }
    });
    return tray;
}
function setTrayStatus(status) {
    console.log(`[Tray] User set status to: ${status}`);
    (0, notification_1.setDndEnabled)(status === 'dnd');
    // Notify renderer so it can suppress browser notifications too
    const windows = electron_1.BrowserWindow.getAllWindows();
    for (const win of windows) {
        win.webContents.send('tray:statusChanged', status);
    }
}
