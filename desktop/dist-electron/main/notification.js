"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.setDndEnabled = setDndEnabled;
exports.isDndEnabled = isDndEnabled;
exports.showNativeNotification = showNativeNotification;
const electron_1 = require("electron");
const path_1 = __importDefault(require("path"));
let dndEnabled = false;
function setDndEnabled(enabled) {
    dndEnabled = enabled;
}
function isDndEnabled() {
    return dndEnabled;
}
function showNativeNotification(title, body, mainWindow, tag) {
    if (!electron_1.Notification.isSupported())
        return;
    if (dndEnabled)
        return;
    const notification = new electron_1.Notification({
        title,
        body: body || '',
        silent: false,
        icon: electron_1.nativeImage.createFromPath(path_1.default.join(__dirname, '../../resources/icon.png')),
        ...(tag ? { tag } : {}),
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
