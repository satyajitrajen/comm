"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const electronAPI = {
    minimizeWindow: () => electron_1.ipcRenderer.send('window:minimize'),
    maximizeWindow: () => electron_1.ipcRenderer.send('window:maximize'),
    closeWindow: () => electron_1.ipcRenderer.send('window:close'),
    isMaximized: () => electron_1.ipcRenderer.invoke('window:isMaximized'),
    getConfig: () => electron_1.ipcRenderer.invoke('desktop:getConfig'),
    sendNotification: (title, options) => electron_1.ipcRenderer.send('notification:send', { title, ...options }),
    setTrayStatus: (status) => electron_1.ipcRenderer.send('tray:setStatus', status),
    onWindowMaximizedState: (callback) => {
        electron_1.ipcRenderer.on('window:maximized-state', (_event, isMaximized) => callback(isMaximized));
    },
    onForceEndCall: (callback) => {
        electron_1.ipcRenderer.on('app:force-end-call', () => callback());
    },
    onTrayStatusChanged: (callback) => {
        electron_1.ipcRenderer.on('tray:statusChanged', (_event, status) => callback(status));
    },
};
electron_1.contextBridge.exposeInMainWorld('electronAPI', electronAPI);
