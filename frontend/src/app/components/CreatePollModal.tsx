'use client';

import { useEffect, useState } from 'react';
import { Plus, Trash2, X, BarChart2 } from 'lucide-react';
import { messagesAPI } from '../../services/api';
import Portal from './Portal';

interface CreatePollModalProps {
  conversationId: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function CreatePollModal({
  conversationId,
  isOpen,
  onClose,
  onSuccess,
}: CreatePollModalProps) {
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState<string[]>(['', '']);
  const [isMultiSelect, setIsMultiSelect] = useState(false);
  const [expiresAt, setExpiresAt] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !loading) onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, loading, onClose]);

  if (!isOpen) return null;

  const handleAddOption = () => {
    setOptions([...options, '']);
  };

  const handleRemoveOption = (index: number) => {
    if (options.length <= 2) return;
    setOptions(options.filter((_, idx) => idx !== index));
  };

  const handleOptionChange = (index: number, val: string) => {
    const next = [...options];
    next[index] = val;
    setOptions(next);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const trimmedQuestion = question.trim();
    const filteredOptions = options.map((o) => o.trim()).filter(Boolean);

    if (!trimmedQuestion) {
      setError('Question is required.');
      return;
    }

    if (filteredOptions.length < 2) {
      setError('At least two options are required.');
      return;
    }

    setLoading(true);
    try {
      await messagesAPI.createPoll({
        conversationId,
        question: trimmedQuestion,
        options: filteredOptions,
        isMultiSelect,
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : undefined,
      });
      onSuccess();
      onClose();
    } catch (err) {
      const serverMsg = (err as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
      const msg = Array.isArray(serverMsg) ? serverMsg[0] : serverMsg;
      setError(typeof msg === 'string' && msg.trim() ? msg : 'Failed to create poll. Please try again.');
    } finally {
      setLoading(false);
    }
  };

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
          aria-labelledby="poll-modal-title"
          className="relative z-10 w-full max-w-md rounded-2xl border border-slate-200/80 bg-white p-6 shadow-2xl transition-all duration-300"
        >
          {/* Header */}
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                <BarChart2 className="h-5 w-5" />
              </div>
              <h2 id="poll-modal-title" className="text-base font-bold text-slate-950">Create a Poll</h2>
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
            {/* Question */}
            <div>
              <label htmlFor="poll-question" className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                Question
              </label>
              <input
                id="poll-question"
                type="text"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="What is your question?"
                className="h-10 w-full rounded-xl border border-slate-200 px-3.5 text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 transition-all"
                required
              />
            </div>

            {/* Options */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                Options
              </label>
              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {options.map((opt, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <input
                      type="text"
                      value={opt}
                      onChange={(e) => handleOptionChange(index, e.target.value)}
                      placeholder={`Option ${index + 1}`}
                      className="h-10 flex-1 rounded-xl border border-slate-200 px-3.5 text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 transition-all"
                      required
                    />
                    {options.length > 2 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveOption(index)}
                        className="rounded-xl p-2.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition-all active:scale-95"
                        title="Remove Option"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={handleAddOption}
                className="mt-2.5 flex items-center gap-1.5 text-xs font-bold text-blue-600 hover:text-blue-700 active:scale-95 transition-all"
              >
                <Plus className="h-4.5 w-4.5" />
                Add option
              </button>
            </div>

            {/* Multi-select Toggle */}
            <div className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50/50 p-3">
              <div>
                <div className="text-xs font-bold text-slate-700">Allow Multiple Choices</div>
                <div className="text-[10px] text-slate-400">Voters can select more than one option</div>
              </div>
              <label className="relative inline-flex cursor-pointer items-center">
                <input
                  type="checkbox"
                  checked={isMultiSelect}
                  onChange={(e) => setIsMultiSelect(e.target.checked)}
                  className="peer sr-only"
                />
                <div className="h-6 w-11 rounded-full bg-slate-200 transition-colors after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-blue-600 peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:outline-none" />
              </label>
            </div>

            {/* Expiry Date (Optional) */}
            <div>
              <label htmlFor="poll-expiry" className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                Expiration (Optional)
              </label>
              <input
                id="poll-expiry"
                type="datetime-local"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
                className="h-10 w-full rounded-xl border border-slate-200 px-3.5 text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 transition-all"
              />
            </div>

            {/* Buttons */}
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
                {loading ? 'Creating...' : 'Create Poll'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </Portal>
  );
}
