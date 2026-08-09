import { contextBridge, ipcRenderer } from 'electron';

export type DesktopConfig = {
  isDesktop: true;
  frontendUrl: string;
  apiUrl?: string;
};

export interface IElectronAPI {
  minimizeWindow: () => void;
  maximizeWindow: () => void;
  closeWindow: () => void;
  isMaximized: () => Promise<boolean>;
  getConfig: () => Promise<DesktopConfig>;
  sendNotification: (title: string, options?: { body?: string; icon?: string }) => void;
  setTrayStatus: (status: 'online' | 'away' | 'dnd') => void;
  onWindowMaximizedState: (callback: (isMaximized: boolean) => void) => void;
}

const electronAPI: IElectronAPI = {
  minimizeWindow: () => ipcRenderer.send('window:minimize'),
  maximizeWindow: () => ipcRenderer.send('window:maximize'),
  closeWindow: () => ipcRenderer.send('window:close'),
  isMaximized: () => ipcRenderer.invoke('window:isMaximized'),
  getConfig: () => ipcRenderer.invoke('desktop:getConfig'),
  sendNotification: (title, options) =>
    ipcRenderer.send('notification:send', { title, ...options }),
  setTrayStatus: (status) => ipcRenderer.send('tray:setStatus', status),
  onWindowMaximizedState: (callback) => {
    ipcRenderer.on('window:maximized-state', (_event, isMaximized) => callback(isMaximized));
  },
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);
