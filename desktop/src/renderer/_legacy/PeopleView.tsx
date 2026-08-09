import React, { useEffect, useMemo, useState } from 'react';
import { Users, Search, RefreshCw, X, Mail, MessageSquare, Phone, Video } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { usersAPI, chatsAPI } from '../api/api';
import { avatarAccent, initials, statusDotClass, statusLabel, isOnlineUser } from '../utils/utils';

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

export const PeopleView: React.FC = () => {
  const { currentUser, setActiveDM, setActiveTab, startCall } = useAppStore();
  const [people, setPeople] = useState<Person[]>([]);
  const [query, setQuery] = useState('');
  const [department, setDepartment] = useState('All');
  const [selected, setSelected] = useState<Person | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [creatingChat, setCreatingChat] = useState(false);

  const loadPeople = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await usersAPI.getDirectory();
      if (Array.isArray(data)) {
        const formatted: Person[] = data.map((u: any) => ({
          userId: u.userId || u.id,
          displayName: u.displayName || u.profile?.displayName || u.email || 'Team Member',
          email: u.email,
          phoneNumber: u.phoneNumber,
          role: u.role || 'Member',
          department: u.department || 'General',
          presence: u.presence || 'OFFLINE',
          availability: u.availability || null,
          aboutText: u.aboutText || u.profile?.aboutText,
          avatarUrl: u.avatarUrl || u.profile?.avatarUrl,
        }));
        setPeople(formatted);
      }
    } catch (err) {
      console.warn('Failed to load users from directory API:', err);
      setError('People could not be loaded from API.');
      setPeople([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPeople();
  }, []);

  const departments = useMemo(
    () => ['All', ...Array.from(new Set(people.map((p) => p.department || 'General'))).sort()],
    [people],
  );

  const filtered = people.filter((p) => {
    const search = `${p.displayName} ${p.email || ''} ${p.role || ''} ${p.department || ''}`.toLowerCase();
    return (
      (!query || search.includes(query.toLowerCase())) &&
      (department === 'All' || (p.department || 'General') === department)
    );
  });

  const onlineCount = people.filter((p) => isOnlineUser(p)).length;

  const openDirectMessage = async (person: Person) => {
    setCreatingChat(true);
    setError('');
    try {
      const convo = await chatsAPI.createDirect(person.userId);
      setActiveDM({
        id: convo.id || convo.conversationId || person.userId,
        name: person.displayName,
        avatarUrl: person.avatarUrl || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150',
        status: (person.presence as any) || 'online',
      });
      setActiveTab('dms');
    } catch (err) {
      console.warn('Could not create direct chat via API, opening direct message:', err);
      setActiveDM({
        id: person.userId,
        name: person.displayName,
        avatarUrl: person.avatarUrl || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150',
        status: (person.presence as any) || 'online',
      });
      setActiveTab('dms');
    } finally {
      setCreatingChat(false);
    }
  };

  return (
    <div className="flex flex-1 flex-col h-full overflow-hidden bg-slate-50">
      {/* Header Bar */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-6">
        <div className="flex items-center gap-3">
          <Users className="h-5 w-5 text-indigo-600" />
          <h1 className="text-base font-bold text-slate-900">People Directory</h1>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">{people.length}</span>
          <span className="flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            {onlineCount} online
          </span>
        </div>
        <button
          onClick={loadPeople}
          disabled={loading}
          className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          title="Refresh directory"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </header>

      {/* Main Workspace + Profile Side Panel */}
      <div className="flex flex-1 min-h-0">
        <main className="flex flex-1 flex-col min-w-0 overflow-hidden">
          {/* Search + Department Filter Bar */}
          <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 bg-white px-6 py-3">
            <div className="relative min-w-56 max-w-sm flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm outline-none focus:border-indigo-500 focus:bg-white transition-all"
                placeholder="Search people by name, email, role..."
              />
            </div>
            <div className="flex flex-wrap gap-1">
              {departments.map((dep) => (
                <button
                  key={dep}
                  onClick={() => setDepartment(dep)}
                  className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                    department === dep ? 'bg-indigo-600 text-white' : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {dep}
                </button>
              ))}
            </div>
          </div>

          {/* Directory Cards Grid */}
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
              <div className="rounded-xl border border-slate-200 bg-white p-8 text-sm text-slate-500">Loading directory...</div>
            ) : filtered.length === 0 ? (
              <div className="flex h-56 flex-col items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white text-slate-400">
                <Users className="h-10 w-10 text-slate-300" />
                <p className="text-sm">No team members match your filter.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {filtered.map((person) => (
                  <button
                    key={person.userId}
                    onClick={() => setSelected(person)}
                    className={`flex items-start gap-3 rounded-xl border bg-white p-4 text-left hover:shadow-xs transition-all ${
                      selected?.userId === person.userId ? 'border-indigo-500 ring-1 ring-indigo-500/20' : 'border-slate-200 hover:border-indigo-200'
                    }`}
                  >
                    <span className="relative shrink-0">
                      {person.avatarUrl ? (
                        <img src={person.avatarUrl} alt={person.displayName} className="h-11 w-11 rounded-full object-cover shadow-2xs border border-slate-200" />
                      ) : (
                        <span className={`flex h-11 w-11 items-center justify-center rounded-full text-sm font-bold ${avatarAccent(person.userId)}`}>
                          {initials(person.displayName)}
                        </span>
                      )}
                      <span className={`absolute bottom-0 right-0 h-3 w-3 rounded-full ring-2 ring-white ${statusDotClass(person)}`} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold text-slate-900">{person.displayName}</span>
                      <span className="block truncate text-xs text-slate-500">{person.role || 'Team Member'}</span>
                      <span className="mt-1 block truncate text-[10px] font-semibold text-slate-400">{person.department || 'General'}</span>
                      <span className="mt-1 block text-[10px] font-semibold text-indigo-600">{statusLabel(person)}</span>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </main>

        {/* Profile Side Panel */}
        {selected && (
          <aside className="w-80 shrink-0 overflow-y-auto border-l border-slate-200 bg-white p-5 flex flex-col justify-between">
            <div>
              <div className="mb-5 flex items-center justify-between">
                <h2 className="text-sm font-bold text-slate-900">Member Profile</h2>
                <button onClick={() => setSelected(null)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100" title="Close profile">
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="mb-5 flex flex-col items-center text-center">
                {selected.avatarUrl ? (
                  <img src={selected.avatarUrl} alt={selected.displayName} className="mb-3 h-20 w-20 rounded-full object-cover shadow-sm border-2 border-white ring-2 ring-indigo-500/20" />
                ) : (
                  <div className={`mb-3 flex h-20 w-20 items-center justify-center rounded-full text-xl font-bold ${avatarAccent(selected.userId)}`}>
                    {initials(selected.displayName)}
                  </div>
                )}
                <div className="text-base font-bold text-slate-900">{selected.displayName}</div>
                <div className="mt-1 text-xs font-semibold text-slate-500">{selected.role || 'Member'}</div>
                <div className="mt-0.5 text-xs text-slate-400">{selected.department || 'General'}</div>
                <div className="mt-2.5 flex items-center gap-1.5">
                  <span className={`h-2.5 w-2.5 rounded-full ${statusDotClass(selected)}`} />
                  <span className="text-xs font-semibold text-slate-600">{statusLabel(selected)}</span>
                </div>
              </div>

              {selected.email && (
                <div className="mb-3 flex items-center gap-3 rounded-xl border border-slate-200 p-3 text-xs text-slate-700 bg-slate-50">
                  <Mail className="h-4 w-4 shrink-0 text-slate-400" />
                  <span className="truncate">{selected.email}</span>
                </div>
              )}

              {selected.aboutText && (
                <p className="mb-4 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs leading-relaxed text-slate-600">{selected.aboutText}</p>
              )}
            </div>

            <div className="space-y-2 pt-4 border-t border-slate-100">
              <button
                onClick={() => openDirectMessage(selected)}
                disabled={creatingChat}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-3 py-2.5 text-xs font-bold text-white hover:bg-indigo-500 disabled:opacity-50 transition-colors shadow-xs"
              >
                <MessageSquare className="h-4 w-4" />
                <span>{creatingChat ? 'Opening...' : 'Start Direct Message'}</span>
              </button>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => startCall(selected.displayName, 'audio')}
                  className="flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  <Phone className="h-3.5 w-3.5 text-emerald-600" />
                  <span>Voice Call</span>
                </button>
                <button
                  onClick={() => startCall(selected.displayName, 'video')}
                  className="flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  <Video className="h-3.5 w-3.5 text-indigo-600" />
                  <span>Video Call</span>
                </button>
              </div>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
};
