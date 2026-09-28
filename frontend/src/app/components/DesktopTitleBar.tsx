'use client';

import { Minus, Square, X as XIcon } from 'lucide-react';
import { useEffect, useState, type CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import {
  ensureDesktopConfig,
  isElectronDesktop,
  onDesktopNavigate,
} from '../../lib/desktopRuntime';

/**
 * Frameless Electron window chrome. Rendered from the root layout so login and
 * other non-AppShell routes still get drag region + window controls.
 */
export default function DesktopTitleBar() {
  const router = useRouter();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(isElectronDesktop());
    void ensureDesktopConfig();
  }, []);

  // Deep links and notification clicks. Subscribed here rather than in
  // AppShell so a link opened while signed out still routes: the auth guard
  // then turns it into /login?next=<target>.
  useEffect(() => onDesktopNavigate((path) => router.push(path)), [router]);

  if (!visible) return null;

  return (
    <div
      className="electron-titlebar flex h-9 shrink-0 items-center justify-between border-b border-slate-200/80 bg-white/90 px-2"
      style={{ WebkitAppRegion: 'drag' } as CSSProperties}
    >
      <div className="pl-2 text-[11px] font-semibold tracking-wide text-slate-500">
        TeamTime
      </div>
      <div
        className="flex items-center gap-0.5"
        style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}
      >
        <button
          type="button"
          className="flex h-7 w-10 items-center justify-center rounded text-slate-500 hover:bg-slate-100"
          title="Minimize"
          onClick={() => window.electronAPI?.minimizeWindow()}
        >
          <Minus className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          className="flex h-7 w-10 items-center justify-center rounded text-slate-500 hover:bg-slate-100"
          title="Maximize"
          onClick={() => window.electronAPI?.maximizeWindow()}
        >
          <Square className="h-3 w-3" />
        </button>
        <button
          type="button"
          className="flex h-7 w-10 items-center justify-center rounded text-slate-500 hover:bg-red-500 hover:text-white"
          title="Close (TeamTime keeps running in the tray)"
          onClick={() => window.electronAPI?.closeWindow()}
        >
          <XIcon className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
