import React, { useEffect, useState } from 'react';
import { Minus, Square, Copy, X, Search, Sun, Moon, ShieldCheck } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';

export const TitleBar: React.FC = () => {
  const [isMaximized, setIsMaximized] = useState(false);
  const { isConnected, theme, setTheme, searchQuery, setSearchQuery } = useAppStore();

  useEffect(() => {
    if (window.electronAPI) {
      window.electronAPI.isMaximized().then(setIsMaximized);
      window.electronAPI.onWindowMaximizedState((state) => {
        setIsMaximized(state);
      });
    }
  }, []);

  const handleMinimize = () => window.electronAPI?.minimizeWindow();
  const handleMaximize = () => window.electronAPI?.maximizeWindow();
  const handleClose = () => window.electronAPI?.closeWindow();

  return (
    <header className="h-10 bg-white border-b border-slate-200 flex items-center justify-between px-3 select-none drag-region text-slate-700 text-xs shadow-xs">
      {/* App Logo & Branding */}
      <div className="flex items-center space-x-2.5 no-drag">
        <div className="w-6 h-6 rounded-lg bg-indigo-600 flex items-center justify-center font-black text-white text-xs shadow-xs">
          C
        </div>
        <span className="font-bold text-slate-900 tracking-tight text-sm">Comm</span>
        <span className="text-[10px] bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full font-semibold border border-indigo-100">
          Desktop
        </span>
      </div>

      {/* Global Search Input Bar */}
      <div className="flex-1 max-w-sm mx-4 no-drag">
        <div className="relative flex items-center">
          <Search className="w-3.5 h-3.5 absolute left-2.5 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search channels, messages, or files..."
            className="w-full bg-slate-100 border border-slate-200 rounded-lg pl-8 pr-3 py-1 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:bg-white transition-all"
          />
        </div>
      </div>

      {/* Status Pill & Controls */}
      <div className="flex items-center space-x-3 no-drag">
        {/* Connection Status Pill */}
        <div className="flex items-center space-x-1.5 bg-slate-100 border border-slate-200 px-2.5 py-1 rounded-full text-[11px]">
          {isConnected ? (
            <>
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <span className="text-slate-700 font-medium">Connected</span>
            </>
          ) : (
            <>
              <span className="w-2 h-2 rounded-full bg-amber-500"></span>
              <span className="text-slate-600 font-medium">Offline</span>
            </>
          )}
        </div>

        {/* Theme Toggle */}
        <button
          onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
          className="p-1.5 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors"
          title={`Toggle ${theme === 'light' ? 'Dark' : 'Light'} Mode`}
        >
          {theme === 'light' ? <Sun className="w-4 h-4 text-amber-500" /> : <Moon className="w-4 h-4 text-indigo-600" />}
        </button>

        {/* Windows Frameless Controls */}
        <div className="flex items-center -mr-3 border-l border-slate-200 pl-1">
          <button
            onClick={handleMinimize}
            className="h-10 w-11 flex items-center justify-center hover:bg-slate-100 text-slate-600 hover:text-slate-900 transition-colors"
            title="Minimize"
          >
            <Minus className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleMaximize}
            className="h-10 w-11 flex items-center justify-center hover:bg-slate-100 text-slate-600 hover:text-slate-900 transition-colors"
            title={isMaximized ? 'Restore' : 'Maximize'}
          >
            {isMaximized ? <Copy className="w-3 h-3 rotate-180" /> : <Square className="w-3 h-3" />}
          </button>
          <button
            onClick={handleClose}
            className="h-10 w-11 flex items-center justify-center hover:bg-red-600 hover:text-white text-slate-600 transition-colors"
            title="Close"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </header>
  );
};
