'use client';

import { ChangeEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react';
import { applyMention, findMentionQuery, type MentionQuery } from '../../lib/mentions';
import { avatarAccent, initials } from '../(app)/_utils';

export type MentionCandidate = {
  userId: string;
  displayName: string;
  email?: string | null;
};

type ChatComposerInputProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  /** People who can be @mentioned here — normally the conversation members. */
  mentionCandidates?: MentionCandidate[];
};

const MIN_TEXTAREA_HEIGHT = 32;
const MAX_TEXTAREA_HEIGHT = 128;

function resizeTextarea(textarea: HTMLTextAreaElement) {
  textarea.style.height = 'auto';
  textarea.style.height = `${Math.min(
    Math.max(textarea.scrollHeight, MIN_TEXTAREA_HEIGHT),
    MAX_TEXTAREA_HEIGHT,
  )}px`;
}

const MAX_SUGGESTIONS = 6;

export default function ChatComposerInput({
  value,
  onChange,
  placeholder,
  disabled = false,
  className = '',
  mentionCandidates = [],
}: ChatComposerInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [mentionQuery, setMentionQuery] = useState<MentionQuery | null>(null);
  const [highlighted, setHighlighted] = useState(0);

  useEffect(() => {
    if (textareaRef.current) {
      resizeTextarea(textareaRef.current);
    }
  }, [value]);

  const suggestions = useMemo(() => {
    if (!mentionQuery) return [];
    const q = mentionQuery.query;
    return mentionCandidates
      .filter((person) =>
        !q ||
        person.displayName.toLowerCase().includes(q) ||
        (person.email || '').toLowerCase().includes(q),
      )
      .slice(0, MAX_SUGGESTIONS);
  }, [mentionQuery, mentionCandidates]);

  const isPickerOpen = mentionQuery !== null && suggestions.length > 0;

  // Keep the highlight in range as the candidate list narrows while typing.
  useEffect(() => {
    setHighlighted((current) => (current < suggestions.length ? current : 0));
  }, [suggestions.length]);

  function syncMentionQuery(textarea: HTMLTextAreaElement) {
    setMentionQuery(findMentionQuery(textarea.value, textarea.selectionStart ?? 0));
  }

  function handleChange(event: ChangeEvent<HTMLTextAreaElement>) {
    onChange(event.target.value);
    resizeTextarea(event.target);
    syncMentionQuery(event.target);
  }

  function choose(person: MentionCandidate) {
    const textarea = textareaRef.current;
    if (!textarea || !mentionQuery) return;

    const result = applyMention(
      textarea.value,
      textarea.selectionStart ?? textarea.value.length,
      mentionQuery,
      person,
    );
    onChange(result.value);
    setMentionQuery(null);
    setHighlighted(0);

    // Restore the caret after React commits the new value.
    window.setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(result.caret, result.caret);
      resizeTextarea(textarea);
    }, 0);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (isPickerOpen) {
      // While the picker is open these keys drive it rather than the composer,
      // so Enter must not send a half-typed mention.
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setHighlighted((i) => (i + 1) % suggestions.length);
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setHighlighted((i) => (i - 1 + suggestions.length) % suggestions.length);
        return;
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        event.preventDefault();
        choose(suggestions[highlighted]);
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        setMentionQuery(null);
        return;
      }
    }

    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  }

  return (
    <div className="relative flex min-w-0 flex-1 items-center">
      {isPickerOpen && (
        <div
          role="listbox"
          aria-label="Mention a person"
          className="absolute bottom-full left-0 z-50 mb-2 w-72 overflow-hidden rounded-xl border border-slate-200 bg-white p-1 shadow-lg"
        >
          {suggestions.map((person, index) => (
            <button
              key={person.userId}
              type="button"
              role="option"
              aria-selected={index === highlighted}
              // onMouseDown so the textarea does not blur before the click lands.
              onMouseDown={(event) => {
                event.preventDefault();
                choose(person);
              }}
              onMouseEnter={() => setHighlighted(index)}
              className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition ${
                index === highlighted ? 'bg-blue-50' : 'hover:bg-slate-50'
              }`}
            >
              <span
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${avatarAccent(person.displayName)}`}
              >
                {initials(person.displayName)}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-slate-900">
                  {person.displayName}
                </span>
                {person.email && (
                  <span className="block truncate text-[11px] text-slate-400">{person.email}</span>
                )}
              </span>
            </button>
          ))}
        </div>
      )}

      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onKeyUp={(event) => syncMentionQuery(event.currentTarget)}
        onClick={(event) => syncMentionQuery(event.currentTarget)}
        onBlur={() => setMentionQuery(null)}
        disabled={disabled}
        rows={1}
        placeholder={placeholder}
        className={`min-h-8 min-w-0 w-full resize-none overflow-y-auto bg-transparent px-1.5 py-1.5 text-sm leading-5 outline-none placeholder:text-slate-400 text-slate-900 max-h-32 ${className}`}
      />
    </div>
  );
}
