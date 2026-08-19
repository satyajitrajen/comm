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
  sendNotification: (title: string, options?: { body?: string; icon?: string; tag?: string }) => void;
  setTrayStatus: (status: 'online' | 'away' | 'dnd') => void;
  onWindowMaximizedState: (callback: (isMaximized: boolean) => void) => void;
  onForceEndCall: (callback: () => void) => void;
  onTrayStatusChanged: (callback: (status: string) => void) => void;
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
  onForceEndCall: (callback) => {
    ipcRenderer.on('app:force-end-call', () => callback());
  },
  onTrayStatusChanged: (callback) => {
    ipcRenderer.on('tray:statusChanged', (_event, status) => callback(status));
  },
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);
