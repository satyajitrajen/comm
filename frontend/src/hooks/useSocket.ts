'use client';

import { useEffect, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';
import { getAppSocket } from '../lib/socket';

/**
 * Shared Socket.IO client for the authenticated session.
 * One connection per tab — listeners attach/detach here; logout disconnects.
 */
export function useAppSocket(): Socket | null {
  const [socket, setSocket] = useState<Socket | null>(() =>
    typeof window === 'undefined' ? null : getAppSocket(),
  );
  const socketRef = useRef<Socket | null>(socket);

  useEffect(() => {
    const instance = getAppSocket();
    socketRef.current = instance;
    setSocket(instance);

    if (!instance) return;

    const sync = () => {
      socketRef.current = instance;
      setSocket(instance);
    };

    instance.on('connect', sync);
    instance.on('disconnect', sync);

    return () => {
      instance.off('connect', sync);
      instance.off('disconnect', sync);
    };
  }, []);

  return socket;
}

export { useAppSocket as useSocket };
