'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Smile,
  Reply,
  Copy,
  Edit2,
  Trash2,
  Forward,
  Star,
  Pin,
  MoreHorizontal,
  Check,
  X,
  Send,
  AlertTriangle,
  Calendar,
  Video,
} from 'lucide-react';
import { initials, avatarAccent, formatDateOnly, formatDateShort } from '../(app)/_utils';
import Portal from './Portal';
import LinkPreview from './LinkPreview';
import { FormattedMessageContent } from '../../lib/tabularMessageContent';
import { useCallStore } from '@/store/useCallStore';
import { callRoomName } from '@/lib/callRoom';

const QUICK_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

export type MessageAction =
  | 'react'
  | 'unreact'
  | 'reply'
  | 'copy'
  | 'edit'
  | 'delete'
  | 'forward'
  | 'star'
  | 'unstar'
  | 'pin'
  | 'unpin'
  | 'votePoll'
  | 'toggleTask';

export interface PollData {
  id: string;
  question: string;
  isMultiSelect: boolean;
  expiresAt?: string | null;
  options: Array<{ id: string; optionText: string; displayOrder: number }>;
  votes: Array<{ id: string; optionId: string; userId: string; user?: { profile?: { displayName?: string | null } | null } | null }>;
}

export interface TaskData {
  id: string;
  title: string;
  status: string;
  priority: string;
  dueDate?: string | null;
  assignees?: Array<{ user?: { profile?: { displayName?: string | null } | null } | null }>;
}

export interface MessageBubbleProps {
  id: string;
  content: string;
  author: string;
  timestamp: string;
  isOwn?: boolean;
  isEdited?: boolean;
  isDeletedGlobally?: boolean;
  /** Already-tallied reactions [{emoji, count, reactedByMe}] */
  reactions?: Array<{ emoji: string; count: number; reactedByMe: boolean }>;
  replyCount?: number;
  variant?: 'channel' | 'dm';
  avatarNode?: React.ReactNode;
  authorAvatarUrl?: string | null;
  attachmentsNode?: React.ReactNode;
  canEdit?: boolean;
  /** Shared ticking timestamp so canEditMessage expires without per-bubble intervals. */
  now?: number;
  isStarred?: boolean;
  isPinned?: boolean;
  /** Conversations available for forward picker [{id, name}] */
  availableConversations?: Array<{ id: string; name: string }>;
  onAction?: (action: MessageAction, payload?: string) => Promise<void> | void;
  messageType?: string;
  conversationId?: string;
  conversationName?: string;
  isCallActive?: boolean;
  polls?: PollData | null;
  tasks?: TaskData[] | null;
  currentUserId?: string;
  createdAt?: string;
  /** Read receipts from the backend */
  reads?: Array<{ userId: string; readAt?: string }>;
  /** Delivery receipts from the backend */
  deliveries?: Array<{ userId: string; deliveredAt?: string }>;
}

interface PollCardProps {
  polls: PollData;
  currentUserId?: string;
  onAction?: (action: MessageAction, payload?: string) => Promise<void> | void;
  isOwn?: boolean;
}

function PollCard({ polls, currentUserId, onAction }: PollCardProps) {
  const totalVotes = polls.votes?.length || 0;
  const [now] = useState(() => Date.now());
  const isExpired = polls.expiresAt ? new Date(polls.expiresAt).getTime() < now : false;

  const handleVote = (optionId: string) => {
    if (isExpired) return;
    onAction?.('votePoll', optionId);
  };

  const sortedOptions = [...(polls.options || [])].sort((a, b) => a.displayOrder - b.displayOrder);

  return (
    <div className="mt-2 p-4 rounded-xl border border-slate-200 bg-slate-50/50 shadow-sm max-w-lg text-slate-900">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-base">📊</span>
        <span className="text-sm font-bold text-slate-800">{polls.question}</span>
        {isExpired && (
          <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-bold text-slate-600">Closed</span>
        )}
      </div>

      <div className="space-y-2.5">
        {sortedOptions.map((opt) => {
          const optVotes = polls.votes?.filter((v) => v.optionId === opt.id) || [];
          const pct = totalVotes > 0 ? Math.round((optVotes.length / totalVotes) * 100) : 0;
          const hasVoted = optVotes.some((v) => v.userId === currentUserId);

          return (
            <div
              key={opt.id}
              onClick={() => handleVote(opt.id)}
              className={`relative overflow-hidden rounded-xl border p-3 text-sm transition-all duration-200 ${
                isExpired
                  ? 'border-slate-100 bg-white/60 cursor-not-allowed'
                  : 'border-slate-200 bg-white hover:border-blue-400 hover:shadow-sm cursor-pointer'
              } ${hasVoted ? 'border-blue-400 ring-1 ring-blue-400/20' : ''}`}
            >
              <div
                style={{ width: `${pct}%` }}
                className={`absolute inset-y-0 left-0 transition-all duration-300 ${
                  hasVoted ? 'bg-blue-500/10' : 'bg-slate-500/5'
                }`}
              />

              <div className="relative z-10 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <div className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition-colors ${
                    hasVoted
                      ? 'border-blue-600 bg-blue-600 text-white'
                      : 'border-slate-300'
                  }`}>
                    {hasVoted && <div className="h-1.5 w-1.5 rounded-full bg-white" />}
                  </div>
                  <span className="font-semibold text-slate-800">{opt.optionText}</span>
                </div>
                <div className="text-xs font-bold text-slate-500">
                  {optVotes.length} {optVotes.length === 1 ? 'vote' : 'votes'} ({pct}%)
                </div>
              </div>

              {optVotes.length > 0 && (
                <div className="relative z-10 mt-2 flex items-center gap-1.5">
                  <div className="flex -space-x-1.5 overflow-hidden">
                    {optVotes.slice(0, 5).map((v) => {
                      const name = v.user?.profile?.displayName || 'Workspace member';
                      return (
                        <span
                          key={v.id}
                          title={name}
                          className={`flex h-5 w-5 items-center justify-center rounded-full border border-white text-[9px] font-bold ${avatarAccent(name)}`}
                        >
                          {initials(name)}
                        </span>
                      );
                    })}
                  </div>
                  {optVotes.length > 5 && (
                    <span className="text-[10px] text-slate-400 font-medium">
                      +{optVotes.length - 5} more
                    </span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-3 flex items-center justify-between text-[11px] text-slate-400 font-medium border-t border-slate-100 pt-2.5">
        <div>
          Total: {totalVotes} {totalVotes === 1 ? 'vote' : 'votes'}
        </div>
        {polls.expiresAt && !isExpired && (
          <div className="flex items-center gap-1">
            <span>Closes: {formatDateOnly(polls.expiresAt)}</span>
          </div>
        )}
      </div>
    </div>
  );
}

interface TaskCardProps {
  task: TaskData;
  onAction?: (action: MessageAction, payload?: string) => Promise<void> | void;
  isOwn?: boolean;
}

function TaskCard({ task, onAction }: TaskCardProps) {
  const isCompleted = task.status === 'COMPLETED';

  const handleToggle = () => {
    onAction?.('toggleTask', task.id);
  };

  const priorityColors = (priority: string) => {
    if (priority === 'URGENT') return 'bg-rose-50 border border-rose-200 text-rose-700';
    if (priority === 'IMPORTANT') return 'bg-amber-50 border border-amber-200 text-amber-700';
    return 'bg-blue-50 border border-blue-200 text-blue-700';
  };

  return (
    <div className="mt-2 flex flex-col gap-2 p-3.5 rounded-xl border border-slate-200 bg-slate-50/50 shadow-sm max-w-md text-slate-900">
      <div className="flex items-start gap-2.5">
        <button
          onClick={handleToggle}
          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border mt-0.5 transition-colors ${
            isCompleted
              ? 'border-emerald-600 bg-emerald-600 text-white'
              : 'border-slate-300 bg-white hover:border-blue-500'
          }`}
          title={isCompleted ? 'Mark incomplete' : 'Mark complete'}
        >
          {isCompleted && <Check className="h-3.5 w-3.5" />}
        </button>
        <div className="flex-1 min-w-0">
          <span className={`block text-sm font-semibold text-slate-800 leading-snug break-words ${isCompleted ? 'line-through text-slate-400' : ''}`}>
            {task.title}
          </span>

          <div className="mt-2.5 flex flex-wrap items-center gap-2 text-xs">
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${priorityColors(task.priority)}`}>
              {task.priority.toLowerCase()}
            </span>

            {task.dueDate && (
              <span className="flex items-center gap-1 text-[11px] font-medium text-slate-500">
                <Calendar className="h-3.5 w-3.5 text-slate-400" />
                <span>Due {formatDateShort(task.dueDate)}</span>
              </span>
            )}

            {task.assignees && task.assignees.length > 0 && (
              <div className="flex items-center gap-1">
                <span className="text-slate-400 text-[10px]">Assigned to:</span>
                <div className="flex -space-x-1">
                  {task.assignees.map((assignee, idx) => {
                    const name = assignee.user?.profile?.displayName || 'Member';
                    return (
                      <span
                        key={`${name}-${idx}`}
                        title={name}
                        className={`flex h-4 w-4 items-center justify-center rounded-full border border-white text-[8px] font-extrabold ${avatarAccent(name)}`}
                      >
                        {initials(name)}
                      </span>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function useClickOutside(ref: React.RefObject<HTMLElement | null>, handler: () => void) {
  useEffect(() => {
    const listener = (event: MouseEvent | TouchEvent) => {
      if (!ref.current || ref.current.contains(event.target as Node)) return;
      handler();
    };
    document.addEventListener('mousedown', listener);
    document.addEventListener('touchstart', listener);
    return () => {
      document.removeEventListener('mousedown', listener);
      document.removeEventListener('touchstart', listener);
    };
  }, [ref, handler]);
}

/**
 * One shared ticking timestamp for a message list. Parent calls this once and
 * passes the value down, so edit windows expire without an interval per bubble.
 */
export function useNow(intervalMs = 10_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}

export function MessageBubble({
  id,
  content,
  author,
  timestamp,
  isOwn = false,
  isEdited = false,
  isDeletedGlobally = false,
  reactions = [],
  replyCount = 0,
  variant = 'channel',
  avatarNode,
  authorAvatarUrl,
  attachmentsNode,
  canEdit = false,
  now,
  isStarred = false,
  isPinned = false,
  availableConversations = [],
  onAction,
  messageType,
  conversationId,
  conversationName,
  isCallActive = false,
  polls,
  tasks,
  createdAt,
  currentUserId,
  reads = [],
  deliveries = [],
}: MessageBubbleProps) {
  const [hovered, setHovered] = useState(false);
  const [loadedPreviews, setLoadedPreviews] = useState<Set<string>>(new Set());
  // Derived from the shared `now` prop instead of a per-bubble interval; the
  // lazy state fallback covers callers that do not pass one.
  const [fallbackNow] = useState(() => Date.now());
  const canEditMessage =
    canEdit &&
    (!createdAt || (now ?? fallbackNow) - new Date(createdAt).getTime() < 5 * 60 * 1000);
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [forwardPickerOpen, setForwardPickerOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editDraft, setEditDraft] = useState(content);
  const [copied, setCopied] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Local optimistic state
  const [localStarred, setLocalStarred] = useState(isStarred);
  const [localPinned, setLocalPinned] = useState(isPinned);
  const [localDeleted, setLocalDeleted] = useState(isDeletedGlobally);

  const articleRef = useRef<HTMLDivElement>(null);
  const emojiRef = useRef<HTMLDivElement>(null);
  const moreRef = useRef<HTMLDivElement>(null);
  const deleteRef = useRef<HTMLDivElement>(null);
  const forwardRef = useRef<HTMLDivElement>(null);
  const editInputRef = useRef<HTMLTextAreaElement>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleHide = useCallback(() => {
    hideTimerRef.current = setTimeout(() => setHovered(false), 500);
  }, []);

  const cancelHide = useCallback(() => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, []);

  useClickOutside(emojiRef, () => setEmojiPickerOpen(false));
  useClickOutside(moreRef, () => setMoreMenuOpen(false));
  useClickOutside(deleteRef, () => setDeleteConfirmOpen(false));
  useClickOutside(forwardRef, () => setForwardPickerOpen(false));

  useEffect(() => {
    if (editMode && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.selectionStart = editInputRef.current.value.length;
    }
  }, [editMode]);

  const closeAll = useCallback(() => {
    setEmojiPickerOpen(false);
    setMoreMenuOpen(false);
    setDeleteConfirmOpen(false);
    setForwardPickerOpen(false);
    setHovered(false);
  }, []);

  async function callAction(action: MessageAction, payload?: string) {
    setActionLoading(action);
    try {
      await onAction?.(action, payload);
    } finally {
      setActionLoading(null);
    }
  }

  function handleCopy() {
    navigator.clipboard.writeText(content).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    closeAll();
  }

  async function handleEmojiReact(emoji: string) {
    setEmojiPickerOpen(false);
    const existing = reactions.find((r) => r.emoji === emoji);
    if (existing?.reactedByMe) {
      await callAction('unreact', emoji);
    } else {
      await callAction('react', emoji);
    }
  }

  async function handleStar() {
    setMoreMenuOpen(false);
    setLocalStarred((v) => !v);
    await callAction(localStarred ? 'unstar' : 'star');
  }

  async function handlePin() {
    setMoreMenuOpen(false);
    setLocalPinned((v) => !v);
    await callAction(localPinned ? 'unpin' : 'pin');
  }

  async function handleDeleteForMe() {
    setDeleteConfirmOpen(false);
    closeAll();
    setLocalDeleted(true);
    await callAction('delete', 'me');
  }

  async function handleDeleteForEveryone() {
    setDeleteConfirmOpen(false);
    closeAll();
    setLocalDeleted(true);
    await callAction('delete', 'everyone');
  }

  async function handleEditSave() {
    if (!editDraft.trim() || editDraft === content) {
      setEditMode(false);
      return;
    }
    setEditMode(false);
    await callAction('edit', editDraft.trim());
  }

  async function handleForward(targetId: string) {
    setForwardPickerOpen(false);
    closeAll();
    await callAction('forward', targetId);
  }

  const isDm = variant === 'dm';

  const systemTypes: Record<string, { icon: string; color: string }> = {
    SYSTEM_JOIN:         { icon: '→',  color: 'text-emerald-600 bg-emerald-50 border-emerald-200' },
    SYSTEM_LEAVE:        { icon: '←',  color: 'text-slate-500  bg-slate-50  border-slate-200'   },
    SYSTEM_CALL_START:   { icon: '📹', color: 'text-blue-600   bg-blue-50   border-blue-200'    },
    SYSTEM_CALL_END:     { icon: '📹', color: 'text-slate-500  bg-slate-50  border-slate-200'   },
    SYSTEM_CALL_DECLINE: { icon: '📹', color: 'text-rose-600   bg-rose-50   border-rose-200'    },
  };

  if (messageType && systemTypes[messageType]) {
    const { color } = systemTypes[messageType];
    const isCallStart = messageType === 'SYSTEM_CALL_START';
    return (
      <div className="flex items-center justify-center gap-3 py-1.5 select-none">
        <div className="h-px flex-1 bg-slate-100 dark:bg-slate-800" />
        <span className={`flex items-center gap-2 rounded-full border px-3.5 py-1 text-[11px] font-medium shadow-sm ${color}`}>
          <span>{content}</span>
          <span className="text-[10px] opacity-60 ml-0.5">{timestamp}</span>
          {isCallStart && isCallActive && conversationId && (
            <button
              type="button"
              onClick={() => {
                const store = useCallStore.getState();
                store.joinCall(
                  conversationId,
                  callRoomName(conversationId),
                  conversationName || author || 'Video Call',
                );
              }}
              className="ml-1.5 flex items-center gap-1 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white px-2.5 py-0.5 text-[11px] font-semibold shadow transition active:scale-95 cursor-pointer"
            >
              <Video className="h-3 w-3" />
              <span>Join Call</span>
            </button>
          )}
        </span>
        <div className="h-px flex-1 bg-slate-100 dark:bg-slate-800" />
      </div>
    );
  }

  if (localDeleted) {
    return (
      <div className={`group flex gap-3 ${isOwn ? 'flex-row-reverse' : ''}`}>
        {avatarNode && <div className="shrink-0">{avatarNode}</div>}
        <div className={`italic text-slate-400 text-sm py-1 ${isOwn ? 'text-right' : ''}`}>
          {isOwn ? 'You deleted this message' : 'This message was deleted'}
        </div>
      </div>
    );
  }

  const bubbleClass = isDm
    ? isOwn
      ? 'bg-blue-600 text-white rounded-2xl rounded-tr-sm px-4 py-2.5 max-w-xl shadow-sm'
      : 'bg-white border border-slate-200 text-slate-900 rounded-2xl rounded-tl-sm px-4 py-2.5 max-w-xl shadow-sm'
    : '';

  let displayContent = content;
  if (messageType === 'FILE' && displayContent && displayContent.startsWith('Shared ')) {
    displayContent = '';
  }

  const urlRegex = /(https?:\/\/[^\s]+)/g;
  let urlsInMessage: string[] = [];
  if (displayContent && typeof displayContent === 'string') {
    const matches = displayContent.match(urlRegex);
    if (matches) {
      urlsInMessage = Array.from(new Set(matches)).slice(0, 3);
    }
  }

  let finalDisplayContent = displayContent || '';
  if (urlsInMessage.length > 0) {
    loadedPreviews.forEach((url) => {
      finalDisplayContent = finalDisplayContent.replace(url, '').trim();
    });
  }

  const hasBubbleContent = !!finalDisplayContent || editMode || (messageType === 'POLL' && polls) || (messageType === 'TASK' && tasks && tasks.length > 0) || (isDm && !isOwn && author);

  const anyPopupOpen = emojiPickerOpen || moreMenuOpen || deleteConfirmOpen || forwardPickerOpen;

  const mainActions = [
    { icon: Smile, label: 'React', action: () => setEmojiPickerOpen((v) => !v), active: emojiPickerOpen },
    { icon: Reply, label: 'Reply', action: () => { onAction?.('reply'); closeAll(); }, active: false },
    {
      icon: copied ? Check : Copy,
      label: copied ? 'Copied!' : 'Copy',
      action: handleCopy,
      active: false,
    },
    {
      icon: Forward,
      label: 'Forward',
      action: () => { setForwardPickerOpen((v) => !v); setMoreMenuOpen(false); },
      active: forwardPickerOpen,
    },
    { icon: MoreHorizontal, label: 'More', action: () => { setMoreMenuOpen((v) => !v); setEmojiPickerOpen(false); }, active: moreMenuOpen },
  ];

  const moreMenuItems = [
    ...(canEditMessage
      ? [{ icon: Edit2, label: 'Edit', color: '', action: () => { setMoreMenuOpen(false); closeAll(); setEditMode(true); setEditDraft(content); } }]
      : []),
    {
      icon: localStarred ? Star : Star,
      label: localStarred ? 'Unstar message' : 'Star message',
      color: localStarred ? 'text-amber-500' : '',
      action: handleStar,
    },
    {
      icon: Pin,
      label: localPinned ? 'Unpin message' : 'Pin message',
      color: localPinned ? 'text-blue-600' : '',
      action: handlePin,
    },
    {
      icon: Trash2,
      label: 'Delete',
      color: 'text-red-600',
      action: () => { setMoreMenuOpen(false); setDeleteConfirmOpen(true); },
    },
  ];

  return (
    <div
      ref={articleRef}
      className={`group relative flex gap-3 ${isOwn ? 'flex-row-reverse' : ''}`}
      onMouseEnter={() => { cancelHide(); setHovered(true); }}
      onMouseLeave={() => { if (!anyPopupOpen) scheduleHide(); }}
      data-message-id={id}
    >
      {(authorAvatarUrl || avatarNode) && (
        <div className="shrink-0">
          {authorAvatarUrl ? (
            <img src={authorAvatarUrl} alt={author} className="h-9 w-9 rounded-full object-cover shadow-xs border border-slate-200" />
          ) : (
            avatarNode
          )}
        </div>
      )}

      {/* Message body */}
      <div className={`relative min-w-0 ${isDm ? '' : 'flex-1'}`}>
        {!isDm && (
          <div className={`flex items-center gap-2 text-sm mb-0.5 ${isOwn ? 'flex-row-reverse' : ''}`}>
            {!isOwn && <span className="font-semibold text-slate-950">{author}</span>}
            <span className="text-xs text-slate-400">{timestamp}</span>
            {localStarred && <span title="Starred" className="text-amber-400">⭐</span>}
            {localPinned && <span title="Pinned" className="text-blue-500">📌</span>}
            {isEdited && <span className="text-xs text-slate-400 italic">(edited)</span>}
          </div>
        )}

        {/* Bubble */}
        {hasBubbleContent && (
          <div className={bubbleClass}>
            {isDm && !isOwn && (
              <div className="mb-1 text-xs font-semibold text-slate-500">{author}</div>
            )}

            {/* Inline edit mode */}
            {editMode ? (
              <div className="flex flex-col gap-2">
                <textarea
                  ref={editInputRef}
                  value={editDraft}
                  onChange={(e) => setEditDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleEditSave(); }
                    if (e.key === 'Escape') { setEditMode(false); setEditDraft(content); }
                  }}
                  className="w-full min-h-[60px] resize-none rounded-lg border border-blue-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-blue-400"
                  rows={3}
                />
                <div className="flex items-center gap-2 text-xs">
                  <button
                    onClick={handleEditSave}
                    disabled={!editDraft.trim() || actionLoading === 'edit'}
                    className="flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    <Send className="h-3 w-3" /> Save
                  </button>
                  <button
                    onClick={() => { setEditMode(false); setEditDraft(content); }}
                    className="flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-slate-600 hover:bg-slate-50"
                  >
                    <X className="h-3 w-3" /> Cancel
                  </button>
                  <span className="text-slate-400">Enter to save · Esc to cancel</span>
                </div>
              </div>
            ) : messageType === 'POLL' && polls ? (
              <PollCard polls={polls} currentUserId={currentUserId} onAction={onAction} isOwn={isOwn} />
            ) : messageType === 'TASK' && tasks && tasks.length > 0 ? (
              <div className="space-y-2">
                {tasks.map((task: TaskData) => (
                  <TaskCard key={task.id} task={task} onAction={onAction} isOwn={isOwn} />
                ))}
              </div>
            ) : (
              finalDisplayContent ? (
                <FormattedMessageContent
                  content={finalDisplayContent}
                  currentUserId={currentUserId}
                  tone={isDm && isOwn ? 'dm-own' : isDm ? 'dm' : 'default'}
                  className={`${isDm && isOwn ? 'text-white' : isDm ? 'text-slate-900' : 'text-slate-700'} ${isOwn && !isDm ? 'text-right' : ''}`}
                />
              ) : null
            )}

            {isDm && !editMode && (
              <div className={`mt-1 flex items-center gap-1.5 text-[10px] ${isOwn ? 'text-blue-200 justify-end' : 'text-slate-400'}`}>
                <span>{timestamp}</span>
                {localStarred && <span title="Starred">⭐</span>}
                {localPinned && <span title="Pinned">📌</span>}
                {isEdited && <span className="italic">(edited)</span>}
                {isOwn && (
                  <span
                    className={`ml-0.5 font-semibold ${
                      reads && reads.filter(r => r.userId !== currentUserId).length > 0
                        ? 'text-blue-300'
                        : deliveries && deliveries.filter(d => d.userId !== currentUserId).length > 0
                        ? 'text-blue-300/60'
                        : 'text-blue-200/50'
                    }`}
                    title={
                      reads && reads.filter(r => r.userId !== currentUserId).length > 0
                        ? 'Seen'
                        : deliveries && deliveries.filter(d => d.userId !== currentUserId).length > 0
                        ? 'Delivered'
                        : 'Sent'
                    }
                  >
                    {reads && reads.filter(r => r.userId !== currentUserId).length > 0
                      ? '✓✓'
                      : deliveries && deliveries.filter(d => d.userId !== currentUserId).length > 0
                      ? '✓✓'
                      : '✓'}
                  </span>
                )}
              </div>
            )}
          </div>
        )}

        {attachmentsNode && !editMode && <div className={`mt-2 flex ${isOwn ? 'justify-end' : 'justify-start'}`}>{attachmentsNode}</div>}

        {urlsInMessage.length > 0 && !editMode && (
          <div className={`mt-2 flex flex-col gap-2 ${isOwn ? 'items-end' : 'items-start'}`}>
            {urlsInMessage.map(url => (
              <LinkPreview 
                key={url} 
                url={url} 
                isOwn={isDm && isOwn}
                onLoadSuccess={() => {
                  setLoadedPreviews(prev => {
                    const next = new Set(prev);
                    next.add(url);
                    return next;
                  });
                }}
              />
            ))}
          </div>
        )}

        {!hasBubbleContent && isDm && !editMode && (
          <div className={`mt-1 flex items-center gap-2 text-[10px] text-slate-400 ${isOwn ? 'justify-end' : 'justify-start'}`}>
            <span>{timestamp}</span>
            {localStarred && <span title="Starred">⭐</span>}
            {localPinned && <span title="Pinned">📌</span>}
          </div>
        )}

        {/* Existing reactions */}
        {reactions.length > 0 && !editMode && (
          <div className={`mt-2 flex flex-wrap items-center gap-1.5 ${isOwn ? 'justify-end' : ''}`}>
            {reactions.map(({ emoji, count, reactedByMe }) => (
              <button
                key={emoji}
                onClick={() => handleEmojiReact(emoji)}
                className={`flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold shadow-sm transition ${
                  reactedByMe
                    ? 'border-blue-400 bg-blue-50 text-blue-700'
                    : 'border-slate-200 bg-white text-slate-700 hover:border-blue-300 hover:bg-blue-50'
                }`}
              >
                <span>{emoji}</span>
                <span className="text-[11px]">{count}</span>
              </button>
            ))}
          </div>
        )}

        {/* Thread reply count */}
        {replyCount > 0 && !editMode && (
          <div className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
            <button
              onClick={() => onAction?.('reply')}
              className="mt-1 flex items-center gap-1.5 rounded-lg px-1 py-0.5 text-xs font-semibold text-blue-600 hover:bg-blue-50 transition"
            >
            <Reply className="h-3 w-3" />
              {replyCount} {replyCount === 1 ? 'reply' : 'replies'}
            </button>
          </div>
        )}
      </div>

      {/* Floating action bar via Portal */}
      {(hovered || anyPopupOpen) && !editMode && (
        <Portal>
          <FloatingBar
            articleRef={articleRef}
            isDm={isDm}
            isOwn={isOwn}
            mainActions={mainActions}
            moreMenuItems={moreMenuItems}
            emojiPickerOpen={emojiPickerOpen}
            moreMenuOpen={moreMenuOpen}
            deleteConfirmOpen={deleteConfirmOpen}
            forwardPickerOpen={forwardPickerOpen}
            emojiRef={emojiRef}
            moreRef={moreRef}
            deleteRef={deleteRef}
            forwardRef={forwardRef}
            handleEmojiReact={handleEmojiReact}
            handleDeleteForMe={handleDeleteForMe}
            handleDeleteForEveryone={handleDeleteForEveryone}
            handleForward={handleForward}
            availableConversations={availableConversations}
            actionLoading={actionLoading}
            onBarEnter={cancelHide}
            onBarLeave={scheduleHide}
            onCancelDelete={closeAll}
          />
        </Portal>
      )}
    </div>
  );
}

/* ---------- Floating action bar (portal) ---------- */

interface FloatingBarProps {
  articleRef: React.RefObject<HTMLDivElement | null>;
  isDm: boolean;
  isOwn: boolean;
  mainActions: Array<{ icon: React.ComponentType<{ className?: string }>; label: string; action: () => void; active: boolean }>;
  moreMenuItems: Array<{ icon: React.ComponentType<{ className?: string }>; label: string; color: string; action: () => void }>;
  emojiPickerOpen: boolean;
  moreMenuOpen: boolean;
  deleteConfirmOpen: boolean;
  forwardPickerOpen: boolean;
  emojiRef: React.RefObject<HTMLDivElement | null>;
  moreRef: React.RefObject<HTMLDivElement | null>;
  deleteRef: React.RefObject<HTMLDivElement | null>;
  forwardRef: React.RefObject<HTMLDivElement | null>;
  handleEmojiReact: (emoji: string) => void;
  handleDeleteForMe: () => void;
  handleDeleteForEveryone: () => void;
  handleForward: (targetId: string) => void;
  availableConversations: Array<{ id: string; name: string }>;
  actionLoading: string | null;
  onBarEnter: () => void;
  onBarLeave: () => void;
  onCancelDelete: () => void;
}

function FloatingBar({
  articleRef,
  isOwn,
  mainActions,
  moreMenuItems,
  emojiPickerOpen,
  moreMenuOpen,
  deleteConfirmOpen,
  forwardPickerOpen,
  emojiRef,
  moreRef,
  deleteRef,
  forwardRef,
  handleEmojiReact,
  handleDeleteForMe,
  handleDeleteForEveryone,
  handleForward,
  availableConversations,
  onBarEnter,
  onBarLeave,
  onCancelDelete,
}: FloatingBarProps) {
  const [rect, setRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    if (articleRef.current) {
      setRect(articleRef.current.getBoundingClientRect());
    }
  }, [articleRef]);

  if (!rect) return null;

  // Position toolbar at the TOP-RIGHT of the message, overlapping the top edge by 4px so there's zero gap
  const toolbarTop = rect.top - 38;
  const toolbarLeft = isOwn ? undefined : rect.left + 44;
  const toolbarRight = isOwn ? window.innerWidth - rect.right : undefined;

  // Sub-menus open BELOW the toolbar (downward)
  const popupTop = rect.top + 8;

  return (
    // Single wrapper that keeps hover alive when mouse travels between message and bar
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 199, pointerEvents: 'none' }}
    >
      {/* Main action pill — pointer-events re-enabled with invisible padding zone to bridge mouse travel */}
      <div
        onMouseEnter={onBarEnter}
        onMouseLeave={onBarLeave}
        style={{
          position: 'fixed',
          top: Math.max(4, toolbarTop - 12),
          left: toolbarLeft !== undefined ? toolbarLeft - 16 : undefined,
          right: toolbarRight !== undefined ? toolbarRight - 16 : undefined,
          zIndex: 200,
          pointerEvents: 'auto',
          padding: '12px 16px 16px 16px',
        }}
      >
        <div className="flex items-center gap-0.5 rounded-xl border border-slate-200 bg-white px-1 py-1 shadow-lg shadow-slate-200/60">
          {mainActions.map(({ icon: Icon, label, action, active }) => (
            <button
              key={label}
              onClick={action}
              title={label}
              className={`relative flex h-8 w-8 items-center justify-center rounded-lg transition active:scale-95 ${
                active ? 'bg-slate-100 text-slate-900' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'
              }`}
            >
              <Icon className="h-4 w-4" />
            </button>
          ))}
        </div>
      </div>

      {/* Emoji picker popup */}
      {emojiPickerOpen && (
        <div
          ref={emojiRef}
          onMouseEnter={onBarEnter}
          onMouseLeave={onBarLeave}
          style={{
            position: 'fixed',
            top: Math.max(4, popupTop),
            left: toolbarLeft,
            right: toolbarRight,
            zIndex: 201,
            pointerEvents: 'auto',
          }}
          className="flex gap-1.5 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl"
        >
          {QUICK_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              onClick={() => handleEmojiReact(emoji)}
              className="flex h-9 w-9 items-center justify-center rounded-xl text-xl transition hover:bg-slate-100 hover:scale-125 active:scale-105"
            >
              {emoji}
            </button>
          ))}
        </div>
      )}

      {/* More menu */}
      {moreMenuOpen && (
        <div
          ref={moreRef}
          onMouseEnter={onBarEnter}
          onMouseLeave={onBarLeave}
          style={{
            position: 'fixed',
            top: Math.max(4, popupTop),
            left: toolbarLeft,
            right: toolbarRight,
            zIndex: 201,
            pointerEvents: 'auto',
          }}
          className="w-48 rounded-xl border border-slate-200 bg-white py-1 shadow-xl"
        >
          {moreMenuItems.map(({ icon: Icon, label, color, action }) => (
            <button
              key={label}
              onClick={action}
              className={`flex w-full items-center gap-3 px-4 py-2.5 text-sm transition hover:bg-slate-50 ${color || 'text-slate-700'}`}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {label}
            </button>
          ))}
        </div>
      )}

      {/* Delete confirmation */}
      {deleteConfirmOpen && (
        <div
          ref={deleteRef}
          onMouseEnter={onBarEnter}
          onMouseLeave={onBarLeave}
          style={{
            position: 'fixed',
            top: Math.max(4, popupTop),
            left: toolbarLeft,
            right: toolbarRight,
            zIndex: 201,
            pointerEvents: 'auto',
          }}
          className="w-64 rounded-xl border border-red-200 bg-white p-4 shadow-xl"
        >
          <div className="flex items-center gap-2 text-red-600 font-semibold text-sm mb-3">
            <AlertTriangle className="h-4 w-4" />
            Delete message?
          </div>
          <div className="space-y-2">
            {isOwn && (
              <button
                onClick={handleDeleteForEveryone}
                className="flex w-full items-center justify-center rounded-lg bg-red-600 px-3 py-2 text-xs font-semibold text-white hover:bg-red-700 transition"
              >
                Delete for everyone
              </button>
            )}
            <button
              onClick={handleDeleteForMe}
              className="flex w-full items-center justify-center rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
            >
              Delete for me
            </button>
            <button
              onClick={onCancelDelete}
              className="flex w-full items-center justify-center rounded-lg px-3 py-1 text-xs text-slate-400 hover:text-slate-600 transition"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Forward picker */}
      {forwardPickerOpen && (
        <div
          ref={forwardRef}
          onMouseEnter={onBarEnter}
          onMouseLeave={onBarLeave}
          style={{
            position: 'fixed',
            top: Math.max(4, popupTop),
            left: toolbarLeft,
            right: toolbarRight,
            zIndex: 201,
            pointerEvents: 'auto',
          }}
          className="w-64 rounded-xl border border-slate-200 bg-white shadow-xl"
        >
          <div className="border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-700">
            Forward to...
          </div>
          {availableConversations.length === 0 ? (
            <div className="px-4 py-4 text-xs text-slate-400">No conversations available</div>
          ) : (
            <div className="max-h-56 overflow-y-auto py-1">
              {availableConversations.map((conv) => (
                <button
                  key={conv.id}
                  onClick={() => handleForward(conv.id)}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-slate-700 transition hover:bg-slate-50"
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700">
                    {conv.name.charAt(0).toUpperCase()}
                  </span>
                  <span className="truncate">{conv.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
