'use client';

import type { ReactNode } from 'react';
import DesktopTitleBar from './DesktopTitleBar';

/** Wraps the app so Electron chrome sits above every route (including auth). */
export default function DesktopRootChrome({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <DesktopTitleBar />
      <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
    </div>
  );
}
