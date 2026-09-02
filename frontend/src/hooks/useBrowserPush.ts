'use client';

import { useEffect } from 'react';
import { enrollBrowserPush } from '../lib/push';
import { isElectronDesktop } from '../lib/desktopRuntime';

/**
 * Module-level rather than a per-instance ref so a password change (which
 * unregisters push) can re-arm enrolment via resetBrowserPushEnrollment().
 */
let enrolled = false;

/** Re-arms enrolment so the next effect run (e.g. after re-login) re-enrolls. */
export function resetBrowserPushEnrollment() {
  enrolled = false;
}

/** Registers FCM (or VAPID fallback) once the workspace session is live. */
export function useBrowserPush(enabled: boolean) {
  useEffect(() => {
    if (!enabled || isElectronDesktop() || enrolled) return;
    enrolled = true;
    void enrollBrowserPush();
  }, [enabled]);
}
