'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Plus,
  RefreshCw,
  X,
  Search,
  Pencil,
  Trash2,
  Users,
  Video,
  AlertCircle,
  CheckCircle2,
  Filter,
  Columns,
} from 'lucide-react';
import { calendarAPI, tasksAPI, usersAPI } from '../../../services/api';
import { getChatsFeedCached } from '../../../lib/chatsFeedCache';
import { formatDateTime } from '../_utils';
import { SearchDropdown } from '../../components/SearchDropdown';
import Portal from '../../components/Portal';
import ConfirmDialog from '../../components/ConfirmDialog';

type DirectoryPerson = {
  userId: string;
  displayName: string;
  email?: string | null;
  department?: string | null;
};

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
  createdBy?: string | null;
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
  rawId?: string;
  title: string;
  description?: string | null;
  itemType: 'task' | 'event';
  status: string;
  priority: string;
  startsAt: string;
  endsAt?: string | null;
  source?: string | null;
  assignees?: string[];
  meetingLink?: string | null;
  attendeeNames?: string[];
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
  createdBy?: string | null;
};

const daysShort = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const daysFull = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
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

const monthsShort = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

function eventItem(event: CalendarEvent): CalendarItem {
  return {
    id: `event-${event.id}`,
    rawId: event.id,
    title: event.title,
    description: event.description,
    itemType: 'event',
    status: 'EVENT',
    priority: 'EVENT',
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    source: event.teamName || 'Calendar',
    meetingLink: event.meetingLink,
    attendees: event.attendees,
    createdBy: event.createdBy,
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
    rawId: task.id,
    title: task.title,
    itemType: 'task',
    status: task.status,
    priority: task.priority,
    startsAt: task.dueDate,
    source: task.conversation?.group?.name || 'Workspace',
    assignees: task.assignees?.map((item) => item.user?.profile?.displayName || '').filter(Boolean),
  };
}

function getWeekDays(refDate: Date): Date[] {
  const startOfWeek = new Date(refDate);
  const day = startOfWeek.getDay();
  startOfWeek.setDate(startOfWeek.getDate() - day);
  startOfWeek.setHours(0, 0, 0, 0);

  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(startOfWeek);
    d.setDate(startOfWeek.getDate() + i);
    return d;
  });
}

function isSameDay(d1: Date, d2: Date): boolean {
  return (
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate()
  );
}

function getMonthGridDays(year: number, month: number): Date[] {
  const firstDay = new Date(year, month, 1);
  const startDay = firstDay.getDay(); // 0 is Sunday
  const startDate = new Date(firstDay);
  startDate.setDate(startDate.getDate() - startDay);
  startDate.setHours(0, 0, 0, 0);

  return Array.from({ length: 35 }, (_, i) => {
    const d = new Date(startDate);
    d.setDate(startDate.getDate() + i);
    return d;
  });
}

export default function CalendarPage() {
  const today = useMemo(() => new Date(), []);
  
  // Navigation active date
  const [activeDate, setActiveDate] = useState(() => new Date());
  // Mini Calendar date
  const [miniCalDate, setMiniCalDate] = useState(() => new Date());
  
  const [view, setView] = useState<'day' | 'week' | 'month' | 'list'>('month');
  const [items, setItems] = useState<CalendarItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // Sidebar Calendar visibility filters
  const [showEventsFilter, setShowEventsFilter] = useState(true);
  const [showTasksFilter, setShowTasksFilter] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [viewDropdownOpen, setViewDropdownOpen] = useState(false);
  const [filterDropdownOpen, setFilterDropdownOpen] = useState(false);

  // Feedback Banner / Toast
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Modal State (Create or Edit)
  const [modalMode, setModalMode] = useState<'create' | 'edit' | null>(null);
  const [activeEventId, setActiveEventId] = useState<string | null>(null);
  const [eventTitle, setEventTitle] = useState('');
  const [eventDescription, setEventDescription] = useState('');
  const [eventTeam, setEventTeam] = useState('');
  const [eventDate, setEventDate] = useState(today.toISOString().slice(0, 10));
  const [eventStart, setEventStart] = useState('10:00');
  const [eventEnd, setEventEnd] = useState('10:30');
  const [selectedAttendees, setSelectedAttendees] = useState<string[]>([]);
  const [attendeeSearch, setAttendeeSearch] = useState('');
  const [showAttendeeDropdown, setShowAttendeeDropdown] = useState(false);
  const [notifyAttendeesOnEdit, setNotifyAttendeesOnEdit] = useState(true);
  
  const [modalError, setModalError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Delete Confirmation
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [eventToDelete, setEventToDelete] = useState<{ id: string; title: string } | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [teams, setTeams] = useState<string[]>([]);
  const [users, setUsers] = useState<DirectoryPerson[]>([]);

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

  function showToast(text: string, type: 'success' | 'error' = 'success') {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 4000);
  }

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

  function openCreateModal(defaultDateStr?: string, defaultStartTime?: string) {
    setModalMode('create');
    setActiveEventId(null);
    setEventTitle('');
    setEventDescription('');
    setEventDate(defaultDateStr || activeDate.toISOString().slice(0, 10));
    setEventStart(defaultStartTime || '10:00');
    
    if (defaultStartTime) {
      const [h, m] = defaultStartTime.split(':').map(Number);
      const endH = (h + 1) % 24;
      setEventEnd(`${String(endH).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
    } else {
      setEventEnd('10:30');
    }

    setSelectedAttendees([]);
    setAttendeeSearch('');
    setModalError('');
    setShowAttendeeDropdown(false);
  }

  function openEditModal(item: CalendarItem) {
    if (!item.rawId) return;
    setModalMode('edit');
    setActiveEventId(item.rawId);
    setEventTitle(item.title || '');
    setEventDescription(item.description || '');
    setEventTeam(item.source && item.source !== 'Calendar' && item.source !== 'Workspace' ? item.source : teams[0] || 'Engineering');
    
    const startDt = new Date(item.startsAt);
    setEventDate(startDt.toISOString().slice(0, 10));
    setEventStart(startDt.toTimeString().slice(0, 5));

    if (item.endsAt) {
      const endDt = new Date(item.endsAt);
      setEventEnd(endDt.toTimeString().slice(0, 5));
    } else {
      const endDt = new Date(startDt.getTime() + 30 * 60000);
      setEventEnd(endDt.toTimeString().slice(0, 5));
    }

    const currentAttendeeIds = item.attendees?.map((a) => a.user.id) || [];
    setSelectedAttendees(currentAttendeeIds);
    setAttendeeSearch('');
    setNotifyAttendeesOnEdit(true);
    setModalError('');
    setShowAttendeeDropdown(false);
  }

  async function handleSaveEvent() {
    const title = eventTitle.trim();
    if (!title) {
      setModalError('Title is required');
      return;
    }

    const startsAt = new Date(`${eventDate}T${eventStart}:00`);
    const endsAt = new Date(`${eventDate}T${eventEnd}:00`);
    if (endsAt <= startsAt) {
      setModalError('End time must be after start time.');
      return;
    }

    setModalError('');
    setSubmitting(true);

    try {
      if (modalMode === 'create') {
        const created = await calendarAPI.createEvent({
          title,
          description: eventDescription.trim() || undefined,
          startsAt: startsAt.toISOString(),
          endsAt: endsAt.toISOString(),
          teamName: eventTeam.trim() || undefined,
          attendeeIds: selectedAttendees,
        });
        setItems((currentItems) => [...currentItems, eventItem(created)]);
        showToast(`Event "${title}" created and invitations sent!`);
      } else if (modalMode === 'edit' && activeEventId) {
        const updated = await calendarAPI.updateEvent(activeEventId, {
          title,
          description: eventDescription.trim() || undefined,
          startsAt: startsAt.toISOString(),
          endsAt: endsAt.toISOString(),
          teamName: eventTeam.trim() || undefined,
          attendeeIds: selectedAttendees,
          notifyAttendees: notifyAttendeesOnEdit,
        });
        setItems((currentItems) =>
          currentItems.map((it) => (it.rawId === activeEventId ? eventItem(updated) : it)),
        );
        showToast(`Event "${title}" updated successfully!`);
      }
      setModalMode(null);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message ||
        'Event could not be saved.';
      setModalError(Array.isArray(msg) ? msg.join(', ') : String(msg));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDeleteEvent() {
    if (!eventToDelete) return;
    setDeleting(true);
    try {
      await calendarAPI.deleteEvent(eventToDelete.id);
      setItems((prev) => prev.filter((it) => it.rawId !== eventToDelete.id));
      showToast(`Event "${eventToDelete.title}" deleted.`);
      setDeleteConfirmOpen(false);
      setEventToDelete(null);
      if (modalMode === 'edit') setModalMode(null);
    } catch {
      showToast('Failed to delete event.', 'error');
    } finally {
      setDeleting(false);
    }
  }

  function handleInstantMeetNow() {
    const code = Math.random().toString(36).substring(2, 10);
    const roomUrl = `https://teamtime.live/room/${code}`;
    window.open(roomUrl, '_blank');
  }

  // Navigation handlers
  function handlePrev() {
    setActiveDate((prev) => {
      const d = new Date(prev);
      if (view === 'day') {
        d.setDate(d.getDate() - 1);
      } else if (view === 'week') {
        d.setDate(d.getDate() - 7);
      } else {
        d.setMonth(d.getMonth() - 1);
      }
      setMiniCalDate(new Date(d));
      return d;
    });
  }

  function handleNext() {
    setActiveDate((prev) => {
      const d = new Date(prev);
      if (view === 'day') {
        d.setDate(d.getDate() + 1);
      } else if (view === 'week') {
        d.setDate(d.getDate() + 7);
      } else {
        d.setMonth(d.getMonth() + 1);
      }
      setMiniCalDate(new Date(d));
      return d;
    });
  }

  function handleToday() {
    const now = new Date();
    setActiveDate(now);
    setMiniCalDate(now);
    setView('day');
  }

  // Date math
  const year = activeDate.getFullYear();
  const month = activeDate.getMonth();
  const weekDays = useMemo(() => getWeekDays(activeDate), [activeDate]);
  const monthGridDays = useMemo(() => getMonthGridDays(year, month), [year, month]);

  // Filter items
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      if (item.itemType === 'event' && !showEventsFilter) return false;
      if (item.itemType === 'task' && !showTasksFilter) return false;
      return true;
    });
  }, [items, showEventsFilter, showTasksFilter]);

  // Mini Calendar grid days
  const miniGridDays = useMemo(() => {
    const miniYear = miniCalDate.getFullYear();
    const miniMonth = miniCalDate.getMonth();
    return getMonthGridDays(miniYear, miniMonth);
  }, [miniCalDate]);

  return (
    <div className="flex h-screen w-full select-none overflow-hidden bg-slate-50 text-slate-900 font-sans antialiased">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-5 right-5 z-[70] flex items-center gap-2 rounded-xl bg-slate-900 text-white px-4 py-3 shadow-2xl border border-slate-800 animate-in fade-in slide-in-from-top-2 duration-200">
          {toastMessage.type === 'success' ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
          ) : (
            <AlertCircle className="h-4 w-4 text-rose-400 shrink-0" />
          )}
          <span className="text-xs font-semibold">{toastMessage.text}</span>
        </div>
      )}

      {/* LEFT SIDEBAR (Clean Light Theme) */}
      {sidebarOpen && (
        <aside className="w-64 shrink-0 flex flex-col border-r border-slate-200 bg-white p-4 text-slate-700 overflow-y-auto">
          {/* Header */}
          <div className="flex items-center justify-between pb-3">
            <h1 className="text-base font-bold tracking-tight text-slate-950 flex items-center gap-2">
              <CalendarIcon className="h-5 w-5 text-blue-700" />
              Calendar
            </h1>
          </div>

          {/* Mini Calendar Month & Header */}
          <div className="mt-1 rounded-2xl bg-slate-50/90 p-3.5 border border-slate-200/80 shadow-xs">
            <div className="flex items-center justify-between mb-3 px-1">
              <span className="text-xs font-bold text-slate-900">
                {months[miniCalDate.getMonth()]} {miniCalDate.getFullYear()}
              </span>
              <div className="flex items-center gap-0.5">
                <button
                  onClick={() => {
                    setMiniCalDate((prev) => {
                      const d = new Date(prev);
                      d.setMonth(d.getMonth() - 1);
                      return d;
                    });
                  }}
                  className="rounded-md p-1 text-slate-500 hover:text-slate-900 hover:bg-slate-200/60 transition"
                  title="Previous month"
                >
                  <ChevronUp className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => {
                    setMiniCalDate((prev) => {
                      const d = new Date(prev);
                      d.setMonth(d.getMonth() + 1);
                      return d;
                    });
                  }}
                  className="rounded-md p-1 text-slate-500 hover:text-slate-900 hover:bg-slate-200/60 transition"
                  title="Next month"
                >
                  <ChevronDown className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {/* Mini Days Header */}
            <div className="grid grid-cols-7 text-center text-[10px] font-bold text-slate-400 mb-1">
              {daysShort.map((d, i) => (
                <div key={i}>{d}</div>
              ))}
            </div>

            {/* Mini Dates Grid */}
            <div className="grid grid-cols-7 gap-y-1 text-center text-xs">
              {miniGridDays.slice(0, 35).map((d, i) => {
                const isCurrentMonth = d.getMonth() === miniCalDate.getMonth();
                const isSelected = isSameDay(d, activeDate);
                const isTodayDate = isSameDay(d, today);

                return (
                  <button
                    key={i}
                    onClick={() => {
                      setActiveDate(new Date(d));
                    }}
                    className={`h-7 w-7 mx-auto rounded-full flex items-center justify-center text-[11px] font-semibold transition ${
                      isSelected
                        ? 'bg-blue-700 text-white font-bold shadow-xs'
                        : isTodayDate
                        ? 'border border-blue-600 text-blue-700 font-bold'
                        : isCurrentMonth
                        ? 'text-slate-800 hover:bg-slate-200/60'
                        : 'text-slate-400 hover:text-slate-600'
                    }`}
                  >
                    {d.getDate()}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Add Calendar Button */}
          <div className="mt-4">
            <button
              onClick={() => openCreateModal()}
              className="w-full flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:text-blue-700 transition shadow-2xs"
            >
              <Plus className="h-4 w-4 text-blue-700" />
              <span>Add calendar</span>
            </button>
          </div>

          {/* Calendars / Filter Checkboxes */}
          <div className="mt-6 space-y-3">
            <div className="flex items-center justify-between text-xs font-bold text-slate-500 uppercase tracking-wider px-1">
              <span>My calendars</span>
              <ChevronDown className="h-3.5 w-3.5" />
            </div>

            <div className="space-y-2 px-1">
              <label className="flex items-center gap-2.5 text-xs font-medium text-slate-700 hover:text-slate-950 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={showEventsFilter}
                  onChange={(e) => setShowEventsFilter(e.target.checked)}
                  className="rounded border-slate-300 text-blue-700 focus:ring-blue-500 h-4 w-4"
                />
                <span className="flex items-center gap-1.5 font-semibold">
                  <span className="h-2 w-2 rounded-full bg-blue-600" />
                  Events & Meetings
                </span>
              </label>

              <label className="flex items-center gap-2.5 text-xs font-medium text-slate-700 hover:text-slate-950 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={showTasksFilter}
                  onChange={(e) => setShowTasksFilter(e.target.checked)}
                  className="rounded border-slate-300 text-blue-700 focus:ring-blue-500 h-4 w-4"
                />
                <span className="flex items-center gap-1.5 font-semibold">
                  <span className="h-2 w-2 rounded-full bg-indigo-500" />
                  Tasks & Deadlines
                </span>
              </label>
            </div>

            <div className="pt-2 px-1 flex items-center justify-between">
              <button
                onClick={() => {
                  setShowEventsFilter(true);
                  setShowTasksFilter(true);
                  setView('list');
                }}
                className="text-[11px] font-semibold text-blue-700 hover:text-blue-900 hover:underline cursor-pointer"
                title="View all events & tasks in list view"
              >
                Show all (List)
              </button>
              <button
                onClick={() => {
                  const allSelected = showEventsFilter && showTasksFilter;
                  setShowEventsFilter(!allSelected);
                  setShowTasksFilter(!allSelected);
                }}
                className="text-[11px] font-semibold text-slate-500 hover:text-slate-800 hover:underline cursor-pointer"
              >
                {showEventsFilter && showTasksFilter ? 'Deselect all' : 'Select all'}
              </button>
            </div>
          </div>
        </aside>
      )}

      {/* MAIN CALENDAR CONTAINER */}
      <div className="flex flex-1 flex-col min-w-0 overflow-hidden bg-white">
        {/* TOP TOOLBAR */}
        <header className="relative z-30 flex h-14 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4">
          {/* Left Controls: Sidebar toggle, Today, Carats, Month Title */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen((prev) => !prev)}
              className="rounded-lg p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition"
              title="Toggle left sidebar"
            >
              <Columns className="h-4 w-4" />
            </button>

            {/* Today Jump Button */}
            <button
              onClick={handleToday}
              className="rounded-lg border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition shadow-2xs active:scale-[0.98]"
            >
              Today
            </button>

            {/* Navigation Arrows */}
            <div className="flex items-center gap-0.5">
              <button
                onClick={handlePrev}
                className="rounded-lg p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition"
                title="Previous"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                onClick={handleNext}
                className="rounded-lg p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition"
                title="Next"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            {/* Month & Year Title Dropdown */}
            <div className="flex items-center gap-1.5 text-sm font-bold text-slate-950 px-2">
              <span>{months[month]} {year}</span>
              <ChevronDown className="h-3.5 w-3.5 text-slate-500" />
            </div>
          </div>

          {/* Right Controls: View Switcher, Filter, Meet Now, New Event */}
          <div className="flex items-center gap-2">
            {/* Refresh */}
            <button
              onClick={loadCalendar}
              disabled={loading}
              className="rounded-lg border border-slate-200 p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition"
              title="Refresh calendar"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>

            {/* View Mode Dropdown */}
            <div className="relative">
              <button
                onClick={() => setViewDropdownOpen((prev) => !prev)}
                className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition shadow-2xs"
              >
                <CalendarIcon className="h-3.5 w-3.5 text-blue-700" />
                <span className="capitalize">{view === 'day' ? 'Day' : view}</span>
                <ChevronDown className="h-3 w-3 text-slate-400" />
              </button>

              {viewDropdownOpen && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setViewDropdownOpen(false)}
                  />
                  <div
                    style={{ backgroundColor: '#ffffff', backgroundImage: 'none', backdropFilter: 'none' }}
                    className="absolute right-0 z-50 mt-1 w-36 rounded-xl border border-slate-200 !bg-white p-1.5 shadow-xl animate-in fade-in zoom-in-95 duration-100 dropdown-card"
                  >
                    {(['day', 'week', 'month', 'list'] as const).map((mode) => (
                      <button
                        key={mode}
                        onClick={() => {
                          setView(mode);
                          setViewDropdownOpen(false);
                        }}
                        className={`w-full text-left rounded-lg px-3 py-1.5 text-xs font-semibold capitalize transition ${
                          view === mode ? 'bg-blue-700 text-white font-bold' : 'text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        {mode === 'day' ? 'Day' : mode}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Filter Button */}
            <div className="relative hidden sm:block">
              <button
                onClick={() => setFilterDropdownOpen((prev) => !prev)}
                className={`flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition shadow-2xs ${
                  !showEventsFilter || !showTasksFilter ? 'border-blue-300 text-blue-700 bg-blue-50/50' : ''
                }`}
                title="Filter events and tasks"
              >
                <Filter className="h-3.5 w-3.5 text-slate-500" />
                <span>Filter</span>
                {(!showEventsFilter || !showTasksFilter) && (
                  <span className="h-1.5 w-1.5 rounded-full bg-blue-600" />
                )}
              </button>

              {filterDropdownOpen && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setFilterDropdownOpen(false)}
                  />
                  <div
                    style={{ backgroundColor: '#ffffff', backgroundImage: 'none', backdropFilter: 'none' }}
                    className="absolute right-0 z-50 mt-1 w-52 rounded-xl border border-slate-200 !bg-white p-2.5 shadow-xl animate-in fade-in zoom-in-95 duration-100 dropdown-card"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider px-1 pb-2">
                      Filter Display
                    </div>
                    <div className="space-y-1">
                      <label className="flex items-center gap-2 rounded-lg p-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer transition">
                        <input
                          type="checkbox"
                          checked={showEventsFilter}
                          onChange={(e) => setShowEventsFilter(e.target.checked)}
                          className="rounded border-slate-300 text-blue-700 focus:ring-blue-500 h-4 w-4"
                        />
                        <span className="flex items-center gap-1.5">
                          <span className="h-2 w-2 rounded-full bg-blue-600" />
                          Events & Meetings
                        </span>
                      </label>

                      <label className="flex items-center gap-2 rounded-lg p-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer transition">
                        <input
                          type="checkbox"
                          checked={showTasksFilter}
                          onChange={(e) => setShowTasksFilter(e.target.checked)}
                          className="rounded border-slate-300 text-blue-700 focus:ring-blue-500 h-4 w-4"
                        />
                        <span className="flex items-center gap-1.5">
                          <span className="h-2 w-2 rounded-full bg-indigo-500" />
                          Tasks & Deadlines
                        </span>
                      </label>
                    </div>

                    <div className="mt-2 border-t border-slate-100 pt-2 flex items-center justify-between px-1">
                      <button
                        onClick={() => {
                          setShowEventsFilter(true);
                          setShowTasksFilter(true);
                        }}
                        className="text-[11px] font-semibold text-blue-700 hover:underline"
                      >
                        Reset All
                      </button>
                      <button
                        onClick={() => setFilterDropdownOpen(false)}
                        className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-700 hover:bg-slate-200 transition"
                      >
                        Done
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Meet Now Button */}
            <button
              onClick={handleInstantMeetNow}
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:text-blue-700 transition shadow-2xs"
              title="Start an instant meeting"
            >
              <Video className="h-3.5 w-3.5 text-blue-700" />
              <span className="hidden md:inline">Meet now</span>
            </button>

            {/* New Event Primary Button */}
            <button
              onClick={() => openCreateModal()}
              className="flex items-center gap-1.5 rounded-lg bg-blue-700 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-blue-800 transition shadow-sm active:scale-[0.98]"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>New</span>
            </button>
          </div>
        </header>

        {/* CALENDAR BODY */}
        <main className="flex-1 min-h-0 overflow-y-auto bg-slate-50">
          {error && (
            <div className="m-4 flex items-center justify-between rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700 font-semibold">
              <span>{error}</span>
              <button onClick={loadCalendar} className="hover:underline font-bold">
                Retry
              </button>
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center h-full text-slate-500 text-sm">
              <RefreshCw className="h-5 w-5 animate-spin mr-2 text-blue-700" />
              Loading calendar events...
            </div>
          ) : view === 'month' ? (
            /* ========================================================
               1. MONTH VIEW (TEAMS/OUTLOOK LIGHT GRID)
               ======================================================== */
            <div className="flex flex-col h-full select-none bg-white">
              {/* Day Headers (Sunday to Saturday) */}
              <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50/70 text-center">
                {daysFull.map((d, idx) => (
                  <div
                    key={idx}
                    className="py-2.5 text-xs font-bold text-slate-600 border-r border-slate-200 last:border-r-0"
                  >
                    {d}
                  </div>
                ))}
              </div>

              {/* 5x7 Month Grid Cells */}
              <div className="grid grid-cols-7 grid-rows-5 flex-1 min-h-[640px] bg-white">
                {monthGridDays.map((dateObj, idx) => {
                  const isCurrentMonth = dateObj.getMonth() === month;
                  const isTodayDate = isSameDay(dateObj, today);
                  const isSelected = isSameDay(dateObj, activeDate);
                  const cellEvents = filteredItems.filter((it) => isSameDay(new Date(it.startsAt), dateObj));

                  // Format day label
                  const dayNum = dateObj.getDate();
                  const showMonthLabel = dayNum === 1 || idx === 0;
                  const displayDayLabel = showMonthLabel
                    ? `${dayNum} ${monthsShort[dateObj.getMonth()]}`
                    : `${dayNum < 10 && isCurrentMonth ? `0${dayNum}` : dayNum}`;

                  return (
                    <div
                      key={idx}
                      onClick={() => setActiveDate(new Date(dateObj))}
                      className={`min-h-[115px] border-b border-r border-slate-200 p-2 flex flex-col justify-between transition cursor-pointer group ${
                        isSelected
                          ? 'ring-2 ring-inset ring-blue-600 bg-blue-50/40'
                          : isTodayDate
                          ? 'bg-blue-50/20'
                          : isCurrentMonth
                          ? 'bg-white hover:bg-slate-50/80'
                          : 'bg-slate-50/40 hover:bg-slate-100/50'
                      }`}
                    >
                      {/* Top Day Number */}
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-1">
                          <span
                            className={`flex h-6 items-center justify-center rounded-full px-1.5 text-xs font-bold transition ${
                              isTodayDate
                                ? 'bg-blue-700 text-white shadow-xs'
                                : isCurrentMonth
                                ? 'text-slate-900'
                                : 'text-slate-400'
                            }`}
                          >
                            {displayDayLabel}
                          </span>
                        </div>

                        {/* Hover Quick Add Button */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            openCreateModal(dateObj.toISOString().slice(0, 10));
                          }}
                          className="opacity-0 group-hover:opacity-100 rounded-md p-1 text-slate-400 hover:text-blue-700 hover:bg-blue-50 transition"
                          title="Add event"
                        >
                          <Plus className="h-3 w-3" />
                        </button>
                      </div>

                      {/* Event Cards inside cell */}
                      <div className="space-y-1 overflow-hidden flex-1">
                        {cellEvents.slice(0, 3).map((item) => (
                          <div
                            key={item.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              openEditModal(item);
                            }}
                            className="group/item flex items-center justify-between gap-1 rounded-md bg-indigo-50/90 hover:bg-indigo-100 border-l-2 border-indigo-600 px-2 py-1 text-xs text-indigo-950 shadow-2xs transition"
                            title={`${item.title} (${new Date(item.startsAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})`}
                          >
                            <div className="flex items-center gap-1.5 min-w-0 flex-1">
                              <span className="text-[10px] text-indigo-700 font-semibold shrink-0">
                                {new Date(item.startsAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>
                              <span className="truncate font-semibold text-[11px] text-slate-900">
                                {item.title}
                              </span>
                            </div>

                            {item.meetingLink && (
                              <a
                                href={item.meetingLink}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="text-indigo-600 hover:text-indigo-900 p-0.5"
                                title="Join Meeting"
                              >
                                <Video className="h-3 w-3" />
                              </a>
                            )}
                          </div>
                        ))}

                        {cellEvents.length > 3 && (
                          <div className="text-[10px] font-bold text-blue-700 pl-1">
                            +{cellEvents.length - 3} more
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : view === 'week' ? (
            /* ========================================================
               2. WEEK VIEW (HOURLY 7 COLUMNS LIGHT)
               ======================================================== */
            <div className="flex flex-col h-full select-none bg-white">
              {/* Day Headers Row */}
              <div className="grid grid-cols-[64px_repeat(7,1fr)] border-b border-slate-200 bg-slate-50/80 sticky top-0 z-20">
                <div className="p-3 border-r border-slate-200 text-center text-[10px] font-bold text-slate-500 uppercase">
                  Time
                </div>
                {weekDays.map((dateObj, i) => {
                  const isTodayDate = isSameDay(dateObj, today);
                  const isSelected = isSameDay(dateObj, activeDate);
                  return (
                    <div
                      key={i}
                      className={`p-2.5 text-center border-r border-slate-200 last:border-r-0 ${
                        isSelected ? 'bg-blue-50/50' : ''
                      }`}
                    >
                      <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                        {daysFull[dateObj.getDay()]}
                      </div>
                      <div className="mt-1 flex justify-center">
                        <button
                          onClick={() => setActiveDate(new Date(dateObj))}
                          className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition ${
                            isTodayDate
                              ? 'bg-blue-700 text-white shadow-xs'
                              : isSelected
                              ? 'bg-blue-100 text-blue-800'
                              : 'text-slate-800 hover:bg-slate-200/60'
                          }`}
                        >
                          {dateObj.getDate()}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* 24-Hour Time Grid Scrollable */}
              <div className="overflow-y-auto divide-y divide-slate-100">
                {Array.from({ length: 24 }, (_, h) => {
                  const hourFormatted = h === 0 ? '12 AM' : h < 12 ? `${h} AM` : h === 12 ? '12 PM' : `${h - 12} PM`;
                  const hourPad = String(h).padStart(2, '0');

                  return (
                    <div key={h} className="grid grid-cols-[64px_repeat(7,1fr)] min-h-[56px]">
                      {/* Left Hour Label */}
                      <div className="p-2 border-r border-slate-200 text-right text-[10px] font-semibold text-slate-400 select-none bg-slate-50/50">
                        {hourFormatted}
                      </div>

                      {/* 7 Day Hour Slots */}
                      {weekDays.map((dateObj, dayIdx) => {
                        const cellEvents = filteredItems.filter((it) => {
                          const dt = new Date(it.startsAt);
                          return isSameDay(dt, dateObj) && dt.getHours() === h;
                        });

                        return (
                          <div
                            key={dayIdx}
                            onClick={() => {
                              openCreateModal(dateObj.toISOString().slice(0, 10), `${hourPad}:00`);
                            }}
                            className="p-1 border-r border-slate-100 last:border-r-0 hover:bg-blue-50/40 transition cursor-pointer relative group flex flex-col gap-1 min-h-[56px]"
                            title={`Add event on ${dateObj.toLocaleDateString()} at ${hourFormatted}`}
                          >
                            {cellEvents.map((item) => (
                              <div
                                key={item.id}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openEditModal(item);
                                }}
                                className="rounded-md bg-indigo-50 border-l-2 border-indigo-600 p-1.5 text-xs text-indigo-950 shadow-2xs hover:bg-indigo-100 transition truncate"
                                title={`${item.title} (${new Date(item.startsAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})`}
                              >
                                <div className="flex items-center gap-1">
                                  <span className="font-bold text-[11px] text-slate-900 truncate">{item.title}</span>
                                </div>
                                <div className="text-[10px] text-indigo-700 font-semibold">
                                  {new Date(item.startsAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </div>
                              </div>
                            ))}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : view === 'day' ? (
            /* ========================================================
               3. DAY VIEW (HOURLY SCHEDULE LIGHT)
               ======================================================== */
            <div className="flex flex-col h-full bg-white">
              <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50/80 px-6 py-3">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-bold text-slate-900">
                    {activeDate.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                  </span>
                  <span className="rounded-full bg-blue-50 text-blue-700 border border-blue-100 px-2.5 py-0.5 text-xs font-semibold">
                    {filteredItems.filter((it) => isSameDay(new Date(it.startsAt), activeDate)).length} scheduled
                  </span>
                </div>
                <button
                  onClick={() => openCreateModal(activeDate.toISOString().slice(0, 10))}
                  className="flex items-center gap-1.5 rounded-lg bg-blue-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-blue-800 transition"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add Event
                </button>
              </div>

              <div className="overflow-y-auto divide-y divide-slate-100">
                {Array.from({ length: 24 }, (_, h) => {
                  const hourFormatted = h === 0 ? '12 AM' : h < 12 ? `${h} AM` : h === 12 ? '12 PM' : `${h - 12} PM`;
                  const hourPad = String(h).padStart(2, '0');
                  const dayEvents = filteredItems.filter((it) => {
                    const dt = new Date(it.startsAt);
                    return isSameDay(dt, activeDate) && dt.getHours() === h;
                  });

                  return (
                    <div key={h} className="flex min-h-[60px] group hover:bg-slate-50/60 transition">
                      <div className="w-20 shrink-0 border-r border-slate-200 py-2 px-3 text-right text-[11px] font-semibold text-slate-400">
                        {hourFormatted}
                      </div>

                      <div
                        onClick={(e) => {
                          if (e.target === e.currentTarget) {
                            openCreateModal(activeDate.toISOString().slice(0, 10), `${hourPad}:00`);
                          }
                        }}
                        className="flex-1 p-2 flex flex-col gap-2 cursor-pointer"
                      >
                        {dayEvents.map((item) => (
                          <div
                            key={item.id}
                            className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-3.5 shadow-xs hover:border-blue-300 hover:shadow-md transition"
                          >
                            <div className="flex items-start gap-3 min-w-0">
                              <span className="mt-1 h-2.5 w-2.5 rounded-full bg-blue-600" />
                              <div>
                                <div className="text-sm font-bold text-slate-900">{item.title}</div>
                                <div className="text-xs text-blue-700 font-semibold mt-0.5">
                                  {new Date(item.startsAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                  {item.endsAt && ` – ${new Date(item.endsAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
                                </div>
                                {item.attendeeNames && item.attendeeNames.length > 0 && (
                                  <div className="text-xs text-slate-500 mt-1 flex items-center gap-1">
                                    <Users className="h-3 w-3 text-indigo-600" />
                                    {item.attendeeNames.join(', ')}
                                  </div>
                                )}
                              </div>
                            </div>

                            <div className="flex items-center gap-1.5">
                              {item.meetingLink && (
                                <a
                                  href={item.meetingLink}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="rounded-lg bg-blue-50 border border-blue-100 px-3 py-1.5 text-xs font-bold text-blue-700 hover:bg-blue-100 transition flex items-center gap-1"
                                >
                                  <Video className="h-3.5 w-3.5" />
                                  Join
                                </a>
                              )}
                              <button
                                onClick={() => openEditModal(item)}
                                className="rounded-lg border border-slate-200 p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition"
                                title="Edit"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            /* ========================================================
               4. LIST VIEW (CHRONOLOGICAL LIGHT)
               ======================================================== */
            <div className="p-6 space-y-3 max-w-4xl mx-auto">
              {filteredItems.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-12 text-center rounded-2xl border border-dashed border-slate-200 bg-white">
                  <CalendarIcon className="h-10 w-10 text-slate-300 mb-2" />
                  <h3 className="text-sm font-bold text-slate-700">No events or tasks found</h3>
                  <p className="text-xs text-slate-400 mt-1 max-w-xs">
                    There are no scheduled items to display with the current filters.
                  </p>
                  <button
                    onClick={() => {
                      setShowEventsFilter(true);
                      setShowTasksFilter(true);
                    }}
                    className="mt-4 rounded-lg bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-700 hover:bg-blue-100 transition"
                  >
                    Reset Filters
                  </button>
                </div>
              ) : (
                filteredItems.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 hover:shadow-md transition"
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <span className="mt-1.5 h-2.5 w-2.5 rounded-full bg-blue-600" />
                    <div>
                      <div className="text-sm font-bold text-slate-900">{item.title}</div>
                      <div className="text-xs text-blue-700 font-semibold mt-0.5">
                        {formatDateTime(item.startsAt)}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {item.meetingLink && (
                      <a
                        href={item.meetingLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-lg bg-blue-50 border border-blue-100 px-3 py-1.5 text-xs font-bold text-blue-700 hover:bg-blue-100 transition"
                      >
                        Join
                      </a>
                    )}
                    <button
                      onClick={() => openEditModal(item)}
                      className="rounded-lg border border-slate-200 p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              )))}
            </div>
          )}
        </main>
      </div>

      {/* CREATE / EDIT EVENT MODAL (Clean Light Aesthetic) */}
      {modalMode !== null && (
        <Portal>
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div
              className="absolute inset-0 bg-slate-950/40 backdrop-blur-xs transition-opacity cursor-pointer"
              onClick={() => {
                setModalMode(null);
                setShowAttendeeDropdown(false);
              }}
            />

            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSaveEvent();
              }}
              className="relative z-10 w-full max-w-2xl rounded-2xl border border-slate-200 bg-white text-slate-900 p-7 shadow-2xl animate-in fade-in zoom-in-95 duration-150 modal-card"
            >
              <div className="mb-6 flex items-center justify-between border-b border-slate-100 pb-3.5">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
                    <CalendarIcon className="h-4 w-4" />
                  </div>
                  <h2 className="text-base font-bold text-slate-950">
                    {modalMode === 'create' ? 'Schedule New Event' : 'Edit Event'}
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setModalMode(null);
                    setShowAttendeeDropdown(false);
                  }}
                  className="rounded-lg p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="space-y-4 max-h-[75vh] overflow-y-auto pr-1">
                {modalError && (
                  <div className="rounded-lg bg-red-50 border border-red-100 px-3.5 py-2.5 text-xs font-semibold text-red-700 flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    <span>{modalError}</span>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                  <label className="block text-xs font-semibold text-slate-700 sm:col-span-2">
                    Event Title
                    <input
                      value={eventTitle}
                      onChange={(e) => setEventTitle(e.target.value)}
                      placeholder="e.g. Daily Standup call"
                      className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all"
                      required
                    />
                  </label>

                  <label className="block text-xs font-semibold text-slate-700 sm:col-span-1">
                    Team / Department
                    <SearchDropdown
                      value={eventTeam}
                      onChange={setEventTeam}
                      options={teams}
                      placeholder="Select team..."
                    />
                  </label>
                </div>

                <label className="block text-xs font-semibold text-slate-700">
                  Description / Agenda
                  <textarea
                    value={eventDescription}
                    onChange={(e) => setEventDescription(e.target.value)}
                    placeholder="Add meeting agenda or notes..."
                    rows={2}
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white p-2.5 text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all resize-none"
                  />
                </label>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                  <label className="block text-xs font-semibold text-slate-700">
                    Date
                    <input
                      value={eventDate}
                      onChange={(e) => setEventDate(e.target.value)}
                      type="date"
                      className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all"
                      required
                    />
                  </label>
                  <label className="block text-xs font-semibold text-slate-700">
                    Start Time
                    <input
                      value={eventStart}
                      onChange={(e) => setEventStart(e.target.value)}
                      type="time"
                      className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all"
                      required
                    />
                  </label>
                  <label className="block text-xs font-semibold text-slate-700">
                    End Time
                    <input
                      value={eventEnd}
                      onChange={(e) => setEventEnd(e.target.value)}
                      type="time"
                      className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all"
                      required
                    />
                  </label>
                </div>

                {/* Attendees */}
                <div className="relative">
                  <div className="flex items-center justify-between mb-1">
                    <span className="block text-xs font-semibold text-slate-700">Invite Attendees</span>
                    <span className="text-[11px] font-medium text-slate-500">{selectedAttendees.length} selected</span>
                  </div>

                  {selectedAttendees.length > 0 && (
                    <div className="mb-2 flex flex-wrap gap-1.5 max-h-28 overflow-y-auto p-2 border border-slate-200 rounded-lg bg-slate-50">
                      {selectedAttendees.map((id) => {
                        const userObj = users.find((u) => u.userId === id);
                        return (
                          <span
                            key={id}
                            className="inline-flex items-center gap-1.5 rounded-md bg-indigo-50 border border-indigo-100 pl-2 pr-1 py-1 text-xs font-semibold text-indigo-700"
                          >
                            <span>{userObj?.displayName || 'User'}</span>
                            <button
                              type="button"
                              onClick={() => setSelectedAttendees((prev) => prev.filter((item) => item !== id))}
                              className="text-indigo-400 hover:text-indigo-700 p-0.5 rounded transition"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </span>
                        );
                      })}
                    </div>
                  )}

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
                      className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-8 text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all"
                      placeholder="Search workspace members to invite..."
                    />
                    {attendeeSearch && (
                      <button
                        type="button"
                        onClick={() => {
                          setAttendeeSearch('');
                          setShowAttendeeDropdown(false);
                        }}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>

                  {showAttendeeDropdown && (
                    <div className="mt-2 max-h-56 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-md dropdown-card relative z-30 divide-y divide-slate-50">
                      {users
                        .filter((u) =>
                          u.displayName?.toLowerCase().includes(attendeeSearch.toLowerCase()) ||
                          u.email?.toLowerCase().includes(attendeeSearch.toLowerCase())
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
                              className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-xs font-semibold transition ${
                                isChecked ? 'bg-indigo-50 text-indigo-700 font-bold' : 'text-slate-700 hover:bg-slate-50'
                              }`}
                            >
                              <div className="flex items-center gap-2">
                                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-indigo-100 text-indigo-700 text-[11px] font-bold">
                                  {u.displayName?.charAt(0)?.toUpperCase() || 'U'}
                                </div>
                                <div>
                                  <div className="text-slate-900">{u.displayName}</div>
                                  {u.email && <div className="text-[10px] text-slate-400 font-normal">{u.email}</div>}
                                </div>
                              </div>
                              {isChecked ? (
                                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-indigo-600 text-white text-xs font-bold">✓</span>
                              ) : (
                                <span className="text-[11px] text-blue-600 font-medium hover:underline">+ Add</span>
                              )}
                            </button>
                          );
                        })}
                      {users.filter((u) =>
                        u.displayName?.toLowerCase().includes(attendeeSearch.toLowerCase()) ||
                        u.email?.toLowerCase().includes(attendeeSearch.toLowerCase())
                      ).length === 0 && (
                        <div className="py-4 text-center text-xs text-slate-400">
                          No members found matching &quot;{attendeeSearch}&quot;
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {modalMode === 'edit' && (
                  <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 pt-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={notifyAttendeesOnEdit}
                      onChange={(e) => setNotifyAttendeesOnEdit(e.target.checked)}
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 h-4 w-4"
                    />
                    <span>Send update notification & calendar invite to attendees</span>
                  </label>
                )}
              </div>

              <div className="mt-7 flex items-center justify-between border-t border-slate-100 pt-4">
                {modalMode === 'edit' && activeEventId ? (
                  <button
                    type="button"
                    onClick={() => {
                      setEventToDelete({ id: activeEventId, title: eventTitle });
                      setDeleteConfirmOpen(true);
                    }}
                    className="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 transition"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete
                  </button>
                ) : <div />}

                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => {
                      setModalMode(null);
                      setShowAttendeeDropdown(false);
                    }}
                    className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition active:scale-[0.98]"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="rounded-lg bg-blue-700 px-5 py-2 text-xs font-bold text-white hover:bg-blue-800 disabled:opacity-50 transition active:scale-[0.98] shadow-sm"
                  >
                    {submitting ? 'Saving...' : modalMode === 'create' ? 'Create Event' : 'Save Changes'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </Portal>
      )}

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        open={deleteConfirmOpen}
        title="Delete Calendar Event"
        description={`Are you sure you want to delete "${eventToDelete?.title}"? All attendees will be removed.`}
        confirmLabel="Delete Event"
        variant="danger"
        loading={deleting}
        onConfirm={handleDeleteEvent}
        onCancel={() => {
          setDeleteConfirmOpen(false);
          setEventToDelete(null);
        }}
      />
    </div>
  );
}
