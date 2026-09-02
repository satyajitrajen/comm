'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Mail, MessageSquare, RefreshCw, Search, Users, X } from 'lucide-react';
import { chatsAPI, usersAPI, adminAPI } from '../../../services/api';
import { createAppSocket } from '../../../lib/socket';
import { avatarAccent, initials } from '../_utils';
import { isOnline, statusDotClass, statusLabel } from '../../../lib/statusAvailability';
import { roleLabel } from '../../../lib/enumLabels';
import { sanitizeName } from '../../../lib/nameValidation';

type Person = {
  userId: string;
  displayName: string;
  email?: string | null;
  phoneNumber?: string | null;
  role?: string | null;
  department?: string | null;
  presence?: string | null;
  availability?: string | null;
  aboutText?: string | null;
  avatarUrl?: string | null;
};

export default function PeoplePage() {
  const router = useRouter();
  const [people, setPeople] = useState<Person[]>([]);
  const [query, setQuery] = useState('');
  const [department, setDepartment] = useState('All');
  const [statusFilter, setStatusFilter] = useState<'all' | 'online' | 'offline'>('all');
  const [selected, setSelected] = useState<Person | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [creatingChat, setCreatingChat] = useState(false);

  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const q = params.get('q');
      if (q) setQuery(q);
      const status = params.get('status');
      if (status === 'online' || status === 'offline') {
        setStatusFilter(status);
      } else if (params.get('online') === 'true' || params.get('filter') === 'online') {
        setStatusFilter('online');
      } else if (params.get('offline') === 'true' || params.get('filter') === 'offline') {
        setStatusFilter('offline');
      }
    } catch {
      /* ignore */
    }
  }, []);

  async function loadPeople() {
    setLoading(true);
    setError('');
    try {
      let isAdmin = false;
      try {
        const u = JSON.parse(localStorage.getItem('veloce_user') || '{}');
        isAdmin = !!u.isAdmin;
      } catch {
        /* ignore */
      }
      const data = isAdmin
        ? await adminAPI.getUsers()
        : await usersAPI.getDirectory();
      setPeople(Array.isArray(data) ? data : []);
    } catch {
      setError('People could not be loaded.');
      setPeople([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      loadPeople();
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  // Live WebSocket presence update
  useEffect(() => {
    const socket = createAppSocket();
    if (!socket) return;

    socket.on('user.presence', (data: { userId: string; presence?: string; isOnline?: boolean }) => {
      if (!data?.userId) return;
      setPeople((prev) =>
        prev.map((p) =>
          p.userId === data.userId
            ? { ...p, presence: data.presence || (data.isOnline ? 'ONLINE' : 'OFFLINE') }
            : p,
        ),
      );
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  const departments = useMemo(
    () => ['All', ...Array.from(new Set(people.map((person) => person.department || 'General'))).sort()],
    [people],
  );

  const onlineCount = people.filter(isOnline).length;
  const offlineCount = people.length - onlineCount;

  const filtered = people.filter((person) => {
    const search = `${person.displayName} ${person.email || ''} ${person.role || ''} ${person.department || ''}`.toLowerCase();
    const matchesSearch = !query || search.includes(query.toLowerCase());
    const matchesDept = department === 'All' || (person.department || 'General') === department;
    const matchesStatus =
      statusFilter === 'all'
        ? true
        : statusFilter === 'online'
        ? isOnline(person)
        : !isOnline(person);
    return matchesSearch && matchesDept && matchesStatus;
  });

  async function openDirectMessage(person: Person) {
    setCreatingChat(true);
    setError('');
    try {
      const conversation = await chatsAPI.createDirect(person.userId);
      router.push(`/dms?conversation=${conversation.id || conversation.conversationId}`);
    } catch {
      setError('Direct message could not be opened.');
    } finally {
      setCreatingChat(false);
    }
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-slate-50">
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-6">
        <div className="flex items-center gap-3">
          <Users className="h-5 w-5 text-blue-700" />
          <h1 className="text-lg font-bold text-slate-950">People</h1>
          <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600">
            {people.length}
          </span>
          <span className="flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 border border-emerald-200/60">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            {onlineCount} online
          </span>
        </div>
        <button
          onClick={loadPeople}
          className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"
          title="Refresh people"
        >
          <RefreshCw className="h-4 w-4" />
        </button>
      </header>

      <div className="flex min-h-0 flex-1">
        <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 bg-white px-6 py-3">
            <div className="relative min-w-56 max-w-sm flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={query}
                onChange={(event) => setQuery(sanitizeName(event.target.value))}
                className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm outline-none focus:border-blue-400 focus:bg-white"
                placeholder="Search people..."
              />
            </div>

            {/* Status Tabs Bar */}
            <div className="inline-flex items-center rounded-xl bg-slate-100/90 p-1 border border-slate-200/90 shadow-xs">
              <button
                type="button"
                onClick={() => setStatusFilter('all')}
                className={`flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-all duration-150 cursor-pointer ${
                  statusFilter === 'all'
                    ? 'bg-white text-slate-950 shadow-sm border border-slate-200/70 font-bold'
                    : 'text-slate-600 hover:text-slate-950 hover:bg-white/50'
                }`}
              >
                <span>All</span>
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('online')}
                className={`flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-all duration-150 cursor-pointer ${
                  statusFilter === 'online'
                    ? 'bg-white text-emerald-700 shadow-sm border border-emerald-200/80 font-bold'
                    : 'text-emerald-700/80 hover:text-emerald-800 hover:bg-white/50'
                }`}
              >
                <span className={`h-2 w-2 rounded-full ${statusFilter === 'online' ? 'bg-emerald-500 ring-2 ring-emerald-200' : 'bg-emerald-500'}`} />
                <span>Online ({onlineCount})</span>
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('offline')}
                className={`flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-all duration-150 cursor-pointer ${
                  statusFilter === 'offline'
                    ? 'bg-white text-slate-800 shadow-sm border border-slate-200/70 font-bold'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
                }`}
              >
                <span className={`h-2 w-2 rounded-full ${statusFilter === 'offline' ? 'bg-slate-500 ring-2 ring-slate-200' : 'bg-slate-400'}`} />
                <span>Offline ({offlineCount})</span>
              </button>
            </div>

            {/* Department Filter Pills */}
            <div className="flex flex-wrap gap-1">
              {departments.map((item) => (
                <button
                  key={item}
                  onClick={() => setDepartment(item)}
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    department === item ? 'bg-blue-700 text-white' : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {item}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-6">
            {error && (
              <div className="mb-4 flex items-center justify-between rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                <span>{error}</span>
                <button onClick={loadPeople} className="font-semibold hover:text-red-900">
                  Retry
                </button>
              </div>
            )}

            {loading ? (
              <div className="rounded-xl border border-slate-200 bg-white p-8 text-sm text-slate-500">Loading people...</div>
            ) : filtered.length === 0 ? (
              <div className="flex h-56 flex-col items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white text-slate-400">
                <Users className="h-10 w-10 text-slate-300" />
                <p className="text-sm">
                  {statusFilter !== 'all'
                    ? `No ${statusFilter} users found matching the selected filters.`
                    : 'No people returned from the backend.'}
                </p>
                {statusFilter !== 'all' && (
                  <button
                    onClick={() => setStatusFilter('all')}
                    className="text-xs font-semibold text-blue-600 hover:underline"
                  >
                    Show all users
                  </button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {filtered.map((person) => (
                  <button
                    key={person.userId}
                    onClick={() => setSelected(person)}
                    className={`flex items-start gap-3 rounded-xl border bg-white p-4 text-left hover:shadow-sm ${
                      selected?.userId === person.userId ? 'border-blue-300' : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <span className="relative">
                      {person.avatarUrl ? (
                        <img src={person.avatarUrl} alt={person.displayName} className="h-11 w-11 rounded-full object-cover shadow-xs border border-slate-200" />
                      ) : (
                        <span className={`flex h-11 w-11 items-center justify-center rounded-full text-sm font-bold ${avatarAccent(person.userId)}`}>
                          {initials(person.displayName)}
                        </span>
                      )}
                      <span
                        className={`absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-white ${
                          isOnline(person) ? 'bg-emerald-500' : 'bg-slate-300'
                        }`}
                      />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-slate-950">{person.displayName}</span>
                      <span className="block truncate text-xs text-slate-500">{roleLabel(person.role)}</span>
                      <span className="mt-1 block truncate text-xs font-medium text-slate-400">{person.department || 'General'}</span>
                      <span className="mt-1 flex items-center gap-1.5 text-[10px] font-semibold text-slate-500">
                        <span className={`h-1.5 w-1.5 rounded-full ${isOnline(person) ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                        {statusLabel(person)}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </main>

        {selected && (
          <aside className="w-80 shrink-0 overflow-y-auto border-l border-slate-200 bg-white p-5">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-700">Profile</h2>
              <button onClick={() => setSelected(null)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100" title="Close profile">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mb-5 flex flex-col items-center text-center">
              {selected.avatarUrl ? (
                <img src={selected.avatarUrl} alt={selected.displayName} className="mb-3 h-16 w-16 rounded-full object-cover shadow-md border-2 border-white" />
              ) : (
                <div className={`mb-3 flex h-16 w-16 items-center justify-center rounded-full text-lg font-bold ${avatarAccent(selected.userId)}`}>
                  {initials(selected.displayName)}
                </div>
              )}
              <div className="text-base font-bold text-slate-950">{selected.displayName}</div>
              <div className="mt-1 text-sm text-slate-500">{roleLabel(selected.role)}</div>
              <div className="mt-1 text-xs text-slate-400">{selected.department || 'General'}</div>
              <div className="mt-2 flex items-center gap-1.5">
                <span className={`h-2 w-2 rounded-full ${statusDotClass(selected)}`} />
                <span className="text-xs font-semibold text-slate-500">{statusLabel(selected)}</span>
              </div>
            </div>

            {selected.email && (
              <a
                href={`mailto:${selected.email}`}
                className="mb-3 flex items-center gap-3 rounded-xl border border-slate-200 p-3 text-sm text-slate-700 hover:bg-slate-50"
              >
                <Mail className="h-4 w-4 shrink-0 text-slate-400" />
                <span className="truncate">{selected.email}</span>
              </a>
            )}

            {selected.aboutText && (
              <p className="mb-4 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm leading-6 text-slate-600">{selected.aboutText}</p>
            )}

            <button
              onClick={() => openDirectMessage(selected)}
              disabled={creatingChat}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-700 px-3 py-2.5 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-50"
            >
              <MessageSquare className="h-4 w-4" />
              {creatingChat ? 'Opening...' : 'Message'}
            </button>
          </aside>
        )}
      </div>
    </div>
  );
}
