'use client';

import { toPlainText } from '../../../lib/mentions';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Bell,
  CalendarDays,
  CheckSquare,
  ChevronRight,
  Clock,
  FileText,
  Hash,
  MessageSquare,
  RefreshCw,
  Star,
  Users,
} from 'lucide-react';
import { dashboardAPI } from '../../../services/api';
import { formatDateTime, initials, avatarAccent, timeAgo } from '../_utils';

type DashboardTask = {
  id: string;
  title: string;
  priority: string;
  dueDate?: string | null;
  conversation?: { group?: { name?: string | null } | null };
};

type DashboardConversation = {
  conversationId: string;
  type: string;
  name: string;
  group?: { name?: string | null; teamName?: string | null; spaceType?: string | null } | null;
  lastMessage?: { content?: string | null; createdAt?: string | null } | null;
};

type DashboardEvent = {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string;
  teamName?: string | null;
};

type DashboardData = {
  workspace?: { name: string };
  stats: {
    conversations: number;
    unreadMessages: number;
    openTasks: number;
    files: number;
    upcomingEvents: number;
  };
  recentConversations: DashboardConversation[];
  upcomingEvents: DashboardEvent[];
  assignedTasks: DashboardTask[];
};

const statConfig = [
  {
    key: 'conversations',
    label: 'Conversations',
    icon: Hash,
    iconColor: 'text-blue-600',
    iconBg: 'bg-blue-50',
    accent: 'border-l-blue-500',
    href: '/teams',
  },
  {
    key: 'unreadMessages',
    label: 'Unread',
    icon: Bell,
    iconColor: 'text-rose-600',
    iconBg: 'bg-rose-50',
    accent: 'border-l-rose-500',
    href: '/activity',
  },
  {
    key: 'openTasks',
    label: 'Open Tasks',
    icon: Star,
    iconColor: 'text-amber-600',
    iconBg: 'bg-amber-50',
    accent: 'border-l-amber-500',
    href: '/teams',
  },
  {
    key: 'files',
    label: 'Files',
    icon: FileText,
    iconColor: 'text-emerald-600',
    iconBg: 'bg-emerald-50',
    accent: 'border-l-emerald-500',
    href: '/files',
  },
] as const;

const priorityDot: Record<string, string> = {
  URGENT: 'bg-red-500',
  IMPORTANT: 'bg-amber-500',
  NORMAL: 'bg-slate-300',
};

function formatEventTime(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);

  const isToday = d.toDateString() === today.toDateString();
  const isTomorrow = d.toDateString() === tomorrow.toDateString();

  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (isToday) return `Today · ${time}`;
  if (isTomorrow) return `Tomorrow · ${time}`;
  return formatDateTime(iso);
}

export default function HomePage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function loadDashboard() {
    setLoading(true);
    setError('');
    try {
      setData(await dashboardAPI.get());
    } catch {
      setError('Dashboard data could not be loaded.');
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(loadDashboard, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const workspaceName = data?.workspace?.name ?? 'Your workspace';

  return (
    <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-slate-50">
      <main className="flex-1 overflow-y-auto p-6 space-y-6">
        {error && (
          <div className="flex items-center justify-between rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <span>{error}</span>
            <button onClick={loadDashboard} className="font-semibold hover:text-red-900">Retry</button>
          </div>
        )}

        {/* Stat cards */}
        <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
          {statConfig.map((stat) => {
            const Icon = stat.icon;
            const value = data?.stats?.[stat.key] ?? 0;
            return (
              <Link
                key={stat.key}
                href={stat.href}
                className={`group flex items-center gap-4 rounded-xl border-l-4 border border-slate-200 bg-white p-5 shadow-sm transition hover:shadow-md ${stat.accent}`}
              >
                <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${stat.iconBg}`}>
                  <Icon className={`h-5 w-5 ${stat.iconColor}`} />
                </div>
                <div className="min-w-0">
                  <div className="text-2xl font-bold text-slate-950">
                    {loading ? <span className="inline-block h-7 w-8 animate-pulse rounded bg-slate-100" /> : value}
                  </div>
                  <div className="text-xs font-medium text-slate-500">{stat.label}</div>
                </div>
              </Link>
            );
          })}
        </div>

        {/* Main content grid */}
        <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">

          {/* Recent Conversations */}
          <section className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                <MessageSquare className="h-4 w-4 text-blue-500" />
                Recent Conversations
              </h3>
              <Link href="/teams" className="text-xs font-semibold text-blue-600 hover:text-blue-800">
                View all →
              </Link>
            </div>

            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              {loading ? (
                <div className="space-y-0 divide-y divide-slate-100">
                  {[...Array(4)].map((_, i) => (
                    <div key={i} className="flex items-center gap-3 px-4 py-3.5">
                      <div className="h-9 w-9 animate-pulse rounded-full bg-slate-100" />
                      <div className="flex-1 space-y-1.5">
                        <div className="h-3 w-32 animate-pulse rounded bg-slate-100" />
                        <div className="h-2.5 w-48 animate-pulse rounded bg-slate-100" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : data?.recentConversations?.length ? (
                <div className="divide-y divide-slate-100">
                  {data.recentConversations.map((convo) => (
                    <Link
                      key={convo.conversationId}
                      href={convo.type === 'DIRECT' ? `/dms?conversation=${convo.conversationId}` : `/teams?conversation=${convo.conversationId}`}
                      className="flex items-center gap-3 px-4 py-3.5 transition hover:bg-slate-50 group"
                    >
                      <div className={`relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold ${avatarAccent(convo.name)}`}>
                        {convo.type === 'DIRECT' ? initials(convo.name) : '#'}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-sm font-semibold text-slate-900">{convo.name}</span>
                          <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                            convo.type === 'DIRECT' ? 'bg-violet-50 text-violet-600' : 'bg-blue-50 text-blue-600'
                          }`}>
                            {convo.type === 'DIRECT' ? 'DM' : 'Channel'}
                          </span>
                        </div>
                        <p className="truncate text-xs text-slate-400 mt-0.5">
                          {convo.lastMessage?.content ? toPlainText(convo.lastMessage.content) : 'No messages yet'}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <span className="text-[11px] text-slate-400">{timeAgo(convo.lastMessage?.createdAt)}</span>
                        <ChevronRight className="h-3.5 w-3.5 text-slate-300 group-hover:text-slate-400 transition" />
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2 py-10 text-slate-400">
                  <MessageSquare className="h-8 w-8 text-slate-200" />
                  <p className="text-sm">No conversations yet.</p>
                </div>
              )}
            </div>
          </section>

          {/* Right column */}
          <div className="flex flex-col gap-6">

            {/* Upcoming Events */}
            <section className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                  <CalendarDays className="h-4 w-4 text-indigo-500" />
                  Upcoming
                </h3>
                <Link href="/calendar" className="text-xs font-semibold text-blue-600 hover:text-blue-800">
                  View all →
                </Link>
              </div>

              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                {loading ? (
                  <div className="divide-y divide-slate-100">
                    {[...Array(3)].map((_, i) => (
                      <div key={i} className="flex items-center gap-3 px-4 py-3.5">
                        <div className="h-8 w-1 animate-pulse rounded-full bg-slate-100" />
                        <div className="flex-1 space-y-1.5">
                          <div className="h-3 w-28 animate-pulse rounded bg-slate-100" />
                          <div className="h-2.5 w-20 animate-pulse rounded bg-slate-100" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : data?.upcomingEvents?.length ? (
                  <div className="divide-y divide-slate-100">
                    {data.upcomingEvents.map((event, i) => (
                      <Link
                        key={event.id}
                        href="/calendar"
                        className="flex items-center gap-3 px-4 py-3.5 hover:bg-slate-50 transition"
                      >
                        <div className={`h-8 w-1 shrink-0 rounded-full ${
                          i === 0 ? 'bg-indigo-500' : i === 1 ? 'bg-blue-400' : 'bg-slate-300'
                        }`} />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-semibold text-slate-900">{event.title}</div>
                          <div className="mt-0.5 flex items-center gap-1 text-xs text-slate-400">
                            <Clock className="h-3 w-3" />
                            {formatEventTime(event.startsAt)}
                          </div>
                        </div>
                        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-300" />
                      </Link>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2 py-8 text-slate-400">
                    <CalendarDays className="h-7 w-7 text-slate-200" />
                    <p className="text-sm">No upcoming events.</p>
                  </div>
                )}
              </div>
            </section>

            {/* Assigned Tasks */}
            <section className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                  <CheckSquare className="h-4 w-4 text-emerald-500" />
                  Assigned Tasks
                </h3>
                <Link href="/teams" className="text-xs font-semibold text-blue-600 hover:text-blue-800">
                  View all →
                </Link>
              </div>

              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                {loading ? (
                  <div className="divide-y divide-slate-100">
                    {[...Array(2)].map((_, i) => (
                      <div key={i} className="flex items-center gap-3 px-4 py-3.5">
                        <div className="h-2 w-2 animate-pulse rounded-full bg-slate-100" />
                        <div className="flex-1 space-y-1.5">
                          <div className="h-3 w-36 animate-pulse rounded bg-slate-100" />
                          <div className="h-2.5 w-20 animate-pulse rounded bg-slate-100" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : data?.assignedTasks?.length ? (
                  <div className="divide-y divide-slate-100">
                    {data.assignedTasks.map((task) => (
                      <Link
                        key={task.id}
                        href="/teams"
                        className="flex items-center gap-3 px-4 py-3.5 hover:bg-slate-50 transition"
                      >
                        <span className={`h-2 w-2 shrink-0 rounded-full ${priorityDot[task.priority] ?? 'bg-slate-300'}`} />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-semibold text-slate-900">{task.title}</div>
                          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-400">
                            {task.conversation?.group?.name && (
                              <span className="rounded bg-slate-100 px-1.5 py-0.5 font-medium text-slate-500">
                                #{task.conversation.group.name}
                              </span>
                            )}
                            {task.dueDate && (
                              <span className="flex items-center gap-0.5">
                                <Clock className="h-3 w-3" />
                                {formatDateTime(task.dueDate)}
                              </span>
                            )}
                          </div>
                        </div>
                        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-300" />
                      </Link>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2 py-8 text-slate-400">
                    <CheckSquare className="h-7 w-7 text-slate-200" />
                    <p className="text-sm">No assigned tasks.</p>
                  </div>
                )}
              </div>
            </section>

          </div>
        </div>
      </main>
    </div>
  );
}
