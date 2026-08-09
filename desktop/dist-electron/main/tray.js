"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setupSystemTray = setupSystemTray;
const electron_1 = require("electron");
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
                { label: '🟢 Online', type: 'radio', checked: true, click: () => setStatus('online') },
                { label: '🟡 Away', type: 'radio', click: () => setStatus('away') },
                { label: '🔴 Do Not Disturb', type: 'radio', click: () => setStatus('dnd') },
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
function setStatus(status) {
    console.log(`[Tray] User set status to: ${status}`);
}
