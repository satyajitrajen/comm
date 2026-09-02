/**
 * Runtime helpers when the Next.js app is embedded in the Electron desktop shell.
 */

declare global {
  interface Window {
    electronAPI?: {
      minimizeWindow: () => void;
      maximizeWindow: () => void;
      closeWindow: () => void;
      isMaximized: () => Promise<boolean>;
      getConfig: () => Promise<{ apiUrl?: string }>;
      sendNotification: (title: string, options?: { body?: string; tag?: string }) => void;
      setTrayStatus: (status: 'online' | 'away' | 'dnd') => void;
      onWindowMaximizedState: (callback: (isMaximized: boolean) => void) => void;
      onForceEndCall: (callback: () => void) => void;
      onTrayStatusChanged: (callback: (status: string) => void) => void;
    };
    __commInCall?: boolean;
  }
}

let cachedApiUrl: string | null | undefined;

export function isElectronDesktop(): boolean {
  return typeof window !== 'undefined' && Boolean(window.electronAPI);
}

/** Sync best-effort: uses cached value from ensureDesktopConfig(). */
export function getDesktopApiUrl(): string {
  if (typeof window === 'undefined') return '';
  return cachedApiUrl || '';
}

export async function ensureDesktopConfig(): Promise<void> {
  if (typeof window === 'undefined' || !window.electronAPI?.getConfig) return;
  try {
    const config = await window.electronAPI.getConfig();
    cachedApiUrl = config.apiUrl?.trim() || null;
  } catch {
    cachedApiUrl = null;
  }
}

function adjustLocalhostForRemoteBrowser(urlStr: string): string {
  if (typeof window === 'undefined') return urlStr;
  try {
    const parsed = new URL(urlStr);
    if (
      (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') &&
      window.location.hostname &&
      window.location.hostname !== 'localhost' &&
      window.location.hostname !== '127.0.0.1'
    ) {
      parsed.hostname = window.location.hostname;
      return parsed.origin;
    }
  } catch {
    // ignore parse error and return original
  }
  return urlStr;
}

/**
 * Resolve HTTP API / Socket.IO base URL.
 * Prefer Electron-injected DESKTOP_API_URL, then Next public env.
 * The host:5000 fallback only applies outside production — production builds
 * must set NEXT_PUBLIC_API_URL/NEXT_PUBLIC_SOCKET_URL explicitly and otherwise
 * use same-origin relative paths.
 */
export function resolveServiceBaseUrl(): string {
  const fromDesktop = getDesktopApiUrl();
  if (fromDesktop) return fromDesktop;

  if (process.env.NEXT_PUBLIC_SOCKET_URL) {
    return adjustLocalhostForRemoteBrowser(process.env.NEXT_PUBLIC_SOCKET_URL);
  }
  if (process.env.NEXT_PUBLIC_API_URL) {
    return adjustLocalhostForRemoteBrowser(process.env.NEXT_PUBLIC_API_URL);
  }

  if (
    process.env.NODE_ENV !== 'production' &&
    typeof window !== 'undefined' &&
    window.location?.hostname
  ) {
    const protocol = window.location.protocol === 'https:' ? 'https:' : 'http:';
    return `${protocol}//${window.location.hostname}:5000`;
  }

  return '';
}

export function resolveApiBaseUrl(): string {
  const fromDesktop = getDesktopApiUrl();
  if (fromDesktop) return fromDesktop;

  if (process.env.NEXT_PUBLIC_API_URL) {
    return adjustLocalhostForRemoteBrowser(process.env.NEXT_PUBLIC_API_URL);
  }

  return '';
}

export function sendDesktopNotification(
  title: string,
  options?: { body?: string; tag?: string },
): void {
  if (!isElectronDesktop()) return;
  window.electronAPI?.sendNotification(title, options);
}

export function onDesktopForceEndCall(callback: () => void): () => void {
  if (!isElectronDesktop()) return () => {};
  window.electronAPI?.onForceEndCall(callback);
  return () => {
    // ipcRenderer listeners are automatically cleaned up by contextIsolation;
    // no manual off needed for one-way channels in this preload design.
  };
}
