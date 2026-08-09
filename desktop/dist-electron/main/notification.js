"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.showNativeNotification = showNativeNotification;
const electron_1 = require("electron");
function showNativeNotification(title, body, mainWindow) {
    if (!electron_1.Notification.isSupported())
        return;
    const notification = new electron_1.Notification({
        title,
        body: body || '',
        silent: false,
    });
    notification.on('click', () => {
        if (mainWindow) {
            if (mainWindow.isMinimized())
                mainWindow.restore();
            mainWindow.focus();
        }
    });
    notification.show();
}
