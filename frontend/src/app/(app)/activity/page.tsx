'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AtSign, Bell, BellOff, Check, CheckCheck, RefreshCw } from 'lucide-react';
import { notificationsAPI } from '../../../services/api';
import { getChatsFeedCached } from '../../../lib/chatsFeedCache';
import { timeAgo } from '../_utils';

type Notification = {
  id: string;
  title: string;
  body: string;
  isRead: boolean;
  notificationType: string;
  createdAt: string;
  resourceId?: string | null;
};

function typeIcon(type: string) {
  if (type === 'MENTION') return <AtSign className="h-4 w-4 text-blue-600" />;
  if (type === 'TASK_ASSIGNED') return <Check className="h-4 w-4 text-emerald-600" />;
  return <Bell className="h-4 w-4 text-violet-600" />;
}

function typeBg(type: string) {
  if (type === 'MENTION') return 'bg-blue-50';
  if (type === 'TASK_ASSIGNED') return 'bg-emerald-50';
  return 'bg-violet-50';
}

export default function ActivityPage() {
  const router = useRouter();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function loadNotifications() {
    setLoading(true);
    setError('');
    try {
      const data = await notificationsAPI.getAll();
      setNotifications(Array.isArray(data?.items) ? data.items : []);
    } catch {
      setError('Activity could not be loaded.');
      setNotifications([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      loadNotifications();
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  async function markAllRead() {
    const previous = notifications;
    setNotifications((current) => current.map((item) => ({ ...item, isRead: true })));
    try {
      await notificationsAPI.markAllRead();
    } catch {
      setNotifications(previous);
      setError('Notifications could not be marked read.');
    }
  }

  async function openNotification(notification: Notification) {
    if (!notification.isRead) {
      setNotifications((current) =>
        current.map((item) => (item.id === notification.id ? { ...item, isRead: true } : item)),
      );
      try {
        await notificationsAPI.markRead(notification.id);
      } catch {
        setError('Notification could not be marked read.');
      }
    }

    if (notification.notificationType === 'MENTION' && notification.resourceId) {
      try {
        const feed = await getChatsFeedCached();
        const row = Array.isArray(feed)
          ? feed.find((c) => c.conversationId === notification.resourceId)
          : undefined;
        const t = row?.type;
        if (t === 'DIRECT') {
          router.push(`/dms?conversation=${notification.resourceId}`);
        } else {
          router.push(`/teams?conversation=${notification.resourceId}`);
        }
      } catch {
        router.push(`/teams?conversation=${notification.resourceId}`);
      }
    } else if (
      notification.notificationType === 'SYSTEM_ALERT' &&
      (notification.title.includes('Event') || notification.body.includes('scheduled'))
    ) {
      router.push('/calendar');
    } else if (notification.notificationType === 'TASK_ASSIGNED') {
      router.push('/teams');
    }
  }

  const displayed = filter === 'unread' ? notifications.filter((item) => !item.isRead) : notifications;
  const unreadCount = notifications.filter((item) => !item.isRead).length;

  return (
    <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-slate-50">
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-6">
        <div className="flex items-center gap-3">
          <Bell className="h-5 w-5 text-blue-700" />
          <h1 className="text-lg font-bold text-slate-950">Activity</h1>
          {unreadCount > 0 && (
            <span className="rounded-full bg-blue-600 px-2 py-0.5 text-xs font-bold text-white">{unreadCount}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-slate-200 bg-white p-0.5">
            {(['all', 'unread'] as const).map((option) => (
              <button
                key={option}
                onClick={() => setFilter(option)}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold ${
                  filter === option ? 'bg-blue-700 text-white' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {option === 'all' ? 'All' : 'Unread'}
              </button>
            ))}
          </div>
          <button
            onClick={markAllRead}
            disabled={unreadCount === 0}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:text-slate-300"
          >
            <CheckCheck className="h-4 w-4" />
            Mark all read
          </button>
          <button
            onClick={loadNotifications}
            className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"
            title="Refresh activity"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-6">
        {error && (
          <div className="mb-4 flex items-center justify-between rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <span>{error}</span>
            <button onClick={loadNotifications} className="font-semibold hover:text-red-900">
              Retry
            </button>
          </div>
        )}

        {loading ? (
          <div className="rounded-xl border border-slate-200 bg-white p-8 text-sm text-slate-500">Loading activity...</div>
        ) : displayed.length === 0 ? (
          <div className="flex h-56 flex-col items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white text-slate-400">
            <BellOff className="h-10 w-10 text-slate-300" />
            <p className="text-sm">{filter === 'unread' ? 'No unread notifications' : "You're all caught up"}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {displayed.map((notification) => (
              <button
                key={notification.id}
                onClick={() => openNotification(notification)}
                className={`flex w-full items-start gap-4 rounded-xl border bg-white p-4 text-left transition hover:shadow-sm ${
                  notification.isRead ? 'border-slate-200 opacity-75 hover:opacity-100' : 'border-blue-200'
                }`}
              >
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${typeBg(notification.notificationType)}`}>
                  {typeIcon(notification.notificationType)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-3">
                    <span className="text-sm font-semibold text-slate-900">{notification.title}</span>
                    <span className="shrink-0 text-xs text-slate-400">{timeAgo(notification.createdAt)}</span>
                  </span>
                  <span className="mt-1 block text-sm leading-6 text-slate-600">{notification.body}</span>
                </span>
                {!notification.isRead && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-blue-600" />}
              </button>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
