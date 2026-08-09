'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Circle,
  Clock,
  Plus,
  RefreshCw,
  X,
  ArrowUpRight,
  Globe,
  Search,
} from 'lucide-react';
import { calendarAPI, tasksAPI, usersAPI } from '../../../services/api';
import { getChatsFeedCached } from '../../../lib/chatsFeedCache';
import { formatDateTime } from '../_utils';
import { calendarStatusLabel } from '../../../lib/enumLabels';
import Portal from '../../components/Portal';
import { SearchDropdown } from '../../components/SearchDropdown';

type CalendarTask = {
  id: string;
  title: string;
  status: string;
  priority: string;
  dueDate?: string | null;
  conversation?: { group?: { name?: string | null } | null } | null;
  assignees?: Array<{ user?: { profile?: { displayName?: string | null } | null } | null }>;
};

type CalendarEvent = {
  id: string;
  title: string;
  description?: string | null;
  startsAt: string;
  endsAt: string;
  teamName?: string | null;
  meetingLink?: string | null;
  attendees?: Array<{
    user: {
      id: string;
      email: string;
      profile?: {
        displayName: string;
        avatarUrl?: string | null;
      } | null;
    };
  }>;
};

type CalendarItem = {
  id: string;
  title: string;
  itemType: 'task' | 'event';
  status: string;
  priority: string;
  startsAt: string;
  endsAt?: string | null;
  source?: string | null;
  assignees?: string[];
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

function priorityColor(priority: string) {
  if (priority === 'EVENT') return 'bg-blue-500';
  if (priority === 'URGENT') return 'bg-red-500';
  if (priority === 'IMPORTANT') return 'bg-amber-500';
  return 'bg-slate-400';
}

function statusBadge(status: string) {
  if (status === 'EVENT') return 'bg-indigo-100 text-indigo-700';
  if (status === 'COMPLETED') return 'bg-emerald-100 text-emerald-700';
  if (status === 'IN_PROGRESS') return 'bg-blue-100 text-blue-700';
  return 'bg-slate-100 text-slate-600';
}

function eventItem(event: CalendarEvent): CalendarItem {
  return {
    id: `event-${event.id}`,
    title: event.title,
    itemType: 'event',
    status: 'EVENT',
    priority: 'EVENT',
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    source: event.teamName || 'Calendar',
    meetingLink: event.meetingLink,
    attendeeNames:
      event.attendees
        ?.map((a) => a.user.profile?.displayName || a.user.email)
        .filter(Boolean) || [],
  };
}

function taskItem(task: CalendarTask): CalendarItem | null {
  if (!task.dueDate) return null;
  return {
    id: `task-${task.id}`,
    title: task.title,
    itemType: 'task',
    status: task.status,
    priority: task.priority,
    startsAt: task.dueDate,
    source: task.conversation?.group?.name || 'Workspace',
    assignees: task.assignees?.map((item) => item.user?.profile?.displayName || '').filter(Boolean),
  };
}

export default function CalendarPage() {
  const today = useMemo(() => new Date(), []);
  const [current, setCurrent] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [selectedDay, setSelectedDay] = useState(today.getDate());
  const [view, setView] = useState<'month' | 'list'>('month');
  const [items, setItems] = useState<CalendarItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // Create Event Form State
  const [showCreate, setShowCreate] = useState(false);
  const [eventTitle, setEventTitle] = useState('');
  const [eventTeam, setEventTeam] = useState('');
  const [eventDate, setEventDate] = useState(today.toISOString().slice(0, 10));
  const [eventStart, setEventStart] = useState('10:00');
  const [eventEnd, setEventEnd] = useState('10:30');
  const [selectedAttendees, setSelectedAttendees] = useState<string[]>([]);
  const [attendeeSearch, setAttendeeSearch] = useState('');
  const [showAttendeeDropdown, setShowAttendeeDropdown] = useState(false);
  
  const [eventError, setEventError] = useState('');
  const [creating, setCreating] = useState(false);
  const [teams, setTeams] = useState<string[]>([]);
  const [users, setUsers] = useState<any[]>([]);

  // Load Teams and Directory Users
  useEffect(() => {
    getChatsFeedCached()
      .then((feed) => {
        if (Array.isArray(feed)) {
          const names = feed
            .filter((c) => c.type === 'GROUP' && c.group?.teamName)
            .map((c) => c.group?.teamName);
          const uniqueNames = Array.from(new Set(names)).filter(Boolean) as string[];
          if (uniqueNames.length > 0) {
            setTeams(uniqueNames);
            setEventTeam(uniqueNames[0]);
          } else {
            setTeams(['Engineering', 'Marketing', 'Product']);
            setEventTeam('Engineering');
          }
        } else {
          setTeams(['Engineering', 'Marketing', 'Product']);
          setEventTeam('Engineering');
        }
      })
      .catch(() => {
        setTeams(['Engineering', 'Marketing', 'Product']);
        setEventTeam('Engineering');
      });

    usersAPI
      .getDirectory()
      .then((data) => {
        if (Array.isArray(data)) {
          setUsers(data);
        }
      })
      .catch((err) => console.error('Error loading users:', err));
  }, []);

  async function loadCalendar() {
    setLoading(true);
    setError('');
    try {
      const [taskData, eventData] = await Promise.all([tasksAPI.getMine(), calendarAPI.getEvents()]);
      const taskItems = Array.isArray(taskData) ? taskData.map(taskItem).filter(Boolean) : [];
      const eventItems = Array.isArray(eventData) ? eventData.map(eventItem) : [];
      setItems([...(taskItems as CalendarItem[]), ...eventItems]);
    } catch {
      setError('Calendar data could not be loaded.');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      loadCalendar();
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  async function createEvent() {
    const title = eventTitle.trim();
    if (!title) return;

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
        title,
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        teamName: eventTeam.trim() || undefined,
        attendeeIds: selectedAttendees,
      });
      setItems((currentItems) => [...currentItems, eventItem(created)]);
      setEventTitle('');
      setSelectedAttendees([]);
      setAttendeeSearch('');
      setShowCreate(false);
    } catch {
      setEventError('Event could not be created.');
    } finally {
      setCreating(false);
    }
  }

  const year = current.getFullYear();
  const month = current.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const itemsByDay = items.reduce<Record<number, CalendarItem[]>>((groups, item) => {
    const date = new Date(item.startsAt);
    if (date.getFullYear() === year && date.getMonth() === month) {
      const day = date.getDate();
      groups[day] = [...(groups[day] || []), item];
    }
    return groups;
  }, {});

  const selectedItems = itemsByDay[selectedDay] || [];
  const sortedItems = [...items].sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());

  return (
    <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-slate-50">
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-6">
        <div className="flex items-center gap-3">
          <CalendarDays className="h-5 w-5 text-blue-700" />
          <h1 className="text-lg font-bold text-slate-950">Calendar</h1>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">{items.length}</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 rounded-lg bg-blue-700 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-800"
          >
            <Plus className="h-3.5 w-3.5" />
            New event
          </button>
          <button
            onClick={loadCalendar}
            className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"
            title="Refresh calendar"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
          <div className="flex rounded-lg border border-slate-200 bg-white p-0.5">
            {(['month', 'list'] as const).map((option) => (
              <button
                key={option}
                onClick={() => setView(option)}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold capitalize ${
                  view === option ? 'bg-blue-700 text-white' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {option}
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <main className="flex min-w-0 flex-1 flex-col overflow-y-auto p-6">
          {error && (
            <div className="mb-4 flex items-center justify-between rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              <span>{error}</span>
              <button onClick={loadCalendar} className="font-semibold hover:text-red-900">
                Retry
              </button>
            </div>
          )}

          <div className="mb-5 flex items-center gap-4">
            <button onClick={() => setCurrent(new Date(year, month - 1, 1))} className="rounded-lg border border-slate-200 p-2 hover:bg-slate-100">
              <ChevronLeft className="h-4 w-4 text-slate-600" />
            </button>
            <h2 className="text-base font-bold text-slate-950">
              {months[month]} {year}
            </h2>
            <button onClick={() => setCurrent(new Date(year, month + 1, 1))} className="rounded-lg border border-slate-200 p-2 hover:bg-slate-100">
              <ChevronRight className="h-4 w-4 text-slate-600" />
            </button>
            <button
              onClick={() => {
                setCurrent(new Date(today.getFullYear(), today.getMonth(), 1));
                setSelectedDay(today.getDate());
              }}
              className="ml-auto rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
            >
              Today
            </button>
          </div>

          {loading ? (
            <div className="rounded-xl border border-slate-200 bg-white p-8 text-sm text-slate-500">Loading calendar...</div>
          ) : view === 'month' ? (
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <div className="grid grid-cols-7 border-b border-slate-200">
                {days.map((day) => (
                  <div key={day} className="py-2.5 text-center text-xs font-semibold text-slate-500">
                    {day}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7">
                {Array.from({ length: firstDay }).map((_, index) => (
                  <div key={`empty-${index}`} className="min-h-[88px] border-b border-r border-slate-100" />
                ))}
                {Array.from({ length: daysInMonth }, (_, index) => index + 1).map((day) => {
                  const dayItems = itemsByDay[day] || [];
                  const isToday = day === today.getDate() && month === today.getMonth() && year === today.getFullYear();
                  return (
                    <button
                      key={day}
                      onClick={() => setSelectedDay(day)}
                      aria-label={`${months[month]} ${day}`}
                      className={`min-h-[88px] border-b border-r border-slate-100 p-2 text-left ${
                        day === selectedDay ? 'bg-blue-50' : 'hover:bg-slate-50'
                      }`}
                    >
                      <span className={`mb-1.5 flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${isToday ? 'bg-blue-700 text-white' : 'text-slate-700'}`}>
                        {day}
                      </span>
                      <span className="space-y-0.5">
                        {dayItems.slice(0, 2).map((item) => (
                          <span key={item.id} className="flex items-center gap-1 rounded bg-slate-100 px-1 py-0.5 text-[10px] font-medium text-slate-700">
                            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${priorityColor(item.priority)}`} />
                            <span className="truncate">{item.title}</span>
                          </span>
                        ))}
                        {dayItems.length > 2 && <span className="block pl-1 text-[10px] text-slate-400">+{dayItems.length - 2} more</span>}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : sortedItems.length === 0 ? (
            <div className="flex h-56 flex-col items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white text-slate-400">
              <Circle className="h-10 w-10 text-slate-300" />
              <p className="text-sm">No calendar items returned from the backend.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {sortedItems.map((item) => (
                <div key={item.id} className="flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-4">
                  <span className={`h-2.5 w-2.5 rounded-full ${priorityColor(item.priority)}`} />
                  <div className="min-w-0 flex-1">
                    <div className={`text-sm font-semibold ${item.status === 'COMPLETED' ? 'text-slate-400 line-through' : 'text-slate-900'}`}>{item.title}</div>
                    <div className="mt-0.5 text-xs text-slate-400">{item.source || 'Workspace'}</div>
                  </div>
                  <div className="flex items-center gap-1 text-xs text-slate-500">
                    <Clock className="h-3.5 w-3.5" />
                    {formatDateTime(item.startsAt)}
                  </div>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusBadge(item.status)}`}>{calendarStatusLabel(item.status)}</span>
                </div>
              ))}
            </div>
          )}
        </main>

        {view === 'month' && (
          <aside className="w-80 shrink-0 overflow-y-auto border-l border-slate-200 bg-white p-4">
            <h3
              aria-label={`${months[month]} ${selectedDay}`}
              className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-700"
            >
              <span>{months[month]} {selectedDay}</span>
              {selectedDay === today.getDate() && month === today.getMonth() && (
                <span aria-hidden="true" className="rounded-full bg-blue-600 px-2 py-0.5 text-[10px] font-bold text-white">Today</span>
              )}
            </h3>
            {selectedItems.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-8 text-slate-400">
                <Circle className="h-8 w-8 text-slate-200" />
                <p className="text-xs">No items</p>
              </div>
            ) : (
              <div className="space-y-3">
                {selectedItems.map((item) => (
                  <div key={item.id} className="rounded-xl border border-slate-200 p-4 bg-white hover:shadow-md transition-shadow">
                    <div className="flex items-start gap-2">
                      <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${priorityColor(item.priority)}`} />
                      <div className="min-w-0 flex-1">
                        <div className={`text-sm font-bold ${item.status === 'COMPLETED' ? 'text-slate-400 line-through' : 'text-slate-900'}`}>{item.title}</div>
                        <div className="mt-1 text-xs text-slate-500">{item.source || 'Workspace'}</div>
                        <div className="mt-1 text-xs font-semibold text-blue-700">{formatDateTime(item.startsAt)}</div>
                        
                        {/* Status Badge */}
                        <div className="mt-2.5">
                          <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${statusBadge(item.status)}`}>
                            {calendarStatusLabel(item.status)}
                          </span>
                        </div>

                        {/* Meeting Link Button */}
                        {item.itemType === 'event' && item.meetingLink && (
                          <a
                            href={item.meetingLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-3.5 inline-flex items-center gap-1.5 rounded-lg bg-indigo-50 border border-indigo-100 px-3 py-1.5 text-xs font-bold text-indigo-700 hover:bg-indigo-100 transition-colors w-full justify-center"
                          >
                            <ArrowUpRight className="h-3.5 w-3.5" />
                            Join Meeting
                          </a>
                        )}

                        {/* Attendees List */}
                        {item.itemType === 'event' && item.attendeeNames && item.attendeeNames.length > 0 && (
                          <div className="mt-3.5 border-t border-slate-100 pt-2.5">
                            <span className="block text-[10px] font-semibold uppercase text-slate-400 tracking-wider">Attendees</span>
                            <div className="mt-1.5 flex flex-wrap gap-1">
                              {item.attendeeNames.map((name, i) => (
                                <span key={i} className="rounded bg-slate-50 border border-slate-200/60 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
                                  {name}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </aside>
        )}
      </div>

      {showCreate && (
        <Portal>
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop Overlay */}
            <div
              className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm transition-opacity cursor-pointer"
              onClick={() => {
                setShowCreate(false);
                setShowAttendeeDropdown(false);
              }}
            />

            {/* Modal Content */}
            <form
              onSubmit={(event) => {
                event.preventDefault();
                createEvent();
              }}
              className="relative z-10 w-full max-w-md rounded-xl border border-slate-200/80 bg-white p-6 shadow-xl modal-card"
            >
              <div className="mb-5 flex items-center justify-between">
                <h2 className="text-base font-bold text-slate-950">New event</h2>
                <button
                  type="button"
                  onClick={() => {
                    setShowCreate(false);
                    setShowAttendeeDropdown(false);
                  }}
                  className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 transition-colors"
                  title="Close"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
                {eventError && <div className="rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">{eventError}</div>}
                
                <label className="block text-xs font-semibold text-slate-600">
                  Title
                  <input
                    value={eventTitle}
                    onChange={(event) => setEventTitle(event.target.value)}
                    className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm text-slate-900 bg-white placeholder-slate-400 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 transition-all"
                    required
                  />
                </label>

                <label className="block text-xs font-semibold text-slate-600">
                  Team
                  <SearchDropdown
                    value={eventTeam}
                    onChange={setEventTeam}
                    options={teams}
                    placeholder="Select team..."
                  />
                </label>

                <p className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                  A meeting room link <span className="font-mono">https://teamtime.live/room/…</span> is generated automatically when the event is created.
                </p>

                {/* Multi-Select Attendees Field */}
                <div className="relative">
                  <span className="block text-xs font-semibold text-slate-600 mb-1">Attendees</span>
                  
                  {/* Selected Attendees Badges */}
                  {selectedAttendees.length > 0 && (
                    <div className="mb-2 flex flex-wrap gap-1 max-h-24 overflow-y-auto p-1.5 border border-slate-200/60 rounded-lg bg-slate-50">
                      {selectedAttendees.map((id) => {
                        const userObj = users.find((u) => u.userId === id);
                        return (
                          <span
                            key={id}
                            className="inline-flex items-center gap-1 rounded bg-indigo-50 border border-indigo-100 px-2 py-0.5 text-xs font-bold text-indigo-700"
                          >
                            {userObj?.displayName || 'Unknown'}
                            <button
                              type="button"
                              onClick={() => setSelectedAttendees((prev) => prev.filter((item) => item !== id))}
                              className="text-indigo-400 hover:text-indigo-600 font-bold ml-1"
                            >
                              &times;
                            </button>
                          </span>
                        );
                      })}
                    </div>
                  )}

                  {/* Input Search trigger */}
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      value={attendeeSearch}
                      onChange={(e) => {
                        setAttendeeSearch(e.target.value);
                        setShowAttendeeDropdown(true);
                      }}
                      onFocus={() => setShowAttendeeDropdown(true)}
                      className="h-10 w-full rounded-lg border border-slate-200 pl-9 pr-3 text-sm text-slate-900 bg-white placeholder-slate-400 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 transition-all"
                      placeholder="Search and invite people..."
                    />
                  </div>

                  {/* Dropdown Backdrop */}
                  {showAttendeeDropdown && (
                    <div
                      className="fixed inset-0 z-10"
                      onClick={() => setShowAttendeeDropdown(false)}
                    />
                  )}

                  {/* Dropdown Options */}
                  {showAttendeeDropdown && (
                    <div className="absolute left-0 right-0 z-20 mt-1 max-h-48 overflow-y-auto rounded-lg border border-slate-200 bg-white p-1 shadow-lg">
                      {users
                        .filter((u) =>
                          u.displayName.toLowerCase().includes(attendeeSearch.toLowerCase())
                        )
                        .map((u) => {
                          const isChecked = selectedAttendees.includes(u.userId);
                          return (
                            <button
                              key={u.userId}
                              type="button"
                              onClick={() => {
                                if (isChecked) {
                                  setSelectedAttendees((prev) => prev.filter((id) => id !== u.userId));
                                } else {
                                  setSelectedAttendees((prev) => [...prev, u.userId]);
                                }
                              }}
                              className={`flex w-full items-center justify-between rounded px-3 py-2 text-left text-xs font-semibold transition ${
                                isChecked ? 'bg-indigo-50 text-indigo-700 font-bold' : 'text-slate-700 hover:bg-slate-50'
                              }`}
                            >
                              <span>{u.displayName}</span>
                              {isChecked && <span className="text-indigo-600">✓</span>}
                            </button>
                          );
                        })}
                      {users.filter((u) =>
                        u.displayName.toLowerCase().includes(attendeeSearch.toLowerCase())
                      ).length === 0 && (
                        <div className="px-3 py-3 text-center text-xs italic text-slate-400">No users found</div>
                      )}
                    </div>
                  )}
                </div>

                <label className="block text-xs font-semibold text-slate-600">
                  Date
                  <input
                    value={eventDate}
                    onChange={(event) => setEventDate(event.target.value)}
                    type="date"
                    className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm text-slate-900 bg-white placeholder-slate-400 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 transition-all"
                    required
                  />
                </label>

                <div className="grid grid-cols-2 gap-3">
                  <label className="block text-xs font-semibold text-slate-600">
                    Start
                    <input
                      value={eventStart}
                      onChange={(event) => setEventStart(event.target.value)}
                      type="time"
                      className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm text-slate-900 bg-white placeholder-slate-400 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 transition-all"
                      required
                    />
                  </label>
                  <label className="block text-xs font-semibold text-slate-600">
                    End
                    <input
                      value={eventEnd}
                      onChange={(event) => setEventEnd(event.target.value)}
                      type="time"
                      className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm text-slate-900 bg-white placeholder-slate-400 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 transition-all"
                      required
                    />
                  </label>
                </div>
              </div>

              <div className="mt-5 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowCreate(false);
                    setShowAttendeeDropdown(false);
                  }}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition active:scale-[0.98]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition active:scale-[0.98] shadow-sm shadow-blue-500/10"
                >
                  {creating ? 'Creating...' : 'Create event'}
                </button>
              </div>
            </form>
          </div>
        </Portal>
      )}
    </div>
  );
}
