import React from 'react';

/**
 * Product UI is the Next.js frontend loaded by Electron main via loadURL.
 * This Vite renderer is unused for product screens (legacy stubs live in _legacy/).
 */
export const App: React.FC = () => {
  return (
    <div className="flex h-full items-center justify-center bg-slate-50 text-sm text-slate-500">
      Comm Desktop loads the Next.js frontend. Start frontend on :3000 and run Electron main.
    </div>
  );
};
