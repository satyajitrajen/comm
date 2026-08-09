import React, { useEffect, useState } from 'react';
import {
  Hash,
  Bell,
  Star,
  FileText,
  MessageSquare,
  ChevronRight,
  CalendarDays,
  Clock,
  CheckSquare,
  Sparkles,
  RefreshCw,
} from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { dashboardAPI } from '../api/api';
import { timeAgo, initials, avatarAccent } from '../utils/utils';

type DashboardData = {
  workspace?: { name: string };
  stats: {
    conversations: number;
    unreadMessages: number;
    openTasks: number;
    files: number;
    upcomingEvents: number;
  };
  recentConversations: Array<{
    conversationId: string;
    type: string;
    name: string;
    group?: { name?: string | null; teamName?: string | null } | null;
    lastMessage?: { content?: string | null; createdAt?: string | null } | null;
  }>;
  upcomingEvents: Array<{
    id: string;
    title: string;
    startsAt: string;
    endsAt: string;
    teamName?: string | null;
  }>;
  assignedTasks: Array<{
    id: string;
    title: string;
    priority: string;
    dueDate?: string | null;
    conversation?: { group?: { name?: string | null } | null };
  }>;
};

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
  return `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} · ${time}`;
}

export const HomeView: React.FC = () => {
  const { currentUser, setActiveTab, channels, directMessages, setActiveChannel, setActiveDM } = useAppStore();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadDashboard = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await dashboardAPI.get();
      setData(res);
    } catch (err) {
      console.warn('Dashboard fetch error:', err);
      setError('Dashboard data could not be loaded from API.');
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboard();
  }, []);

  const stats = [
    { key: 'conversations', label: 'Conversations', value: data?.stats?.conversations ?? (channels.length + directMessages.length), icon: Hash, iconBg: 'bg-blue-50', iconColor: 'text-blue-600', accent: 'border-l-blue-500', tab: 'channels' as const },
    { key: 'unreadMessages', label: 'Unread', value: data?.stats?.unreadMessages ?? 0, icon: Bell, iconBg: 'bg-rose-50', iconColor: 'text-rose-600', accent: 'border-l-rose-500', tab: 'activity' as const },
    { key: 'openTasks', label: 'Open Tasks', value: data?.stats?.openTasks ?? 0, icon: Star, iconBg: 'bg-amber-50', iconColor: 'text-amber-600', accent: 'border-l-amber-500', tab: 'calendar' as const },
    { key: 'files', label: 'Files', value: data?.stats?.files ?? 0, icon: FileText, iconBg: 'bg-emerald-50', iconColor: 'text-emerald-600', accent: 'border-l-emerald-500', tab: 'files' as const },
  ];

  return (
    <div className="flex-1 bg-slate-50 p-6 overflow-y-auto select-none">
      <div className="max-w-5xl mx-auto space-y-6">

        {/* Welcome Header */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-2xl p-6 shadow-md flex items-center justify-between">
          <div className="space-y-1">
            <div className="flex items-center space-x-2">
              <Sparkles className="w-5 h-5 text-amber-300" />
              <h1 className="text-xl font-bold">Welcome back, {currentUser?.name || 'User'}!</h1>
            </div>
            <p className="text-xs text-blue-100">
              {data?.workspace?.name || 'TeamTime Workspace'} • Full feature parity with Next.js web app.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={loadDashboard}
              disabled={loading}
              className="p-2 bg-white/10 hover:bg-white/20 text-white rounded-xl transition-colors"
              title="Refresh Dashboard"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={() => setActiveTab('dms')}
              className="px-4 py-2 bg-white text-blue-600 rounded-xl text-xs font-bold shadow-xs hover:bg-blue-50 transition-colors"
            >
              Open Chat
            </button>
          </div>
        </div>

        {error && (
          <div className="flex items-center justify-between rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700 font-semibold">
            <span>{error}</span>
            <button onClick={loadDashboard} className="hover:underline">Retry</button>
          </div>
        )}

        {/* 4 Stat Cards */}
        <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
          {stats.map((st) => {
            const Icon = st.icon;
            return (
              <button
                key={st.label}
                onClick={() => setActiveTab(st.tab)}
                className={`flex items-center space-x-4 rounded-xl border-l-4 border border-slate-200 bg-white p-4 shadow-2xs hover:shadow-xs transition-all text-left ${st.accent}`}
              >
                <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${st.iconBg}`}>
                  <Icon className={`h-5 w-5 ${st.iconColor}`} />
                </div>
                <div>
                  <div className="text-2xl font-bold text-slate-900">
                    {loading ? <span className="inline-block h-6 w-8 animate-pulse rounded bg-slate-100" /> : st.value}
                  </div>
                  <div className="text-xs font-semibold text-slate-500">{st.label}</div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Main Content Grid */}
        <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
          
          {/* Recent Conversations */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="flex items-center space-x-2 text-xs font-bold text-slate-700 uppercase tracking-wider">
                <MessageSquare className="h-4 w-4 text-blue-500" />
                <span>Recent Conversations</span>
              </h3>
              <button
                onClick={() => setActiveTab('channels')}
                className="text-xs font-bold text-blue-600 hover:text-blue-800"
              >
                View all →
              </button>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white shadow-2xs divide-y divide-slate-100 overflow-hidden min-h-[160px]">
              {loading ? (
                <div className="p-4 space-y-3">
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="flex items-center gap-3 animate-pulse">
                      <div className="w-9 h-9 rounded-full bg-slate-100" />
                      <div className="flex-1 space-y-1">
                        <div className="h-3 bg-slate-100 rounded w-24" />
                        <div className="h-2 bg-slate-100 rounded w-48" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : data?.recentConversations?.length ? (
                data.recentConversations.map((convo) => {
                  const targetChannel = channels.find((c) => c.id === convo.conversationId);
                  const targetDM = directMessages.find((d) => d.id === convo.conversationId);
                  return (
                    <button
                      key={convo.conversationId}
                      onClick={() => {
                        if (convo.type === 'DIRECT') {
                          if (targetDM) setActiveDM(targetDM);
                          setActiveTab('dms');
                        } else {
                          if (targetChannel) setActiveChannel(targetChannel);
                          setActiveTab('channels');
                        }
                      }}
                      className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50 transition-colors text-left group"
                    >
                      <div className="flex items-center space-x-3 min-w-0">
                        <div className={`w-9 h-9 rounded-full ${avatarAccent(convo.name)} flex items-center justify-center font-bold text-xs shrink-0`}>
                          {convo.type === 'DIRECT' ? initials(convo.name) : '#'}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center space-x-2">
                            <span className="font-bold text-xs text-slate-900 truncate">{convo.name}</span>
                            <span
                              className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
                                convo.type === 'DIRECT' ? 'bg-violet-50 text-violet-600' : 'bg-blue-50 text-blue-600'
                              }`}
                            >
                              {convo.type === 'DIRECT' ? 'DM' : 'Channel'}
                            </span>
                          </div>
                          <p className="text-xs text-slate-500 truncate mt-0.5">
                            {convo.lastMessage?.content || 'No messages yet'}
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-col items-end space-y-1 shrink-0 ml-3">
                        <span className="text-[10px] text-slate-400 font-medium">{timeAgo(convo.lastMessage?.createdAt)}</span>
                        <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-slate-500 transition-colors" />
                      </div>
                    </button>
                  );
                })
              ) : (
                <div className="flex flex-col items-center justify-center py-10 text-slate-400">
                  <MessageSquare className="h-8 w-8 text-slate-200 mb-1" />
                  <p className="text-xs italic">No active conversations found.</p>
                </div>
              )}
            </div>
          </section>

          {/* Right Column: Upcoming Events & Assigned Tasks */}
          <div className="space-y-6">
            
            {/* Upcoming Events */}
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="flex items-center space-x-2 text-xs font-bold text-slate-700 uppercase tracking-wider">
                  <CalendarDays className="h-4 w-4 text-indigo-500" />
                  <span>Upcoming Meetings</span>
                </h3>
                <button
                  onClick={() => setActiveTab('calendar')}
                  className="text-xs font-bold text-blue-600 hover:text-blue-800"
                >
                  View calendar →
                </button>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white shadow-2xs divide-y divide-slate-100 overflow-hidden min-h-[100px]">
                {loading ? (
                  <div className="p-3 space-y-2">
                    {[...Array(2)].map((_, i) => (
                      <div key={i} className="h-4 bg-slate-100 rounded animate-pulse" />
                    ))}
                  </div>
                ) : data?.upcomingEvents?.length ? (
                  data.upcomingEvents.map((ev, i) => (
                    <button
                      key={ev.id}
                      onClick={() => setActiveTab('calendar')}
                      className="w-full flex items-center space-x-3 px-4 py-3 hover:bg-slate-50 transition-colors text-left"
                    >
                      <div className={`h-8 w-1 rounded-full ${i === 0 ? 'bg-indigo-500' : i === 1 ? 'bg-blue-400' : 'bg-slate-300'} shrink-0`} />
                      <div className="min-w-0 flex-1">
                        <h4 className="text-xs font-bold text-slate-900 truncate">{ev.title}</h4>
                        <span className="text-[10px] text-slate-500 flex items-center space-x-1 mt-0.5">
                          <Clock className="w-3 h-3 text-slate-400" />
                          <span>{formatEventTime(ev.startsAt)}</span>
                        </span>
                      </div>
                    </button>
                  ))
                ) : (
                  <div className="flex flex-col items-center justify-center py-6 text-slate-400">
                    <CalendarDays className="h-6 w-6 text-slate-200 mb-1" />
                    <p className="text-xs italic">No upcoming meetings scheduled.</p>
                  </div>
                )}
              </div>
            </section>

            {/* Assigned Tasks */}
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="flex items-center space-x-2 text-xs font-bold text-slate-700 uppercase tracking-wider">
                  <CheckSquare className="h-4 w-4 text-emerald-500" />
                  <span>Assigned Tasks</span>
                </h3>
                <button
                  onClick={() => setActiveTab('calendar')}
                  className="text-xs font-bold text-blue-600 hover:text-blue-800"
                >
                  View all →
                </button>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white shadow-2xs divide-y divide-slate-100 overflow-hidden min-h-[100px]">
                {loading ? (
                  <div className="p-3 space-y-2">
                    {[...Array(2)].map((_, i) => (
                      <div key={i} className="h-4 bg-slate-100 rounded animate-pulse" />
                    ))}
                  </div>
                ) : data?.assignedTasks?.length ? (
                  data.assignedTasks.map((tsk) => (
                    <div key={tsk.id} className="flex items-center space-x-3 px-4 py-3 text-left">
                      <span className={`w-2 h-2 rounded-full ${priorityDot[tsk.priority] || 'bg-slate-300'} shrink-0`} />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold text-slate-900 truncate">{tsk.title}</p>
                        {tsk.conversation?.group?.name && (
                          <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-1.5 py-0.2 rounded mt-1 inline-block">
                            #{tsk.conversation.group.name}
                          </span>
                        )}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="flex flex-col items-center justify-center py-6 text-slate-400">
                    <CheckSquare className="h-6 w-6 text-slate-200 mb-1" />
                    <p className="text-xs italic">No assigned tasks.</p>
                  </div>
                )}
              </div>
            </section>

          </div>
        </div>

      </div>
    </div>
  );
};
