import { io, Socket } from 'socket.io-client';
import { resolveServiceBaseUrl } from './desktopRuntime';

const TOKEN_STORAGE_KEY = 'veloce_token';

/** Reads the token at call time so sockets never authenticate with a stale value. */
export function getCurrentSocketToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_STORAGE_KEY);
}

export type AppSocketOptions = {
  auth?: { token?: string | null };
};

/**
 * Single place where app sockets are created. Auth is read from localStorage at
 * creation and re-read on every reconnect attempt, so a token rotated elsewhere
 * (another tab, or after an HTTP refresh) is picked up without tearing the
 * socket down. Returns null when there is no token, mirroring the previous
 * `if (!token) return;` guards at each call site.
 */
export function createAppSocket(options?: AppSocketOptions): Socket | null {
  const token = options?.auth?.token ?? getCurrentSocketToken();
  if (!token) return null;

  const socketUrl = resolveServiceBaseUrl();
  const socket = socketUrl ? io(socketUrl, { auth: { token } }) : io({ auth: { token } });

  // socket.io re-sends `auth` on every attempt, so refresh it from storage.
  socket.on('reconnect_attempt', () => {
    socket.auth = { token: getCurrentSocketToken() };
  });

  return socket;
}
