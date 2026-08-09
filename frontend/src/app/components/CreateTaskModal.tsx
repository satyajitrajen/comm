'use client';

import { useEffect, useState, useMemo } from 'react';
import { Calendar, CheckSquare, Search, X } from 'lucide-react';
import { tasksAPI } from '../../services/api';
import Portal from './Portal';

interface DirectoryPerson {
  userId: string;
  displayName: string;
  email?: string | null;
}

interface CreateTaskModalProps {
  conversationId: string;
  people: DirectoryPerson[];
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function CreateTaskModal({
  conversationId,
  people,
  isOpen,
  onClose,
  onSuccess,
}: CreateTaskModalProps) {
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState('NORMAL');
  const [dueDate, setDueDate] = useState('');
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const toggleAssignee = (userId: string) => {
    setAssigneeIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  const filteredPeople = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return people;
    return people.filter(
      (p) =>
        p.displayName.toLowerCase().includes(q) ||
        p.email?.toLowerCase().includes(q)
    );
  }, [searchQuery, people]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError('Task title is required.');
      return;
    }

    setLoading(true);
    try {
      await tasksAPI.create({
        conversationId,
        title: trimmedTitle,
        priority,
        dueDate: dueDate ? new Date(dueDate).toISOString() : null,
        assigneeIds,
      });
      onSuccess();
      onClose();
    } catch (err) {
      const serverMsg = (err as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
      const msg = Array.isArray(serverMsg) ? serverMsg[0] : serverMsg;
      setError(typeof msg === 'string' && msg.trim() ? msg : 'Failed to create task. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !loading) onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, loading, onClose]);

  if (!isOpen) return null;

  return (
    <Portal>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        {/* Backdrop */}
        <div
          className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm cursor-pointer"
          onClick={onClose}
        />

        {/* Modal container */}
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="task-modal-title"
          className="relative z-10 w-full max-w-md rounded-2xl border border-slate-200/80 bg-white p-6 shadow-2xl transition-all duration-300"
        >
          {/* Header */}
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                <CheckSquare className="h-5 w-5" />
              </div>
              <h2 id="task-modal-title" className="text-base font-bold text-slate-950">Create a Task</h2>
            </div>
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
              title="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {error && (
            <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-700">
              {error}
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Title */}
            <div>
              <label htmlFor="task-title" className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                Task Title
              </label>
              <input
                id="task-title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Submit launch assets, draft release notes..."
                className="h-10 w-full rounded-xl border border-slate-200 px-3.5 text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 transition-all"
                required
              />
            </div>

            {/* Priority */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                Priority
              </label>
              <div className="grid grid-cols-3 gap-2">
                {['NORMAL', 'IMPORTANT', 'URGENT'].map((level) => (
                  <button
                    key={level}
                    type="button"
                    onClick={() => setPriority(level)}
                    className={`h-9 rounded-xl border text-xs font-bold transition-all active:scale-95 cursor-pointer ${
                      priority === level
                        ? level === 'URGENT'
                          ? 'border-rose-500 bg-rose-50 text-rose-700 ring-1 ring-rose-500/20'
                          : level === 'IMPORTANT'
                            ? 'border-amber-500 bg-amber-50 text-amber-700 ring-1 ring-amber-500/20'
                            : 'border-blue-500 bg-blue-50 text-blue-700 ring-1 ring-blue-500/20'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {level.toLowerCase()}
                  </button>
                ))}
              </div>
            </div>

            {/* Due Date */}
            <div>
              <label htmlFor="task-due" className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                Due Date
              </label>
              <div className="relative">
                <Calendar className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  id="task-due"
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="h-10 w-full rounded-xl border border-slate-200 pl-10 pr-3.5 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 transition-all"
                />
              </div>
            </div>

            {/* Assignees Selection */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                Assignees
              </label>
              <div className="relative mb-2">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search assignees..."
                  className="h-9 w-full rounded-xl border border-slate-200 pl-10 pr-3.5 text-xs text-slate-900 placeholder-slate-400 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 transition-all"
                />
              </div>
              <div className="max-h-36 overflow-y-auto border border-slate-100 rounded-xl p-2 bg-slate-50/50 space-y-1">
                {filteredPeople.length === 0 ? (
                  <div className="py-4 text-center text-xs text-slate-400">No members found</div>
                ) : (
                  filteredPeople.map((person) => {
                    const isAssigned = assigneeIds.includes(person.userId);
                    return (
                      <button
                        key={person.userId}
                        type="button"
                        onClick={() => toggleAssignee(person.userId)}
                        className={`flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left transition-colors cursor-pointer ${
                          isAssigned ? 'bg-blue-50/70 text-blue-700' : 'hover:bg-slate-100/50 text-slate-700'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="flex h-5.5 w-5.5 items-center justify-center rounded-full bg-slate-200 text-[9px] font-bold text-slate-600">
                            {person.displayName.charAt(0).toUpperCase()}
                          </div>
                          <div className="truncate">
                            <div className="text-xs font-semibold">{person.displayName}</div>
                          </div>
                        </div>
                        <input
                          type="checkbox"
                          checked={isAssigned}
                          readOnly
                          className="h-3.5 w-3.5 rounded text-blue-600 border-slate-300 focus:ring-blue-500"
                        />
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            {/* Submit and Cancel Buttons */}
            <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 active:scale-95 transition-all"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-50 active:scale-95 transition-all shadow-sm shadow-blue-200"
              >
                {loading ? 'Creating...' : 'Create Task'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </Portal>
  );
}
