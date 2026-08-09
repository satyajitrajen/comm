import React, { useEffect, useMemo, useState, FormEvent } from 'react';
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Circle,
  Clock,
  Plus,
  RefreshCw,
  X,
  Video,
  Search,
  ArrowUpRight,
} from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { calendarAPI, tasksAPI, usersAPI } from '../api/api';
import { timeAgo } from '../utils/utils';

type CalendarItem = {
  id: string;
  title: string;
  itemType: 'task' | 'event';
  status: string;
  priority: string;
  startsAt: string;
  endsAt?: string | null;
  source?: string | null;
  meetingLink?: string | null;
  attendeeNames?: string[];
};

const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const months = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

export const CalendarView: React.FC = () => {
  const { startCall, currentUser } = useAppStore();
  const today = useMemo(() => new Date(), []);
  const [current, setCurrent] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDay, setSelectedDay] = useState(today.getDate());
  const [view, setView] = useState<'month' | 'list'>('month');
  const [items, setItems] = useState<CalendarItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // New Event Modal State
  const [showCreate, setShowCreate] = useState(false);
  const [eventTitle, setEventTitle] = useState('');
  const [eventTeam, setEventTeam] = useState('Engineering');
  const [eventDate, setEventDate] = useState(today.toISOString().slice(0, 10));
  const [eventStart, setEventStart] = useState('10:00');
  const [eventEnd, setEventEnd] = useState('10:30');
  const [selectedAttendees, setSelectedAttendees] = useState<string[]>([]);
  const [attendeeSearch, setAttendeeSearch] = useState('');
  const [showAttendeeDropdown, setShowAttendeeDropdown] = useState(false);
  const [creating, setCreating] = useState(false);
  const [eventError, setEventError] = useState('');
  const [users, setUsers] = useState<any[]>([]);

  const loadCalendar = async () => {
    setLoading(true);
    setError('');
    try {
      const [taskRes, eventRes] = await Promise.allSettled([
        tasksAPI.getMine(),
        calendarAPI.getEvents(),
      ]);

      const loadedItems: CalendarItem[] = [];

      if (eventRes.status === 'fulfilled' && Array.isArray(eventRes.value)) {
        eventRes.value.forEach((ev: any) => {
          loadedItems.push({
            id: `ev-${ev.id}`,
            title: ev.title,
            itemType: 'event',
            status: 'EVENT',
            priority: 'EVENT',
            startsAt: ev.startsAt,
            endsAt: ev.endsAt,
            source: ev.teamName || 'Calendar',
            meetingLink: ev.meetingLink || `https://teamtime.live/room/${ev.id}`,
            attendeeNames: ev.attendees?.map((a: any) => a.user?.profile?.displayName || a.user?.email).filter(Boolean) || [],
          });
        });
      }

      if (taskRes.status === 'fulfilled' && Array.isArray(taskRes.value)) {
        taskRes.value.forEach((t: any) => {
          if (t.dueDate) {
            loadedItems.push({
              id: `tsk-${t.id}`,
              title: t.title,
              itemType: 'task',
              status: t.status || 'OPEN',
              priority: t.priority || 'NORMAL',
              startsAt: t.dueDate,
              source: t.conversation?.group?.name || 'Task',
            });
          }
        });
      }

      setItems(loadedItems);
    } catch (err) {
      console.warn('Failed to load calendar data:', err);
      setError('Calendar items could not be loaded.');
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCalendar();
    usersAPI.getDirectory().then((data) => {
      if (Array.isArray(data)) setUsers(data);
    }).catch((err) => console.warn('Directory fetch failed:', err));
  }, []);

  const createEvent = async (e: FormEvent) => {
    e.preventDefault();
    if (!eventTitle.trim()) return;

    const startsAt = new Date(`${eventDate}T${eventStart}:00`);
    const endsAt = new Date(`${eventDate}T${eventEnd}:00`);
    if (endsAt <= startsAt) {
      setEventError('End time must be after start time.');
      return;
    }

    setEventError('');
    setCreating(true);
    try {
      const created = await calendarAPI.createEvent({
        title: eventTitle.trim(),
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
      });
      setShowCreate(false);
      setEventTitle('');
      await loadCalendar();
    } catch {
      setEventError('Event could not be created.');
    } finally {
      setCreating(false);
    }
  };

  const year = current.getFullYear();
  const month = current.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const itemsByDay = useMemo(() => {
    return items.reduce<Record<number, CalendarItem[]>>((groups, item) => {
      const d = new Date(item.startsAt);
      if (d.getFullYear() === year && d.getMonth() === month) {
        const day = d.getDate();
        groups[day] = [...(groups[day] || []), item];
      }
      return groups;
    }, {});
  }, [items, year, month]);

  const selectedItems = itemsByDay[selectedDay] || [];
  const sortedItems = useMemo(
    () => [...items].sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()),
    [items],
  );

  return (
    <div className="flex flex-1 flex-col h-full overflow-hidden bg-slate-50 select-none">
      {/* Header Bar */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-6">
        <div className="flex items-center gap-3">
          <CalendarDays className="h-5 w-5 text-indigo-600" />
          <h1 className="text-base font-bold text-slate-900">Calendar & Meetings</h1>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">{items.length}</span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-indigo-500 transition-colors shadow-xs"
          >
            <Plus className="h-4 w-4" />
            <span>New Event</span>
          </button>
          <button
            onClick={loadCalendar}
            disabled={loading}
            className="rounded-lg border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-colors"
            title="Refresh calendar"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>

          <div className="flex rounded-lg border border-slate-200 bg-white p-0.5">
            {(['month', 'list'] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setView(mode)}
                className={`rounded-md px-3 py-1 text-xs font-bold capitalize transition-colors ${
                  view === mode ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {mode}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* Main Workspace Body */}
      <div className="flex flex-1 min-h-0">
        <main className="flex flex-1 flex-col overflow-y-auto p-6 min-w-0">
          {error && (
            <div className="mb-4 flex items-center justify-between rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-xs text-red-700 font-semibold">
              <span>{error}</span>
              <button onClick={loadCalendar} className="hover:underline">
                Retry
              </button>
            </div>
          )}

          {/* Month Switcher Controls */}
          <div className="mb-4 flex items-center gap-3">
            <button onClick={() => setCurrent(new Date(year, month - 1, 1))} className="rounded-lg border border-slate-200 p-1.5 hover:bg-slate-100">
              <ChevronLeft className="h-4 w-4 text-slate-600" />
            </button>
            <h2 className="text-sm font-bold text-slate-900">
              {months[month]} {year}
            </h2>
            <button onClick={() => setCurrent(new Date(year, month + 1, 1))} className="rounded-lg border border-slate-200 p-1.5 hover:bg-slate-100">
              <ChevronRight className="h-4 w-4 text-slate-600" />
            </button>
            <button
              onClick={() => {
                setCurrent(new Date(today.getFullYear(), today.getMonth(), 1));
                setSelectedDay(today.getDate());
              }}
              className="ml-auto rounded-lg border border-slate-200 px-3 py-1 text-xs font-bold text-slate-700 hover:bg-slate-100"
            >
              Today
            </button>
          </div>

          {loading ? (
            <div className="rounded-xl border border-slate-200 bg-white p-8 text-sm text-slate-500">Loading calendar...</div>
          ) : view === 'month' ? (
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xs">
              <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50">
                {days.map((day) => (
                  <div key={day} className="py-2 text-center text-xs font-bold text-slate-500">
                    {day}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7">
                {Array.from({ length: firstDay }).map((_, i) => (
                  <div key={`empty-${i}`} className="min-h-[80px] border-b border-r border-slate-100 bg-slate-50/50" />
                ))}
                {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((day) => {
                  const dayItems = itemsByDay[day] || [];
                  const isToday = day === today.getDate() && month === today.getMonth() && year === today.getFullYear();
                  return (
                    <button
                      key={day}
                      onClick={() => setSelectedDay(day)}
                      className={`min-h-[80px] border-b border-r border-slate-100 p-2 text-left transition-colors ${
                        day === selectedDay ? 'bg-indigo-50/60' : 'hover:bg-slate-50'
                      }`}
                    >
                      <span className={`mb-1 flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold ${isToday ? 'bg-indigo-600 text-white' : 'text-slate-700'}`}>
                        {day}
                      </span>
                      <span className="space-y-0.5 block">
                        {dayItems.slice(0, 2).map((item) => (
                          <span key={item.id} className="flex items-center gap-1 rounded bg-slate-100 px-1 py-0.5 text-[10px] font-medium text-slate-700 truncate">
                            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-600" />
                            <span className="truncate">{item.title}</span>
                          </span>
                        ))}
                        {dayItems.length > 2 && <span className="block pl-1 text-[10px] text-slate-400 font-semibold">+{dayItems.length - 2} more</span>}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : sortedItems.length === 0 ? (
            <div className="flex h-56 flex-col items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white text-slate-400">
              <Circle className="h-10 w-10 text-slate-300" />
              <p className="text-xs font-semibold">No calendar events scheduled.</p>
            </div>
          ) : (
            <div className="space-y-2 max-w-3xl mx-auto w-full">
              {sortedItems.map((item) => (
                <div key={item.id} className="flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-2xs hover:border-indigo-300 transition-colors">
                  <span className="h-2.5 w-2.5 rounded-full bg-indigo-600 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-bold text-slate-900 truncate">{item.title}</div>
                    <div className="mt-0.5 text-[10px] text-slate-400">{item.source || 'Workspace Meeting'}</div>
                  </div>
                  <div className="flex items-center gap-1 text-xs text-slate-500 font-mono">
                    <Clock className="h-3.5 w-3.5" />
                    <span>{new Date(item.startsAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                  <button
                    onClick={() => startCall(item.title, 'video')}
                    className="flex items-center gap-1 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg text-xs font-bold border border-indigo-200 transition-colors"
                  >
                    <Video className="h-3.5 w-3.5" />
                    <span>Join</span>
                  </button>
                </div>
              ))}
            </div>
          )}
        </main>

        {/* Right Day Details Inspector */}
        {view === 'month' && (
          <aside className="w-80 shrink-0 overflow-y-auto border-l border-slate-200 bg-white p-4">
            <h3 className="mb-4 flex items-center gap-2 text-xs font-bold text-slate-900 uppercase tracking-wider">
              <span>{months[month]} {selectedDay} Details</span>
              {selectedDay === today.getDate() && month === today.getMonth() && (
                <span className="rounded-full bg-indigo-600 px-2 py-0.2 text-[10px] font-bold text-white">Today</span>
              )}
            </h3>

            {selectedItems.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-8 text-slate-400">
                <Circle className="h-8 w-8 text-slate-200" />
                <p className="text-xs italic">No items scheduled for this date.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {selectedItems.map((item) => (
                  <div key={item.id} className="rounded-xl border border-slate-200 p-4 bg-white shadow-2xs space-y-2">
                    <div className="flex items-start gap-2">
                      <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-indigo-600" />
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-bold text-slate-900">{item.title}</div>
                        <div className="mt-1 text-[10px] text-slate-500">{item.source}</div>
                        <div className="mt-1 text-xs font-semibold text-indigo-600">
                          {new Date(item.startsAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>

                        <button
                          onClick={() => startCall(item.title, 'video')}
                          className="mt-3 flex items-center justify-center gap-1.5 rounded-lg bg-indigo-50 border border-indigo-200 px-3 py-1.5 text-xs font-bold text-indigo-700 hover:bg-indigo-100 transition-colors w-full"
                        >
                          <Video className="h-3.5 w-3.5" />
                          <span>Join Video Meeting</span>
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </aside>
        )}
      </div>

      {/* New Event Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-950/40 backdrop-blur-xs" onClick={() => setShowCreate(false)} />
          <form onSubmit={createEvent} className="relative z-10 w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h2 className="text-sm font-bold text-slate-900">Schedule New Event</h2>
              <button type="button" onClick={() => setShowCreate(false)} className="p-1 rounded-md text-slate-400 hover:bg-slate-100">
                <X className="h-4 w-4" />
              </button>
            </div>

            {eventError && <div className="rounded-lg bg-red-50 p-2.5 text-xs font-semibold text-red-700">{eventError}</div>}

            <label className="block text-xs font-bold text-slate-700">
              Event Title
              <input
                value={eventTitle}
                onChange={(e) => setEventTitle(e.target.value)}
                className="mt-1 h-9 w-full rounded-lg border border-slate-200 px-3 text-xs outline-none focus:border-indigo-500"
                placeholder="Sprint review, design sync..."
                required
              />
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="block text-xs font-bold text-slate-700">
                Start Time
                <input
                  type="time"
                  value={eventStart}
                  onChange={(e) => setEventStart(e.target.value)}
                  className="mt-1 h-9 w-full rounded-lg border border-slate-200 px-3 text-xs outline-none focus:border-indigo-500"
                  required
                />
              </label>
              <label className="block text-xs font-bold text-slate-700">
                End Time
                <input
                  type="time"
                  value={eventEnd}
                  onChange={(e) => setEventEnd(e.target.value)}
                  className="mt-1 h-9 w-full rounded-lg border border-slate-200 px-3 text-xs outline-none focus:border-indigo-500"
                  required
                />
              </label>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={creating}
                className="px-4 py-1.5 rounded-lg bg-indigo-600 text-xs font-bold text-white hover:bg-indigo-500 disabled:opacity-50 shadow-xs"
              >
                {creating ? 'Creating...' : 'Create Event'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
