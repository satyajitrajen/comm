'use client';

import { useEffect, useState } from 'react';
import { Monitor } from 'lucide-react';
import { isElectronDesktop } from '../../lib/desktopRuntime';

/**
 * Desktop-only settings. Renders nothing in a normal browser, and nothing in
 * an older desktop shell that does not expose the login-item API.
 */
export default function DesktopPreferences() {
  const [available, setAvailable] = useState(false);
  const [launchAtLogin, setLaunchAtLogin] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const api = window.electronAPI;
    if (!isElectronDesktop() || !api?.getLoginItem) return;
    setAvailable(true);
    void api.getLoginItem().then(setLaunchAtLogin).catch(() => {});
  }, []);

  if (!available) return null;

  async function toggle(next: boolean) {
    setSaving(true);
    try {
      // The OS is the source of truth; reflect what it actually recorded.
      const applied = await window.electronAPI?.setLoginItem?.(next);
      setLaunchAtLogin(Boolean(applied));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="flex items-center gap-2">
        <Monitor className="h-4 w-4 text-slate-500" />
        <h2 className="text-sm font-semibold text-slate-900">Desktop app</h2>
      </div>
      <label className="mt-4 flex cursor-pointer items-start justify-between gap-4">
        <span>
          <span className="block text-sm font-medium text-slate-800">Open TeamTime at login</span>
          <span className="mt-0.5 block text-xs text-slate-500">
            Starts minimized to the tray so messages and calls reach you right away.
          </span>
        </span>
        <input
          type="checkbox"
          role="switch"
          aria-checked={launchAtLogin}
          checked={launchAtLogin}
          disabled={saving}
          onChange={(event) => void toggle(event.target.checked)}
          className="mt-1 h-4 w-4 accent-blue-600"
        />
      </label>
    </section>
  );
}
