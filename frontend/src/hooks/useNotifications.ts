'use client';

import { useEffect, useRef, useCallback } from 'react';
import { playNotificationTone } from '../lib/notificationTone';

type NotifyOptions = {
  title: string;
  body?: string;
  icon?: string;
  tag?: string;
  onClick?: () => void;
  /** Web Audio beep variant (browser may block until a user gesture). */
  tone?: 'message' | 'call' | 'event';
};

/**
 * Requests browser notification permission on mount and exposes a `notify()`
 * helper that only fires when the document is hidden (tab is in background).
 */
export function useNotifications() {
  const permissionRef = useRef<NotificationPermission>('default');

  useEffect(() => {
    if (!('Notification' in window)) return;

    // If already granted, store it
    permissionRef.current = Notification.permission;

    // Request permission if not yet decided
    if (Notification.permission === 'default') {
      Notification.requestPermission().then((result) => {
        permissionRef.current = result;
      });
    }
  }, []);

  const notify = useCallback(({ title, body, icon, tag, onClick, tone = 'message' }: NotifyOptions) => {
    if (!('Notification' in window)) return;
    const perm = Notification.permission;
    permissionRef.current = perm;
    if (perm !== 'granted') return;

    // Only show when the tab is not visible
    if (!document.hidden) return;

    playNotificationTone(tone);

    const n = new Notification(title, {
      body,
      icon: icon || '/favicon.ico',
      tag, // deduplicates — same tag replaces previous notification
      badge: '/favicon.ico',
    });

    if (onClick) {
      n.onclick = () => {
        window.focus();
        onClick();
        n.close();
      };
    }

    // Auto-close after 6 seconds
    setTimeout(() => n.close(), 6000);
  }, []);

  return { notify };
}
