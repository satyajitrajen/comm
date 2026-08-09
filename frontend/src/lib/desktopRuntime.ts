/**
 * Runtime helpers when the Next.js app is embedded in the Electron desktop shell.
 */

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

/**
 * Resolve HTTP API / Socket.IO base URL.
 * Prefer Electron-injected DESKTOP_API_URL, then Next public env.
 */
export function resolveServiceBaseUrl(): string {
  const fromDesktop = getDesktopApiUrl();
  if (fromDesktop) return fromDesktop;
  return (
    process.env.NEXT_PUBLIC_SOCKET_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    ''
  );
}

export function resolveApiBaseUrl(): string {
  const fromDesktop = getDesktopApiUrl();
  if (fromDesktop) return fromDesktop;
  return process.env.NEXT_PUBLIC_API_URL || '';
}

export function sendDesktopNotification(
  title: string,
  options?: { body?: string },
): void {
  if (!isElectronDesktop()) return;
  window.electronAPI?.sendNotification(title, options);
}
