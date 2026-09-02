'use client';

import { useEffect, useState } from 'react';
import {
  AppWindow,
  Search,
  MessageSquare,
  Shield,
  Wallet,
  FolderOpen,
  ArrowUpRight,
  Globe,
  RefreshCw,
} from 'lucide-react';
import { appsAPI } from '../../../services/api';

type AppIntegration = {
  id: string;
  name: string;
  category: string;
  description: string;
  isConnected: boolean;
};

const APP_CONFIG: Record<
  string,
  {
    icon: React.ComponentType<{ className?: string }>;
    iconBg: string;
    category: string;
    url: string;
    titleColor?: string;
  }
> = {
  'teamtime.live': {
    icon: MessageSquare,
    iconBg: 'bg-[#2563eb]',
    category: 'Communication',
    url: 'https://teamtime.live',
    titleColor: 'text-[#2563eb]',
  },
  'it.imperativepulse.in': {
    icon: Shield,
    iconBg: 'bg-[#059669]',
    category: 'Operations',
    url: 'https://it.imperativepulse.in',
    titleColor: 'text-slate-900',
  },
  'spendmint.ibvl.in': {
    icon: Wallet,
    iconBg: 'bg-[#f97316]',
    category: 'Finance',
    url: 'https://spendmint.ibvl.in',
    titleColor: 'text-slate-900',
  },
  'kagazhub.ibvl.in': {
    icon: FolderOpen,
    iconBg: 'bg-[#9333ea]',
    category: 'Documentation',
    url: 'https://kagazhub.ibvl.in',
    titleColor: 'text-slate-900',
  },
};

const DEFAULT_CONFIG = {
  icon: AppWindow,
  iconBg: 'bg-indigo-600',
  category: 'Tools',
  url: '',
  titleColor: 'text-slate-900',
};

const FALLBACK_APPS: AppIntegration[] = [
  {
    id: 'app-teamtime',
    name: 'teamtime.live',
    category: 'Communication',
    description:
      'Sleek and unified workspace communication platform for messaging, files, and high-fidelity video calls.',
    isConnected: true,
  },
  {
    id: 'app-it-portal',
    name: 'it.imperativepulse.in',
    category: 'Operations',
    description:
      'Central IT management hub and operations dashboard for tracking infrastructure status and developer tooling.',
    isConnected: true,
  },
  {
    id: 'app-spendmint',
    name: 'spendmint.ibvl.in',
    category: 'Finance',
    description:
      'Smart financial management and expense tracking portal for corporate teams, billing, and budgeting.',
    isConnected: true,
  },
  {
    id: 'app-kagazhub',
    name: 'kagazhub.ibvl.in',
    category: 'Documentation',
    description:
      'Secure cloud document repository and collaboration workspace for team knowledgebases and records.',
    isConnected: true,
  },
];

export default function AppsPage() {
  const [apps, setApps] = useState<AppIntegration[]>(FALLBACK_APPS);
  const [query, setQuery] = useState('');
  const [, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function loadApps() {
    setLoading(true);
    setError('');
    try {
      const data = await appsAPI.getAll();
      if (Array.isArray(data) && data.length > 0) {
        setApps(data);
      } else {
        setApps(FALLBACK_APPS);
      }
    } catch {
      // Use fallback list gracefully if backend is offline/unreachable
      setApps(FALLBACK_APPS);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadApps();
  }, []);

  const filtered = apps.filter((app) => {
    const search = query.trim().toLowerCase();
    const config = APP_CONFIG[app.name] || DEFAULT_CONFIG;
    return (
      !search ||
      `${app.name} ${app.category} ${app.description} ${config.url}`
        .toLowerCase()
        .includes(search)
    );
  });

  return (
    <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-slate-50/60">
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-slate-200/80 bg-white px-6">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
            <AppWindow className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-950">Apps</h1>
            <p className="text-xs text-slate-500">Integrations connected to your workspace.</p>
          </div>
        </div>
        <button
          onClick={loadApps}
          className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </button>
      </header>

      <div className="border-b border-slate-200/80 bg-white px-6 py-4">
        <div className="relative max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-4 text-sm outline-none transition-all focus:border-indigo-500 focus:bg-white focus:ring-2 focus:ring-indigo-500/10"
            placeholder="Search integrations..."
          />
        </div>
      </div>

      <main className="flex-1 overflow-y-auto p-6 md:p-8">
        {error && (
          <div className="mb-4 flex items-center justify-between rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <span>{error}</span>
            <button onClick={loadApps} className="font-semibold hover:text-red-900">
              Retry
            </button>
          </div>
        )}

        {filtered.length === 0 ? (
          <div className="flex h-56 flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-slate-300 bg-white text-slate-400">
            <AppWindow className="h-10 w-10 text-slate-300" />
            <p className="text-sm font-medium">No integrations found.</p>
          </div>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {filtered.map((app) => {
              const config = APP_CONFIG[app.name] || DEFAULT_CONFIG;
              const Icon = config.icon;
              const targetUrl = config.url || `https://${app.name}`;

              return (
                <div
                  key={app.id || app.name}
                  className="relative flex flex-col justify-between rounded-3xl border border-slate-200/80 bg-white p-7 shadow-sm hover:shadow-md transition-all duration-200"
                >
                  <div>
                    {/* Header: Icon & Category pill */}
                    <div className="flex items-start justify-between">
                      <div
                        className={`flex h-12 w-12 items-center justify-center rounded-2xl ${config.iconBg} text-white shadow-sm`}
                      >
                        <Icon className="h-6 w-6" />
                      </div>
                      <span className="rounded-full bg-slate-50 border border-slate-200/60 px-3.5 py-1 text-xs font-semibold text-slate-600">
                        {app.category || config.category}
                      </span>
                    </div>

                    {/* Body: Title, URL, and Description */}
                    <div className="mt-5">
                      <h2 className={`text-base font-bold tracking-tight ${config.titleColor || 'text-slate-900'}`}>
                        {app.name}
                      </h2>
                      <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-400">
                        <Globe className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                        <span className="truncate">{targetUrl}</span>
                      </div>
                      <p className="mt-4 text-xs leading-relaxed text-slate-500 font-normal">
                        {app.description}
                      </p>
                    </div>
                  </div>

                  {/* Footer: Open Application Link & Button */}
                  <div className="mt-8 flex items-center justify-between border-t border-slate-100/90 pt-4">
                    <a
                      href={targetUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 underline underline-offset-4 transition-colors"
                    >
                      Open Application
                    </a>
                    <a
                      href={targetUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex h-7 w-7 items-center justify-center rounded-full bg-indigo-50 text-indigo-600 hover:bg-indigo-600 hover:text-white transition-all shadow-sm"
                      title={`Open ${app.name}`}
                    >
                      <ArrowUpRight className="h-3.5 w-3.5" />
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
