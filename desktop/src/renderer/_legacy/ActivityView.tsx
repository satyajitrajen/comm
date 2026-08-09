import React, { useEffect, useState } from 'react';
import { Bell, BellOff, AtSign, Check, CheckCheck, RefreshCw } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { notificationsAPI } from '../api/api';
import { timeAgo } from '../utils/utils';

type NotificationItem = {
  id: string;
  title: string;
  body: string;
  isRead: boolean;
  notificationType: string;
  createdAt: string;
  resourceId?: string | null;
};

export const ActivityView: React.FC = () => {
  const { setActiveTab } = useAppStore();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadNotifications = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await notificationsAPI.getAll();
      const items = Array.isArray(data?.items) ? data.items : Array.isArray(data) ? data : [];
      setNotifications(items);
    } catch (err) {
      console.warn('Failed to load notifications from API:', err);
      setNotifications([]);
      setError('Activity feed could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadNotifications();
  }, []);

  const markAllRead = async () => {
    const prev = [...notifications];
    setNotifications((curr) => curr.map((n) => ({ ...n, isRead: true })));
    try {
      await notificationsAPI.markAllRead();
    } catch {
      setNotifications(prev);
    }
  };

  const handleNotificationClick = async (n: NotificationItem) => {
    if (!n.isRead) {
      setNotifications((curr) => curr.map((item) => (item.id === n.id ? { ...item, isRead: true } : item)));
      try {
        await notificationsAPI.markRead(n.id);
      } catch (err) {
        console.warn('Failed to mark read:', err);
      }
    }

    if (n.notificationType === 'MENTION') {
      setActiveTab('dms');
    } else if (n.notificationType === 'TASK_ASSIGNED') {
      setActiveTab('teams');
    } else if (n.notificationType === 'SYSTEM_ALERT') {
      setActiveTab('calendar');
    }
  };

  const displayed = filter === 'unread' ? notifications.filter((n) => !n.isRead) : notifications;
  const unreadCount = notifications.filter((n) => !n.isRead).length;

  const typeIcon = (type: string) => {
    if (type === 'MENTION') return <AtSign className="h-4 w-4 text-blue-600" />;
    if (type === 'TASK_ASSIGNED') return <Check className="h-4 w-4 text-emerald-600" />;
    return <Bell className="h-4 w-4 text-indigo-600" />;
  };

  const typeBg = (type: string) => {
    if (type === 'MENTION') return 'bg-blue-50';
    if (type === 'TASK_ASSIGNED') return 'bg-emerald-50';
    return 'bg-indigo-50';
  };

  return (
    <div className="flex flex-1 flex-col h-full overflow-hidden bg-slate-50 select-none">
      {/* Header Bar */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-6">
        <div className="flex items-center gap-3">
          <Bell className="h-5 w-5 text-indigo-600" />
          <h1 className="text-base font-bold text-slate-900">Activity & Notifications</h1>
          {unreadCount > 0 && (
            <span className="rounded-full bg-indigo-600 px-2 py-0.5 text-xs font-bold text-white">{unreadCount}</span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-slate-200 bg-white p-0.5">
            {(['all', 'unread'] as const).map((opt) => (
              <button
                key={opt}
                onClick={() => setFilter(opt)}
                className={`rounded-md px-3 py-1 text-xs font-bold transition-colors ${
                  filter === opt ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {opt === 'all' ? 'All' : 'Unread'}
              </button>
            ))}
          </div>
          <button
            onClick={markAllRead}
            disabled={unreadCount === 0}
            className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40 transition-colors"
          >
            <CheckCheck className="h-3.5 w-3.5" />
            <span>Mark all read</span>
          </button>
          <button
            onClick={loadNotifications}
            disabled={loading}
            className="rounded-lg border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-colors"
            title="Refresh activity"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </header>

      {/* Main Activity Feed Stream */}
      <main className="flex-1 overflow-y-auto p-6">
        {error && (
          <div className="mb-4 flex items-center justify-between rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700 font-semibold">
            <span>{error}</span>
            <button onClick={loadNotifications} className="hover:underline">
              Retry
            </button>
          </div>
        )}

        {loading ? (
          <div className="rounded-xl border border-slate-200 bg-white p-8 text-sm text-slate-500">Loading notifications...</div>
        ) : displayed.length === 0 ? (
          <div className="flex h-56 flex-col items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white text-slate-400">
            <BellOff className="h-10 w-10 text-slate-300" />
            <p className="text-sm font-semibold">{filter === 'unread' ? 'No unread notifications' : "You're all caught up!"}</p>
          </div>
        ) : (
          <div className="max-w-3xl mx-auto space-y-2">
            {displayed.map((n) => (
              <button
                key={n.id}
                onClick={() => handleNotificationClick(n)}
                className={`flex w-full items-start gap-4 rounded-xl border bg-white p-4 text-left transition hover:shadow-2xs ${
                  n.isRead ? 'border-slate-200 opacity-80 hover:opacity-100' : 'border-indigo-300 ring-1 ring-indigo-500/10'
                }`}
              >
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${typeBg(n.notificationType)}`}>
                  {typeIcon(n.notificationType)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-3">
                    <span className="text-xs font-bold text-slate-900">{n.title}</span>
                    <span className="shrink-0 text-[10px] font-semibold text-slate-400">{timeAgo(n.createdAt)}</span>
                  </span>
                  <span className="mt-1 block text-xs leading-relaxed text-slate-600">{n.body}</span>
                </span>
                {!n.isRead && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-indigo-600" />}
              </button>
            ))}
          </div>
        )}
      </main>
    </div>
  );
};
