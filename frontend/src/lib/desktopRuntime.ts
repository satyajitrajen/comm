/**
 * Runtime helpers when the Next.js app is embedded in the Electron desktop shell.
 */

type Unsubscribe = () => void;

/** Mirrors desktop/src/preload/index.ts — keep the two in sync. */
export type ElectronAPI = {
  minimizeWindow: () => void;
  maximizeWindow: () => void;
  closeWindow: () => void;
  isMaximized: () => Promise<boolean>;
  getConfig: () => Promise<{ isDesktop?: true; frontendUrl?: string; apiUrl?: string }>;
  sendNotification: (
    title: string,
    options?: { body?: string; tag?: string; url?: string },
  ) => void;
  setTrayStatus: (status: 'online' | 'away' | 'dnd') => void;
  setUnreadCount?: (count: number) => void;
  getLoginItem?: () => Promise<boolean>;
  setLoginItem?: (enabled: boolean) => Promise<boolean>;
  // Older shells returned void; newer ones return an unsubscribe.
  onWindowMaximizedState: (callback: (isMaximized: boolean) => void) => Unsubscribe | void;
  onForceEndCall: (callback: () => void) => Unsubscribe | void;
  onTrayStatusChanged: (callback: (status: string) => void) => Unsubscribe | void;
  onNavigate?: (callback: (path: string) => void) => Unsubscribe | void;
};

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
    /** Mirrors active-call state for the Electron main process (close warning). */
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

let configPromise: Promise<void> | null = null;

/**
 * Loads the API URL from the Electron main process once; every caller shares
 * the same promise. The bundled desktop UI is served from app://teamtime and
 * has no Next rewrite for /api, so a request sent before this resolves would
 * hit the local scheme and 404.
 */
export function ensureDesktopConfig(): Promise<void> {
  if (typeof window === 'undefined' || !window.electronAPI?.getConfig) {
    return Promise.resolve();
  }
  if (!configPromise) {
    configPromise = window.electronAPI
      .getConfig()
      .then((config) => {
        cachedApiUrl = config.apiUrl?.trim() || null;
      })
      .catch(() => {
        cachedApiUrl = null;
      });
  }
  return configPromise;
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
  options?: { body?: string; tag?: string; url?: string },
): void {
  if (!isElectronDesktop()) return;
  window.electronAPI?.sendNotification(title, options);
}

export function onDesktopForceEndCall(callback: () => void): () => void {
  if (!isElectronDesktop()) return () => {};
  const off = window.electronAPI?.onForceEndCall(callback);
  return typeof off === 'function' ? off : () => {};
}

/** Routes pushed from the shell (deep links, notification clicks). */
export function onDesktopNavigate(callback: (path: string) => void): () => void {
  const off = window.electronAPI?.onNavigate?.(callback);
  return typeof off === 'function' ? off : () => {};
}

export function setDesktopUnreadCount(count: number): void {
  window.electronAPI?.setUnreadCount?.(count);
}
