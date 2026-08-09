"use strict";
const electron = require("electron");
const electronAPI = {
  minimizeWindow: () => electron.ipcRenderer.send("window:minimize"),
  maximizeWindow: () => electron.ipcRenderer.send("window:maximize"),
  closeWindow: () => electron.ipcRenderer.send("window:close"),
  isMaximized: () => electron.ipcRenderer.invoke("window:isMaximized"),
  getConfig: () => electron.ipcRenderer.invoke("desktop:getConfig"),
  sendNotification: (title, options) => electron.ipcRenderer.send("notification:send", { title, ...options }),
  setTrayStatus: (status) => electron.ipcRenderer.send("tray:setStatus", status),
  onWindowMaximizedState: (callback) => {
    electron.ipcRenderer.on("window:maximized-state", (_event, isMaximized) => callback(isMaximized));
  }
};
electron.contextBridge.exposeInMainWorld("electronAPI", electronAPI);
