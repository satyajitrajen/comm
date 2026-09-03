'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  List as ListIcon,
  Mail,
  MessageSquare,
  RefreshCw,
  Search,
  User,
  Users,
  X,
} from 'lucide-react';
import { chatsAPI, usersAPI, adminAPI } from '../../../services/api';
import { getAppSocket } from '../../../lib/socket';
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
  const [viewMode, setViewMode] = useState<'cards' | 'list'>('cards');
  const [selected, setSelected] = useState<Person | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [creatingChat, setCreatingChat] = useState(false);

  // Pagination state
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

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
      const view = params.get('view');
      if (view === 'list' || view === 'cards') {
        setViewMode(view);
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

  // Live WebSocket presence update (shared socket)
  useEffect(() => {
    const socket = getAppSocket();
    if (!socket) return;

    const onPresence = (data: { userId: string; presence?: string; isOnline?: boolean }) => {
      if (!data?.userId) return;
      setPeople((prev) =>
        prev.map((p) =>
          p.userId === data.userId
            ? { ...p, presence: data.presence || (data.isOnline ? 'ONLINE' : 'OFFLINE') }
            : p,
        ),
      );
    };

    socket.on('user.presence', onPresence);
    return () => {
      socket.off('user.presence', onPresence);
    };
  }, []);

  const departments = useMemo(
    () => ['All', ...Array.from(new Set(people.map((person) => person.department || 'General'))).sort()],
    [people],
  );

  const onlineCount = people.filter(isOnline).length;
  const offlineCount = people.length - onlineCount;

  const filtered = useMemo(() => {
    return people.filter((person) => {
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
  }, [people, query, department, statusFilter]);

  // Reset pagination when filter criteria change
  useEffect(() => {
    setPage(1);
  }, [query, department, statusFilter, pageSize]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const paginatedPeople = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, safePage, pageSize]);

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
      {/* Top Header */}
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-6">
        <div className="flex items-center gap-3">
          <Users className="h-5 w-5 text-blue-700" />
          <h1 className="text-lg font-bold text-slate-950">People Directory</h1>
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
          className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
          title="Refresh people"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </header>

      <div className="flex min-h-0 flex-1">
        <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
          {/* Controls Bar: Search, Status Tabs, Department Pills, Cards/List View Switcher */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-6 py-3">
            <div className="flex flex-wrap items-center gap-3 flex-1 min-w-0">
              {/* Search */}
              <div className="relative min-w-56 max-w-sm flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  value={query}
                  onChange={(event) => setQuery(sanitizeName(event.target.value))}
                  className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm outline-none focus:border-blue-400 focus:bg-white transition"
                  placeholder="Search by name, role, department..."
                />
              </div>

              {/* Status Tabs Bar */}
              <div className="inline-flex items-center rounded-xl bg-slate-100/90 p-1 border border-slate-200/90 shadow-xs">
                <button
                  type="button"
                  onClick={() => setStatusFilter('all')}
                  className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all duration-150 cursor-pointer ${
                    statusFilter === 'all'
                      ? 'bg-white text-slate-950 shadow-sm border border-slate-200/70 font-bold'
                      : 'text-slate-600 hover:text-slate-950 hover:bg-white/50'
                  }`}
                >
                  <span>All ({people.length})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter('online')}
                  className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all duration-150 cursor-pointer ${
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
                  className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all duration-150 cursor-pointer ${
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
                    className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                      department === item
                        ? 'bg-blue-700 text-white shadow-xs'
                        : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>

            {/* View Mode Switcher: Cards vs List */}
            <div className="inline-flex items-center rounded-xl bg-slate-100/90 p-1 border border-slate-200/90 shadow-xs shrink-0">
              <button
                type="button"
                onClick={() => setViewMode('cards')}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all duration-150 cursor-pointer ${
                  viewMode === 'cards'
                    ? 'bg-white text-blue-700 shadow-sm border border-slate-200/70 font-bold'
                    : 'text-slate-600 hover:text-slate-950 hover:bg-white/50'
                }`}
                title="Cards View"
              >
                <LayoutGrid className="h-3.5 w-3.5" />
                <span>Cards</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('list')}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all duration-150 cursor-pointer ${
                  viewMode === 'list'
                    ? 'bg-white text-blue-700 shadow-sm border border-slate-200/70 font-bold'
                    : 'text-slate-600 hover:text-slate-950 hover:bg-white/50'
                }`}
                title="List View"
              >
                <ListIcon className="h-3.5 w-3.5" />
                <span>List</span>
              </button>
            </div>
          </div>

          {/* Main Content Area */}
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
              <div className="flex h-56 flex-col items-center justify-center gap-3 rounded-2xl border border-slate-200 bg-white p-8 text-sm text-slate-500 shadow-xs">
                <RefreshCw className="h-6 w-6 animate-spin text-blue-600" />
                <span>Loading people...</span>
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex h-56 flex-col items-center justify-center gap-3 rounded-2xl border border-slate-200 bg-white text-slate-400 shadow-xs">
                <Users className="h-10 w-10 text-slate-300" />
                <p className="text-sm">
                  {statusFilter !== 'all'
                    ? `No ${statusFilter} people found matching the selected filters.`
                    : 'No people found.'}
                </p>
                {(statusFilter !== 'all' || query || department !== 'All') && (
                  <button
                    onClick={() => {
                      setStatusFilter('all');
                      setQuery('');
                      setDepartment('All');
                    }}
                    className="text-xs font-semibold text-blue-600 hover:underline"
                  >
                    Reset all filters
                  </button>
                )}
              </div>
            ) : viewMode === 'cards' ? (
              /* CARDS VIEW WITH SERIAL NUMBERS */
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {paginatedPeople.map((person, index) => {
                  const srNo = (safePage - 1) * pageSize + index + 1;
                  const isSelected = selected?.userId === person.userId;
                  return (
                    <div
                      key={person.userId}
                      onClick={() => setSelected(person)}
                      className={`group relative flex flex-col justify-between rounded-2xl border bg-white p-5 text-left transition-all duration-150 hover:shadow-md cursor-pointer ${
                        isSelected
                          ? 'border-blue-500 ring-2 ring-blue-100 shadow-sm'
                          : 'border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      {/* Serial Number Badge */}
                      <span className="absolute top-3.5 right-3.5 inline-flex items-center justify-center rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-500 group-hover:bg-blue-50 group-hover:text-blue-700 transition">
                        #{String(srNo).padStart(2, '0')}
                      </span>

                      <div>
                        {/* Avatar & Status */}
                        <div className="flex items-center gap-3.5 mb-3.5">
                          <span className="relative shrink-0">
                            {person.avatarUrl ? (
                              <img
                                src={person.avatarUrl}
                                alt={person.displayName}
                                className="h-12 w-12 rounded-full object-cover shadow-xs border border-slate-200"
                              />
                            ) : (
                              <span
                                className={`flex h-12 w-12 items-center justify-center rounded-full text-sm font-bold ${avatarAccent(
                                  person.userId,
                                )}`}
                              >
                                {initials(person.displayName)}
                              </span>
                            )}
                            <span
                              className={`absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-white ${
                                isOnline(person) ? 'bg-emerald-500' : 'bg-slate-300'
                              }`}
                            />
                          </span>

                          <div className="min-w-0 flex-1 pr-6">
                            <span className="block truncate text-sm font-bold text-slate-950 group-hover:text-blue-700 transition">
                              {person.displayName}
                            </span>
                            <span className="block truncate text-xs text-slate-500 font-medium">
                              {roleLabel(person.role)}
                            </span>
                          </div>
                        </div>

                        {/* Department & Presence Pill */}
                        <div className="flex flex-wrap items-center gap-1.5 mb-3">
                          <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                            {person.department || 'General'}
                          </span>
                          <span
                            className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold ${
                              isOnline(person)
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/50'
                                : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            <span
                              className={`h-1.5 w-1.5 rounded-full ${
                                isOnline(person) ? 'bg-emerald-500' : 'bg-slate-400'
                              }`}
                            />
                            {statusLabel(person)}
                          </span>
                        </div>

                        {/* Email or Phone snippet */}
                        {person.email && (
                          <div className="flex items-center gap-1.5 text-xs text-slate-500 truncate mb-4">
                            <Mail className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                            <span className="truncate">{person.email}</span>
                          </div>
                        )}
                      </div>

                      {/* Quick Action Footer */}
                      <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelected(person);
                          }}
                          className="text-xs font-semibold text-slate-600 hover:text-slate-950 transition"
                        >
                          View Profile
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            openDirectMessage(person);
                          }}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-blue-700 transition shadow-xs cursor-pointer"
                        >
                          <MessageSquare className="h-3.5 w-3.5" />
                          <span>Chat</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              /* LIST / TABLE VIEW WITH SERIAL NUMBERS */
              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50/80 text-slate-600 uppercase font-bold tracking-wider text-[11px]">
                        <th className="py-3 px-4 w-16 text-center">Sr No</th>
                        <th className="py-3 px-4">Person</th>
                        <th className="py-3 px-4">Department</th>
                        <th className="py-3 px-4">Contact</th>
                        <th className="py-3 px-4">Status</th>
                        <th className="py-3 px-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {paginatedPeople.map((person, index) => {
                        const srNo = (safePage - 1) * pageSize + index + 1;
                        const isSelected = selected?.userId === person.userId;
                        return (
                          <tr
                            key={person.userId}
                            onClick={() => setSelected(person)}
                            className={`hover:bg-slate-50/80 transition cursor-pointer ${
                              isSelected ? 'bg-blue-50/60' : ''
                            }`}
                          >
                            {/* Sr No */}
                            <td className="py-3 px-4 text-center font-bold text-slate-500">
                              {srNo}
                            </td>

                            {/* Person Name & Role */}
                            <td className="py-3 px-4">
                              <div className="flex items-center gap-3">
                                <span className="relative shrink-0">
                                  {person.avatarUrl ? (
                                    <img
                                      src={person.avatarUrl}
                                      alt={person.displayName}
                                      className="h-9 w-9 rounded-full object-cover shadow-xs border border-slate-200"
                                    />
                                  ) : (
                                    <span
                                      className={`flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold ${avatarAccent(
                                        person.userId,
                                      )}`}
                                    >
                                      {initials(person.displayName)}
                                    </span>
                                  )}
                                  <span
                                    className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-white ${
                                      isOnline(person) ? 'bg-emerald-500' : 'bg-slate-300'
                                    }`}
                                  />
                                </span>
                                <div>
                                  <span className="block font-bold text-slate-950 text-sm">
                                    {person.displayName}
                                  </span>
                                  <span className="block text-slate-500 text-xs">
                                    {roleLabel(person.role)}
                                  </span>
                                </div>
                              </div>
                            </td>

                            {/* Department */}
                            <td className="py-3 px-4">
                              <span className="inline-flex items-center rounded-md bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                                {person.department || 'General'}
                              </span>
                            </td>

                            {/* Contact */}
                            <td className="py-3 px-4">
                              <div className="text-slate-600">
                                {person.email ? (
                                  <span className="block font-medium">{person.email}</span>
                                ) : (
                                  <span className="text-slate-400 italic">No email</span>
                                )}
                                {person.phoneNumber && (
                                  <span className="block text-[11px] text-slate-400">
                                    {person.phoneNumber}
                                  </span>
                                )}
                              </div>
                            </td>

                            {/* Status */}
                            <td className="py-3 px-4">
                              <span
                                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                                  isOnline(person)
                                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/60'
                                    : 'bg-slate-100 text-slate-600'
                                }`}
                              >
                                <span
                                  className={`h-1.5 w-1.5 rounded-full ${
                                    isOnline(person) ? 'bg-emerald-500' : 'bg-slate-400'
                                  }`}
                                />
                                {statusLabel(person)}
                              </span>
                            </td>

                            {/* Actions */}
                            <td className="py-3 px-4 text-right">
                              <div className="inline-flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openDirectMessage(person);
                                  }}
                                  className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-blue-700 transition shadow-xs cursor-pointer"
                                  title="Send Message"
                                >
                                  <MessageSquare className="h-3.5 w-3.5" />
                                  <span>Message</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelected(person);
                                  }}
                                  className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition"
                                  title="View Profile"
                                >
                                  <User className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Pagination Controls */}
            {!loading && filtered.length > 0 && (
              <div className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
                {/* Result count range */}
                <div className="text-xs font-medium text-slate-600">
                  Showing{' '}
                  <span className="font-bold text-slate-950">
                    {(safePage - 1) * pageSize + 1}
                  </span>{' '}
                  to{' '}
                  <span className="font-bold text-slate-950">
                    {Math.min(safePage * pageSize, filtered.length)}
                  </span>{' '}
                  of <span className="font-bold text-slate-950">{filtered.length}</span> people
                </div>

                <div className="flex flex-wrap items-center gap-4">
                  {/* Page Size Selector */}
                  <div className="flex items-center gap-2 text-xs font-medium text-slate-600">
                    <span>Rows per page:</span>
                    <select
                      value={pageSize}
                      onChange={(e) => {
                        setPageSize(Number(e.target.value));
                        setPage(1);
                      }}
                      className="h-8 rounded-lg border border-slate-200 bg-white px-2.5 py-0.5 text-xs font-semibold text-slate-700 outline-none transition focus:border-blue-500 cursor-pointer"
                    >
                      {[10, 20, 50, 100].map((size) => (
                        <option key={size} value={size}>
                          {size}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Navigation Buttons */}
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      disabled={safePage <= 1}
                      onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                      className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-white cursor-pointer disabled:cursor-not-allowed shadow-2xs"
                      title="Previous page"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>

                    <span className="px-2 text-xs font-semibold text-slate-700">
                      Page <span className="font-bold text-slate-950">{safePage}</span> of{' '}
                      <span className="font-bold text-slate-950">{totalPages}</span>
                    </span>

                    <button
                      type="button"
                      disabled={safePage >= totalPages}
                      onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                      className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-white cursor-pointer disabled:cursor-not-allowed shadow-2xs"
                      title="Next page"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </main>

        {/* Selected User Profile Drawer */}
        {selected && (
          <aside className="w-80 shrink-0 overflow-y-auto border-l border-slate-200 bg-white p-5 shadow-xs">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-900">User Profile</h2>
              <button
                onClick={() => setSelected(null)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
                title="Close profile"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mb-5 flex flex-col items-center text-center">
              {selected.avatarUrl ? (
                <img
                  src={selected.avatarUrl}
                  alt={selected.displayName}
                  className="mb-3 h-16 w-16 rounded-full object-cover shadow-md border-2 border-white"
                />
              ) : (
                <div
                  className={`mb-3 flex h-16 w-16 items-center justify-center rounded-full text-lg font-bold ${avatarAccent(
                    selected.userId,
                  )}`}
                >
                  {initials(selected.displayName)}
                </div>
              )}
              <div className="text-base font-bold text-slate-950">{selected.displayName}</div>
              <div className="mt-1 text-sm text-slate-500 font-medium">{roleLabel(selected.role)}</div>
              <div className="mt-1 text-xs text-slate-400">{selected.department || 'General'}</div>
              <div className="mt-2.5 flex items-center gap-1.5">
                <span className={`h-2 w-2 rounded-full ${statusDotClass(selected)}`} />
                <span className="text-xs font-semibold text-slate-600">{statusLabel(selected)}</span>
              </div>
            </div>

            {selected.email && (
              <a
                href={`mailto:${selected.email}`}
                className="mb-3 flex items-center gap-3 rounded-xl border border-slate-200 p-3 text-sm text-slate-700 hover:bg-slate-50 transition"
              >
                <Mail className="h-4 w-4 shrink-0 text-slate-400" />
                <span className="truncate">{selected.email}</span>
              </a>
            )}

            {selected.aboutText && (
              <p className="mb-4 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm leading-6 text-slate-600">
                {selected.aboutText}
              </p>
            )}

            <button
              onClick={() => openDirectMessage(selected)}
              disabled={creatingChat}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-700 px-3 py-2.5 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-50 transition shadow-sm"
            >
              <MessageSquare className="h-4 w-4" />
              {creatingChat ? 'Opening chat...' : 'Send Direct Message'}
            </button>
          </aside>
        )}
      </div>
    </div>
  );
}
