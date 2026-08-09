'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import AppShell from '../components/AppShell';
import { TOKEN_UPDATED_EVENT } from '../../services/api';
import { navKeyAllowed, pathnameToNavKey } from '../../lib/permissions';

function readStoredUser() {
  try {
    const stored = localStorage.getItem('veloce_user');
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
}

export default function AppLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const sync = () => {
      setIsReady(Boolean(localStorage.getItem('veloce_token')));
    };
    sync();
    window.addEventListener(TOKEN_UPDATED_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(TOKEN_UPDATED_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  useEffect(() => {
    const token = typeof window === 'undefined' ? null : localStorage.getItem('veloce_token');
    if (!token) {
      router.replace(`/login?next=${encodeURIComponent(pathname || '/home')}`);
      return;
    }

    const navKey = pathnameToNavKey(pathname || '/');
    if (!navKey) return;

    const user = readStoredUser();
    if (!navKeyAllowed(navKey, user)) {
      router.replace('/home');
    }
  }, [pathname, router]);

  if (!isReady) {
    return (
      <div className="flex h-screen min-h-screen items-center justify-center bg-slate-50 text-sm font-medium text-slate-500">
        Loading workspace...
      </div>
    );
  }

  return <AppShell>{children}</AppShell>;
}
