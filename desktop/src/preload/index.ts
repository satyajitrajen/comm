import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';

export type DesktopConfig = {
  isDesktop: true;
  frontendUrl: string;
  apiUrl?: string;
};

type Unsubscribe = () => void;

export interface IElectronAPI {
  minimizeWindow: () => void;
  maximizeWindow: () => void;
  closeWindow: () => void;
  isMaximized: () => Promise<boolean>;
  getConfig: () => Promise<DesktopConfig>;
  sendNotification: (
    title: string,
    options?: { body?: string; icon?: string; tag?: string; url?: string },
  ) => void;
  setTrayStatus: (status: 'online' | 'away' | 'dnd') => void;
  setUnreadCount: (count: number) => void;
  getLoginItem: () => Promise<boolean>;
  setLoginItem: (enabled: boolean) => Promise<boolean>;
  onWindowMaximizedState: (callback: (isMaximized: boolean) => void) => Unsubscribe;
  onForceEndCall: (callback: () => void) => Unsubscribe;
  onTrayStatusChanged: (callback: (status: string) => void) => Unsubscribe;
  /** In-app path to route to (deep link or notification click). */
  onNavigate: (callback: (path: string) => void) => Unsubscribe;
}

/**
 * Subscribes and returns a real unsubscribe. The previous preload only ever
 * added listeners, so remounting a component stacked duplicates.
 */
function listen<T extends unknown[]>(
  channel: string,
  callback: (...args: T) => void,
): Unsubscribe {
  const handler = (_event: IpcRendererEvent, ...args: unknown[]) => callback(...(args as T));
  ipcRenderer.on(channel, handler);
  return () => {
    ipcRenderer.removeListener(channel, handler);
  };
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
  setUnreadCount: (count) => ipcRenderer.send('app:setUnreadCount', count),
  getLoginItem: () => ipcRenderer.invoke('desktop:getLoginItem'),
  setLoginItem: (enabled) => ipcRenderer.invoke('desktop:setLoginItem', enabled),
  onWindowMaximizedState: (callback) => listen<[boolean]>('window:maximized-state', callback),
  onForceEndCall: (callback) => listen('app:force-end-call', callback),
  onTrayStatusChanged: (callback) => listen<[string]>('tray:statusChanged', callback),
  onNavigate: (callback) => listen<[string]>('app:navigate', callback),
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);
