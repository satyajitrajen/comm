import React, { useState } from 'react';
import { Server, Monitor, Save, Sun } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';

export const SettingsView: React.FC = () => {
  const { backendUrl, setBackendUrl } = useAppStore();
  const [urlInput, setUrlInput] = useState(backendUrl);
  const [minimizeToTray, setMinimizeToTray] = useState(true);
  const [nativeNotifications, setNativeNotifications] = useState(true);
  const [launchOnStartup, setLaunchOnStartup] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  const handleSaveBackendUrl = (e: React.FormEvent) => {
    e.preventDefault();
    setBackendUrl(urlInput.trim());
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2500);
  };

  return (
    <div className="flex-1 bg-slate-50 p-6 overflow-y-auto">
      <div className="max-w-2xl mx-auto space-y-6">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Desktop Settings</h1>
          <p className="text-xs text-slate-500 mt-1">Configure backend API connectivity, Windows native features, and device preferences.</p>
        </div>

        {/* Backend API Configuration */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4 shadow-2xs">
          <div className="flex items-center space-x-2 text-indigo-600">
            <Server className="w-4 h-4" />
            <h2 className="text-sm font-bold text-slate-900">NestJS Backend API Gateway</h2>
          </div>

          <form onSubmit={handleSaveBackendUrl} className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Backend Server Base URL
              </label>
              <input
                type="text"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                placeholder="https://communication.impmeet.com"
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-indigo-500 font-mono"
              />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-slate-500">
                Default API: <code className="bg-slate-100 px-1.5 py-0.5 rounded font-mono">https://communication.impmeet.com</code>
              </span>
              <button
                type="submit"
                className="flex items-center space-x-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold transition-colors shadow-xs"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Save & Reconnect</span>
              </button>
            </div>
            {savedSuccess && (
              <p className="text-xs text-emerald-600 font-bold">✓ Backend settings updated & WebSockets reconnected!</p>
            )}
          </form>
        </div>

        {/* Windows Native Settings */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4 shadow-2xs">
          <div className="flex items-center space-x-2 text-indigo-600">
            <Monitor className="w-4 h-4" />
            <h2 className="text-sm font-bold text-slate-900">Windows System Integration</h2>
          </div>

          <div className="space-y-3 text-xs">
            <label className="flex items-center justify-between p-3 rounded-lg bg-slate-50 border border-slate-200 cursor-pointer">
              <div className="space-y-0.5">
                <span className="font-bold text-slate-900 block">Minimize to System Tray</span>
                <span className="text-[11px] text-slate-500 block">Keep app running in Windows background tray when closed</span>
              </div>
              <input
                type="checkbox"
                checked={minimizeToTray}
                onChange={(e) => setMinimizeToTray(e.target.checked)}
                className="w-4 h-4 accent-indigo-600 rounded cursor-pointer"
              />
            </label>

            <label className="flex items-center justify-between p-3 rounded-lg bg-slate-50 border border-slate-200 cursor-pointer">
              <div className="space-y-0.5">
                <span className="font-bold text-slate-900 block">Native Windows OS Toast Notifications</span>
                <span className="text-[11px] text-slate-500 block">Receive Windows Action Center alerts for incoming messages & calls</span>
              </div>
              <input
                type="checkbox"
                checked={nativeNotifications}
                onChange={(e) => setNativeNotifications(e.target.checked)}
                className="w-4 h-4 accent-indigo-600 rounded cursor-pointer"
              />
            </label>

            <label className="flex items-center justify-between p-3 rounded-lg bg-slate-50 border border-slate-200 cursor-pointer">
              <div className="space-y-0.5">
                <span className="font-bold text-slate-900 block">Launch on Windows Startup</span>
                <span className="text-[11px] text-slate-500 block">Automatically start Comm Desktop when logging into Windows</span>
              </div>
              <input
                type="checkbox"
                checked={launchOnStartup}
                onChange={(e) => setLaunchOnStartup(e.target.checked)}
                className="w-4 h-4 accent-indigo-600 rounded cursor-pointer"
              />
            </label>
          </div>
        </div>
      </div>
    </div>
  );
};
