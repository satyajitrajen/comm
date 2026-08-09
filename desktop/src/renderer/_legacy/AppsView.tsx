import React, { useEffect, useState } from 'react';
import { AppWindow, CheckCircle, RefreshCw } from 'lucide-react';
import { appsAPI } from '../api/api';

export const AppsView: React.FC = () => {
  const [apiApps, setApiApps] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchApps = async () => {
    setLoading(true);
    try {
      const data = await appsAPI.getAll();
      if (Array.isArray(data)) {
        setApiApps(data);
      }
    } catch (err) {
      console.warn('Failed to fetch apps from API, using fallback list:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchApps();
  }, []);

  const handleToggle = async (id: string) => {
    try {
      await appsAPI.toggle(id);
      await fetchApps();
    } catch (err) {
      console.error('Failed to toggle app integration:', err);
    }
  };

  const fallbackApps = [
    { id: 'app_1', name: 'GitHub Integration', category: 'Developer Tools', desc: 'Receive pull request reviews and commit WebSockets in channels.', connected: true },
    { id: 'app_2', name: 'Figma Specs', category: 'Design', desc: 'Preview Figma design component tokens directly in chat.', connected: true },
    { id: 'app_3', name: 'Jira Workspaces', category: 'Project Management', desc: 'Sync Jira issues and sprint tasks with team channels.', connected: false },
    { id: 'app_4', name: 'Google Drive', category: 'Cloud Storage', desc: 'Attach and share Drive files directly in direct messages.', connected: false },
  ];

  const displayApps = apiApps.length > 0
    ? apiApps.map((a) => ({
        id: a.id,
        name: a.name,
        category: a.category || 'Extension',
        desc: a.description || 'Workspace extension',
        connected: Boolean(a.isEnabled || a.connected),
      }))
    : fallbackApps;

  return (
    <div className="flex-1 bg-slate-50 p-6 overflow-y-auto select-none">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between border-b border-slate-200 pb-4">
          <div>
            <h1 className="text-xl font-bold text-slate-900 flex items-center space-x-2">
              <AppWindow className="w-5 h-5 text-indigo-600" />
              <span>Workspace Integrations & Apps</span>
            </h1>
            <p className="text-xs text-slate-500 mt-1">
              Connect external services, developer bots, and productivity extensions.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {displayApps.map((a) => (
            <div key={a.id} className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col justify-between shadow-2xs space-y-3">
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-100">
                    {a.category}
                  </span>
                  {a.connected && (
                    <span className="text-[10px] font-bold text-emerald-600 flex items-center space-x-1">
                      <CheckCircle className="w-3 h-3" />
                      <span>Connected</span>
                    </span>
                  )}
                </div>
                <h3 className="text-sm font-bold text-slate-900 mt-2">{a.name}</h3>
                <p className="text-xs text-slate-500 mt-1">{a.desc}</p>
              </div>

              <button
                onClick={() => handleToggle(a.id)}
                className={`w-full py-1.5 rounded-lg text-xs font-bold transition-colors ${
                  a.connected
                    ? 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    : 'bg-indigo-600 text-white hover:bg-indigo-500 shadow-xs'
                }`}
              >
                {a.connected ? 'Configure Integration' : 'Connect Extension'}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
