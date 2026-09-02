'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  PhoneCall,
  Video,
  PhoneIncoming,
  PhoneOutgoing,
  PhoneMissed,
  Search,
} from 'lucide-react';
import { callsAPI, CallHistoryMessage, chatsAPI, usersAPI } from '../../../services/api';
import { createAppSocket } from '../../../lib/socket';
import { avatarAccent, initials, timeAgo } from '../_utils';
import { useCallStore } from '../../../store/useCallStore';
import { callRoomName } from '../../../lib/callRoom';

type DirectoryPerson = {
  userId: string;
  displayName: string;
  email?: string | null;
  department?: string | null;
};

type ChatItem = {
  conversationId: string;
  name?: string;
  type: string;
};

type CallRecord = {
  id: string;
  conversationId: string;
  targetName: string;
  targetType: 'channel' | 'direct';
  callerName: string;
  callType: 'SYSTEM_CALL_START' | 'SYSTEM_CALL_END' | 'SYSTEM_CALL_DECLINE' | string;
  createdAt: string;
  content: string;
};

function toCallRecord(message: CallHistoryMessage, feedMap: Map<string, ChatItem>): CallRecord {
  const feed = feedMap.get(message.conversationId);
  const targetName = feed?.name || message.conversation?.group?.name || 'Chat';
  const targetType = (feed?.type || message.conversation?.type) === 'DIRECT' ? 'direct' : 'channel';
  return {
    id: message.id,
    conversationId: message.conversationId,
    targetName,
    targetType,
    callerName: message.sender?.profile?.displayName || 'Workspace user',
    callType: message.messageType || 'SYSTEM_CALL_START',
    createdAt: message.createdAt,
    content: message.content || 'Call event',
  };
}

export default function CallsPage() {
  const [people, setPeople] = useState<DirectoryPerson[]>([]);
  const [chats, setChats] = useState<ChatItem[]>([]);
  const [callRecords, setCallRecords] = useState<CallRecord[]>([]);
  const [loading, setLoading] = useState(true);
  // Cursor paging state for scroll-down history loading.
  const [hasMoreCallRecords, setHasMoreCallRecords] = useState(false);
  const [callRecordsCursor, setCallRecordsCursor] = useState<string | null>(null);
  const [loadingMoreRecords, setLoadingMoreRecords] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterTab, setFilterTab] = useState<'all' | 'missed' | 'channels' | 'direct'>('all');
  const [callStartError, setCallStartError] = useState<string | null>(null);
  const pageScrollRef = useRef<HTMLDivElement | null>(null);

  const currentUserId = useMemo(() => {
    if (typeof window === 'undefined') return '';
    try {
      const userStr = localStorage.getItem('veloce_user');
      return userStr ? JSON.parse(userStr).id || '' : '';
    } catch {
      return '';
    }
  }, []);

  const currentUserName = useMemo(() => {
    if (typeof window === 'undefined') return 'Me';
    try {
      const userStr = localStorage.getItem('veloce_user');
      return userStr ? JSON.parse(userStr).displayName || 'Me' : 'Me';
    } catch {
      return 'Me';
    }
  }, []);

  const startOutgoingCall = useCallStore((state) => state.startOutgoingCall);

  /** Feed lookups give call records their display name and direct/channel type. */
  const feedMap = useMemo(
    () => new Map<string, ChatItem>(chats.map((chat) => [chat.conversationId, chat])),
    [chats],
  );

  useEffect(() => {
    async function loadCallsData() {
      setLoading(true);
      try {
        const [peopleRes, chatsRes, historyRes] = await Promise.all([
          usersAPI.getDirectory().catch(() => []),
          chatsAPI.getFeed().catch(() => []),
          callsAPI.getHistory().catch(() => null),
        ]);

        const peopleList = Array.isArray(peopleRes) ? peopleRes : [];
        const chatsList = Array.isArray(chatsRes) ? chatsRes : [];
        setPeople(peopleList);
        setChats(chatsList as ChatItem[]);

        // Newest-first page, same order the history log renders in.
        // Build the lookup locally: `feedMap` in state is still the empty map
        // on this render.
        const lookup = new Map<string, ChatItem>(
          (chatsList as ChatItem[]).map((chat) => [chat.conversationId, chat]),
        );
        setCallRecords((historyRes?.messages || []).map((m) => toCallRecord(m, lookup)));
        setHasMoreCallRecords(!!historyRes?.hasMore);
        setCallRecordsCursor(historyRes?.nextCursor ?? null);
      } catch (err) {
        console.error('Failed to load calls data:', err);
      } finally {
        setLoading(false);
      }
    }

    void loadCallsData();
  }, []);

  // Listen for live call events from WebSocket
  useEffect(() => {
    const socket = createAppSocket();
    if (!socket) return;

    socket.on('message.sent', (message: CallHistoryMessage) => {
      if (
        message?.messageType?.startsWith('SYSTEM_CALL') ||
        message?.messageType?.startsWith('CALL')
      ) {
        setCallRecords((current) => {
          if (current.some((r) => r.id === message.id)) return current;
          return [toCallRecord(message, feedMap), ...current];
        });
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [feedMap]);

  // When the page has no scrollbar yet (short first page), keep pulling pages
  // until it fills the viewport or history is exhausted.
  useEffect(() => {
    const el = pageScrollRef.current;
    if (!el || loading || !hasMoreCallRecords || loadingMoreRecords) return;
    if (el.scrollHeight <= el.clientHeight) {
      void loadMoreCallRecords();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callRecords, hasMoreCallRecords, loadingMoreRecords, loading]);

  /** Appends the next page of older call records, newest-first order. */
  async function loadMoreCallRecords() {
    if (!callRecordsCursor || loadingMoreRecords) return;

    setLoadingMoreRecords(true);
    try {
      const page = await callsAPI.getHistory({ before: callRecordsCursor });
      const older = (page?.messages || []).map((m) => toCallRecord(m, feedMap));
      if (older.length > 0) {
        setCallRecords((current) => {
          const seen = new Set(current.map((r) => r.id));
          return [...current, ...older.filter((r) => !seen.has(r.id))];
        });
      }
      setHasMoreCallRecords(!!page?.hasMore);
      setCallRecordsCursor(page?.nextCursor ?? null);
    } catch {
      // Keep the cursor untouched so a retry on the next scroll works.
    } finally {
      setLoadingMoreRecords(false);
    }
  }

  const filteredPeopleAndChats = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    const matchedPeople = people
      .filter((p) => p.userId !== currentUserId)
      .filter((p) => p.displayName.toLowerCase().includes(q) || (p.email || '').toLowerCase().includes(q))
      .map((p) => ({ id: p.userId, name: p.displayName, type: 'person' as const, sub: p.email || p.department || 'User' }));

    const matchedChats = chats
      .filter((c) => (c.name || '').toLowerCase().includes(q))
      .map((c) => ({ id: c.conversationId, name: c.name || 'Channel', type: 'channel' as const, sub: 'Channel' }));

    return [...matchedPeople, ...matchedChats];
  }, [searchQuery, people, chats, currentUserId]);

  const activeCallRecords = useMemo(() => {
    // Only count conversations where the latest call event is SYSTEM_CALL_START
    const latestByConv = new Map<string, CallRecord>();
    for (const record of callRecords) {
      if (!latestByConv.has(record.conversationId)) {
        latestByConv.set(record.conversationId, record);
      }
    }
    return Array.from(latestByConv.values()).filter((r) => r.callType === 'SYSTEM_CALL_START');
  }, [callRecords]);

  const filteredHistory = useMemo(() => {
    return callRecords.filter((r) => {
      if (filterTab === 'missed') return r.callType === 'SYSTEM_CALL_DECLINE';
      if (filterTab === 'channels') return r.targetType === 'channel';
      if (filterTab === 'direct') return r.targetType === 'direct';
      return true;
    });
  }, [callRecords, filterTab]);

  async function handleStartCall(target: { id: string; name: string; type: 'person' | 'channel' }) {
    try {
      let conversationId = target.id;
      if (target.type === 'person') {
        const conversation = await chatsAPI.createDirect(target.id);
        conversationId = conversation.id || conversation.conversationId;
      }
      const roomName = callRoomName(conversationId);
      startOutgoingCall(conversationId, roomName, target.name, currentUserName);
    } catch {
      setCallStartError('Could not start this call.');
    }
  }

  return (
    <div
      ref={pageScrollRef}
      onScroll={(event) => {
        const el = event.currentTarget;
        // Near the bottom and more history exists -> fetch the next page.
        if (el.scrollHeight - el.scrollTop - el.clientHeight < 400 && hasMoreCallRecords && !loadingMoreRecords) {
          void loadMoreCallRecords();
        }
      }}
      className="flex h-full w-full flex-col bg-slate-50 overflow-y-auto p-6 md:p-8 space-y-8"
    >
      {/* Top Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border border-slate-200/80 bg-white p-6 rounded-2xl shadow-sm w-full">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-600 text-white shadow-md shadow-emerald-500/20">
            <PhoneCall className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-950">Calls & Huddles</h1>
            <p className="text-xs text-slate-500 mt-0.5">Start instant video/voice calls and review workspace call logs.</p>
          </div>
        </div>

      {callStartError && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">
          {callStartError}
        </div>
      )}

        {/* Quick Dial Search */}
        <div className="relative w-full sm:w-96">
          <Search className="absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search person or channel to call..."
            className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-4 text-xs outline-none focus:border-emerald-500 focus:bg-white transition"
          />

          {/* Quick Search Dropdown */}
          {searchQuery.trim() && (
            <div className="absolute top-12 left-0 right-0 z-30 rounded-2xl border border-slate-200 bg-white p-2 shadow-2xl space-y-1">
              {filteredPeopleAndChats.length === 0 ? (
                <div className="p-3 text-center text-xs text-slate-400">No match found</div>
              ) : (
                filteredPeopleAndChats.slice(0, 6).map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between rounded-xl p-2.5 hover:bg-slate-50 transition cursor-pointer"
                    onClick={() => {
                      handleStartCall(item);
                      setSearchQuery('');
                    }}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${avatarAccent(item.name)}`}>
                        {initials(item.name)}
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-slate-900 truncate">{item.name}</div>
                        <div className="text-[10px] text-slate-400 truncate">{item.sub}</div>
                      </div>
                    </div>
                    <button className="flex items-center gap-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1 text-[11px] font-bold shadow-sm transition">
                      <Video className="h-3.5 w-3.5" />
                      <span>Call</span>
                    </button>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      {/* Ongoing Live Calls Section */}
      {activeCallRecords.length > 0 && (
        <section className="space-y-3 w-full">
          <div className="flex items-center gap-2">
            <span className="relative flex h-3 w-3">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-3 w-3 rounded-full bg-emerald-500" />
            </span>
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">Live Ongoing Calls ({activeCallRecords.length})</h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-4 gap-4 w-full">
            {activeCallRecords.map((record) => (
              <div key={record.id} className="rounded-2xl border border-emerald-200/80 bg-gradient-to-br from-emerald-50/80 via-white to-emerald-50/20 p-5 shadow-sm flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-600 text-white shadow">
                    <Video className="h-5.5 w-5.5" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-slate-900 truncate">#{record.targetName}</div>
                    <div className="text-xs text-slate-500 truncate mt-0.5">Started by {record.callerName} • {timeAgo(record.createdAt)}</div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    useCallStore.getState().joinCall(
                      record.conversationId,
                      callRoomName(record.conversationId),
                      `#${record.targetName}`,
                    );
                  }}
                  className="flex items-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 text-xs font-bold shadow transition active:scale-95 cursor-pointer shrink-0"
                >
                  <Video className="h-4 w-4" />
                  <span>Join Call</span>
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Main Call History & Log Section */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-6 w-full flex-1">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div>
            <h2 className="text-base font-bold text-slate-950">Call History Log</h2>
            <p className="text-xs text-slate-500 mt-0.5">All voice and video calls logged across your channels and DMs.</p>
          </div>

          {/* Filter Pills */}
          <div className="flex items-center gap-1.5 rounded-xl bg-slate-100 p-1">
            {(['all', 'missed', 'channels', 'direct'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setFilterTab(tab)}
                className={`rounded-lg px-3 py-1.5 text-xs font-bold capitalize transition ${
                  filterTab === tab ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="py-16 text-center text-sm text-slate-400">Loading call history logs…</div>
        ) : filteredHistory.length === 0 ? (
          <div className="flex h-56 flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-200 bg-slate-50 text-slate-400">
            <PhoneCall className="h-10 w-10 text-slate-300" />
            <p className="text-sm font-semibold">No call records found</p>
            <p className="text-xs text-slate-400">When calls take place in DMs or channels, they will be archived here.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 w-full">
            {filteredHistory.map((record) => {
              const isDeclined = record.callType === 'SYSTEM_CALL_DECLINE';
              const isStart = record.callType === 'SYSTEM_CALL_START';
              return (
                <div key={record.id} className="flex items-center justify-between py-3.5 px-3 hover:bg-slate-50/70 rounded-xl transition w-full">
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl font-bold ${
                        isDeclined
                          ? 'bg-red-50 text-red-600'
                          : isStart
                          ? 'bg-emerald-50 text-emerald-600'
                          : 'bg-blue-50 text-blue-600'
                      }`}
                    >
                      {isDeclined ? (
                        <PhoneMissed className="h-5 w-5" />
                      ) : isStart ? (
                        <PhoneIncoming className="h-5 w-5" />
                      ) : (
                        <PhoneOutgoing className="h-5 w-5" />
                      )}
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-slate-900 truncate">{record.targetName}</span>
                        <span
                          className={`rounded-full px-2 py-0.2 text-[10px] font-bold uppercase ${
                            record.targetType === 'channel' ? 'bg-violet-100 text-violet-700' : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {record.targetType}
                        </span>
                      </div>
                      <div className="text-xs text-slate-500 truncate mt-0.5">
                        {record.content} • {record.callerName} • {timeAgo(record.createdAt)}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                        isDeclined
                          ? 'bg-red-100 text-red-700'
                          : isStart
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {isDeclined ? 'DECLINED' : isStart ? 'STARTED' : 'COMPLETED'}
                    </span>

                    <button
                      type="button"
                      onClick={() => {
                        startOutgoingCall(record.conversationId, callRoomName(record.conversationId), record.targetName, currentUserName);
                      }}
                      className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-300 transition shadow-sm"
                    >
                      <Video className="h-3.5 w-3.5 text-emerald-600" />
                      <span>Call Back</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {loadingMoreRecords && (
          <div className="py-3 text-center text-xs text-slate-400">Loading more call history...</div>
        )}
      </section>
    </div>
  );
}
