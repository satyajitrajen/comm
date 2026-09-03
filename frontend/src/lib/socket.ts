import { io, Socket } from 'socket.io-client';
import { resolveServiceBaseUrl } from './desktopRuntime';

const TOKEN_STORAGE_KEY = 'veloce_token';

/** Reads the token at call time so sockets never authenticate with a stale value. */
export function getCurrentSocketToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_STORAGE_KEY);
}

/**
 * One Socket.IO connection for the whole authenticated browser tab.
 * Pages/hooks attach listeners and must remove them on unmount — they must
 * NOT call disconnect(). Only disconnectAppSocket() (logout) tears it down.
 */
let sharedSocket: Socket | null = null;

function createSharedSocket(token: string): Socket {
  const socketUrl = resolveServiceBaseUrl();
  const socket = socketUrl
    ? io(socketUrl, { auth: { token } })
    : io({ auth: { token } });

  // socket.io re-sends `auth` on every attempt, so refresh it from storage.
  socket.on('reconnect_attempt', () => {
    socket.auth = { token: getCurrentSocketToken() };
  });

  return socket;
}

/**
 * Returns the shared app socket, creating it on first use when a token exists.
 * Safe to call from any page — always the same instance within a tab.
 */
export function getAppSocket(): Socket | null {
  if (typeof window === 'undefined') return null;

  const token = getCurrentSocketToken();
  if (!token) return null;

  if (!sharedSocket) {
    sharedSocket = createSharedSocket(token);
  } else {
    sharedSocket.auth = { token };
    if (!sharedSocket.connected && !sharedSocket.active) {
      sharedSocket.connect();
    }
  }

  return sharedSocket;
}

/**
 * Tear down the shared socket. Call on logout (or forced session end).
 * Component unmounts must only `socket.off(...)`, never this.
 */
export function disconnectAppSocket(): void {
  if (!sharedSocket) return;
  sharedSocket.removeAllListeners();
  sharedSocket.disconnect();
  sharedSocket = null;
}
