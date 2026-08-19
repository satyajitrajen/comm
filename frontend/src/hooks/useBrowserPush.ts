'use client';

import { useEffect, useRef } from 'react';
import { enrollBrowserPush } from '../lib/push';
import { isElectronDesktop } from '../lib/desktopRuntime';

/** Registers FCM (or VAPID fallback) once the workspace session is live. */
export function useBrowserPush(enabled: boolean) {
  const enrolled = useRef(false);

  useEffect(() => {
    if (!enabled || isElectronDesktop() || enrolled.current) return;
    enrolled.current = true;
    void enrollBrowserPush();
  }, [enabled]);
}
