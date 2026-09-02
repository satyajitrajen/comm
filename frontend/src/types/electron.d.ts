export type DesktopConfig = {
  isDesktop: true;
  frontendUrl: string;
  apiUrl?: string;
};

export interface ElectronAPI {
  minimizeWindow: () => void;
  maximizeWindow: () => void;
  closeWindow: () => void;
  isMaximized: () => Promise<boolean>;
  getConfig: () => Promise<DesktopConfig>;
  sendNotification: (title: string, options?: { body?: string; icon?: string }) => void;
  setTrayStatus: (status: 'online' | 'away' | 'dnd') => void;
  onWindowMaximizedState: (callback: (isMaximized: boolean) => void) => void;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
    /** Mirrors active-call state for the Electron main process (close warning). */
    __commInCall?: boolean;
  }
}

export {};
