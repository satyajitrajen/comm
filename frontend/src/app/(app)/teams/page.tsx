'use client';

import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import {
  Check,
  Download,
  Eye,
  FileText,
  Hash,
  MessageSquare,
  Plus,
  RefreshCw,
  Send,
  Upload,
  Users,
  X,
  Paperclip,
  Smile,
  BarChart2,
  CheckSquare,
  ChevronLeft,
  Video,
  Search,
  Pin,
  Command,
  Sparkles,
  PhoneCall,
} from 'lucide-react';
import { MessageBubble, PollData, TaskData } from '../../components/MessageBubble';
import { callsAPI, chatsAPI, filesAPI, messagesAPI, tasksAPI, usersAPI } from '../../../services/api';
import { toPlainText } from '../../../lib/mentions';
import { avatarAccent, canPreviewFile, formatFileSize, initials, MAX_UPLOAD_BYTES, MAX_UPLOAD_LABEL, openBlobPreview, saveBlob, timeAgo } from '../_utils';
import Portal from '../../components/Portal';
import { SearchDropdown } from '../../components/SearchDropdown';
import CreatePollModal from '../../components/CreatePollModal';
import CreateTaskModal from '../../components/CreateTaskModal';
import ChatComposerInput from '../../components/ChatComposerInput';
import ChannelInfoPanel from '../../components/ChannelInfoPanel';
import UploadProgressIndicator from '../../components/UploadProgressIndicator';
import LeaveChannelDialog, {
  type TransferCandidate,
} from '../../../lib/LeaveChannelDialog';
import { FormattedMessageContent } from '../../../lib/tabularMessageContent';
import {
  debounce,
  getChatsFeedCached,
  invalidateChatsFeed,
} from '../../../lib/chatsFeedCache';
import { useCallStore } from '../../../store/useCallStore';
import { callRoomName } from '../../../lib/callRoom';
import { resolveServiceBaseUrl } from '../../../lib/desktopRuntime';

type GroupInfo = {
  name?: string | null;
  description?: string | null;
  teamName?: string | null;
  channelSlug?: string | null;
  spaceType?: string | null;
  isReadOnly?: boolean | null;
};

type ChatItem = {
  conversationId: string;
  type: string;
  name?: string | null;
  group?: GroupInfo | null;
  isMember?: boolean;
  unreadCount?: number;
  lastMessage?: { content?: string | null; createdAt?: string | null } | null;
};

type BackendMessage = {
  id: string;
  senderId?: string;
  replyToMessageId?: string | null;
  content?: string | null;
  createdAt: string;
  isEdited?: boolean;
  isDeletedGlobally?: boolean;
  isPinned?: boolean;
  pinnedMessages?: Array<{ userId: string }> | null;
  sender?: { profile?: { displayName?: string | null } | null } | null;
  reactions?: Array<{ emoji: string; userId?: string }> | null;
  attachments?: Array<{ file?: FileItem | null }> | null;
  messageType?: string;
  polls?: PollData | null;
  tasks?: TaskData[] | null;
};

type FileItem = {
  id: string;
  filename: string;
  mimeType: string;
  fileSizeBytes: string | number;
  createdAt: string;
  uploader?: { profile?: { displayName?: string | null } | null } | null;
};

type TaskItem = {
  id: string;
  title: string;
  status: string;
  priority: string;
  dueDate?: string | null;
  conversationId?: string;
  conversation?: { id?: string; group?: { name?: string | null } | null } | null;
  assignees?: Array<{ user?: { profile?: { displayName?: string | null } | null } | null }>;
};

type DirectoryPerson = {
  userId: string;
  displayName: string;
  email?: string | null;
  department?: string | null;
};

function spaceLabel(spaceType?: string | null) {
  if (spaceType === 'ANNOUNCEMENT') return 'Announcements';
  if (spaceType === 'LEADERSHIP') return 'Leadership';
  if (spaceType === 'ORG_FEED') return 'All company';
  if (spaceType === 'DEPARTMENT') return 'Department';
  return 'Team channel';
}

function ImageAttachment({ fileId, filename }: { fileId: string; filename: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let objectUrl: string;
    filesAPI.download(fileId)
      .then((res) => {
        objectUrl = URL.createObjectURL(res.data);
        setSrc(objectUrl);
      })
      .catch(console.error);
    return () => { if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [fileId]);
  
  if (!src) return <div className="h-32 w-32 animate-pulse bg-slate-200 rounded-lg"></div>;
  return <img src={src} alt={filename} className="max-w-full max-h-64 rounded-lg object-contain cursor-pointer" onClick={() => window.open(src)} />;
}

function reactionCounts(reactions: Array<{ emoji: string; userId?: string }> | null | undefined, currentUserId?: string) {
  const counts = (reactions || []).reduce<Record<string, { count: number; reactedByMe: boolean }>>((acc, r) => {
    if (!acc[r.emoji]) acc[r.emoji] = { count: 0, reactedByMe: false };
    acc[r.emoji].count += 1;
    if (currentUserId && r.userId === currentUserId) acc[r.emoji].reactedByMe = true;
    return acc;
  }, {});
  return Object.entries(counts).map(([emoji, { count, reactedByMe }]) => ({ emoji, count, reactedByMe }));
}

function channelName(chat: ChatItem) {
  return chat.group?.name || chat.name || 'Channel';
}

function teamName(chat: ChatItem) {
  return chat.group?.teamName || 'Workspace';
}

export default function TeamsPage() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const chatFileInputRef = useRef<HTMLInputElement | null>(null);
  const [chats, setChats] = useState<ChatItem[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [messages, setMessages] = useState<BackendMessage[]>([]);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [people, setPeople] = useState<DirectoryPerson[]>([]);
  const [activeTab, setActiveTab] = useState<'messages' | 'threads' | 'files' | 'tasks' | 'pinned' | 'calls'>('messages');
  const [showQuickSwitcher, setShowQuickSwitcher] = useState(false);
  const [quickSearchQuery, setQuickSearchQuery] = useState('');
  const [draft, setDraft] = useState('');
  const [threadDraft, setThreadDraft] = useState('');
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDue, setNewTaskDue] = useState('');
  const [newTaskPriority, setNewTaskPriority] = useState('NORMAL');
  const [showCreate, setShowCreate] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createTeam, setCreateTeam] = useState('');
  const [createDescription, setCreateDescription] = useState('');
  const [createSpaceType, setCreateSpaceType] = useState('TEAM_CHANNEL');
  const [createParticipantIds, setCreateParticipantIds] = useState<string[]>([]);
  const [createMemberSearch, setCreateMemberSearch] = useState('');
  const [loadingChats, setLoadingChats] = useState(true);
  const [loadingSurface, setLoadingSurface] = useState(false);
  // Cursor paging state for scroll-up history loading.
  const messageScrollRef = useRef<HTMLDivElement | null>(null);
  const [hasMoreMessages, setHasMoreMessages] = useState(false);
  const [olderCursor, setOlderCursor] = useState<string | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  /** Whether the transcript should follow new arrivals. */
  const pinnedToBottomRef = useRef(true);
  // Cursor paging state for the per-channel Call History log.
  const callHistoryScrollRef = useRef<HTMLDivElement | null>(null);
  const callHistoryLoadedForRef = useRef<string | null>(null);
  const [callHistory, setCallHistory] = useState<BackendMessage[]>([]);
  const [callHistoryHasMore, setCallHistoryHasMore] = useState(false);
  const [callHistoryCursor, setCallHistoryCursor] = useState<string | null>(null);
  const [loadingCallHistory, setLoadingCallHistory] = useState(false);
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const [creatingTask, setCreatingTask] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [creatingSpace, setCreatingSpace] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string>('');
  const [showChannelInfo, setShowChannelInfo] = useState(false);
  const [showLeaveDialog, setShowLeaveDialog] = useState(false);
  const [leavePrefill, setLeavePrefill] = useState<{
    isOwner: boolean;
    transferCandidates: TransferCandidate[];
  } | null>(null);
  const [showCreatePoll, setShowCreatePoll] = useState(false);
  const [showCreateTask, setShowCreateTask] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showActionsMenu, setShowActionsMenu] = useState(false);
  const [channelSearchQuery, setChannelSearchQuery] = useState('');
  const [currentUserName, setCurrentUserName] = useState('');
  const startOutgoingCall = useCallStore((state) => state.startOutgoingCall);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setShowQuickSwitcher((v) => !v);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  /** Mentionable people, excluding yourself. */
  const mentionCandidates = useMemo(
    () =>
      people
        .filter((person) => person.userId !== currentUserId)
        .map((person) => ({
          userId: person.userId,
          displayName: person.displayName,
          email: person.email,
        })),
    [people, currentUserId],
  );

  useEffect(() => {
    try {
      const stored = localStorage.getItem('veloce_user');
      if (stored) {
        const u = JSON.parse(stored);
        setCurrentUserName(u.displayName || u.name || u.email || 'Someone');
      }
    } catch { /* ignore */ }
  }, []);

  async function loadChats(preferredId?: string | null, force = false) {
    setLoadingChats(true);
    setError('');
    try {
      const feed = await getChatsFeedCached(force);
      const groupChats = Array.isArray(feed)
        ? (feed.filter((chat) => chat.type !== 'DIRECT') as ChatItem[])
        : [];
      setChats(groupChats);
      const requested =
        preferredId ||
        (typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('conversation') : null);
      const nextSelected = requested && groupChats.some((chat: ChatItem) => chat.conversationId === requested)
        ? requested
        : selectedId && groupChats.some((chat: ChatItem) => chat.conversationId === selectedId)
          ? selectedId
          : groupChats[0]?.conversationId || '';
      setSelectedId(nextSelected);
    } catch {
      setError('Teams data could not be loaded.');
      setChats([]);
      setSelectedId('');
    } finally {
      setLoadingChats(false);
    }
  }

  async function loadPeople() {
    try {
      const data = await usersAPI.getDirectory();
      setPeople(Array.isArray(data) ? data : []);
    } catch {
      setPeople([]);
    }
  }

  async function loadSurface(conversationId: string) {
    const selected = chats.find((chat) => chat.conversationId === conversationId);
    if (!selected || !selected.isMember) {
      setMessages([]);
      setFiles([]);
      setTasks([]);
      return;
    }

    setLoadingSurface(true);
    setError('');
    try {
      // `?message=` from a search result centres history on that message
      // instead of opening at the newest page.
      const jumpTo =
        typeof window !== 'undefined'
          ? new URLSearchParams(window.location.search).get('message')
          : null;

      const [history, fileData, taskData] = await Promise.all([
        chatsAPI.getHistory(conversationId, jumpTo ? { around: jumpTo } : undefined),
        filesAPI.getWorkspace(undefined, conversationId),
        tasksAPI.getWorkspace(),
      ]);
      setMessages(Array.isArray(history?.messages) ? (history.messages as BackendMessage[]) : []);
      setHasMoreMessages(!!history?.hasMore);
      setOlderCursor(history?.nextCursor ?? null);
      // Scrolling to the hit replaces the usual jump-to-bottom.
      if (jumpTo) pinnedToBottomRef.current = false;
      setFiles(Array.isArray(fileData?.items) ? fileData.items : []);
      const taskItems = Array.isArray(taskData) ? taskData : [];
      setTasks(taskItems.filter((task: TaskItem) => task.conversationId === conversationId || task.conversation?.id === conversationId));
    } catch {
      setError('Selected channel data could not be loaded.');
      setMessages([]);
      setHasMoreMessages(false);
      setOlderCursor(null);
      setFiles([]);
      setTasks([]);
    } finally {
      setLoadingSurface(false);
    }
  }

  /**
   * Prepends the next page of older messages, holding the viewport still.
   * Without the scrollHeight capture the list jumps as content grows above.
   */
  async function loadOlderMessages() {
    if (!selectedId || !olderCursor || loadingOlder) return;

    const scroller = messageScrollRef.current;
    const previousHeight = scroller?.scrollHeight ?? 0;
    const previousTop = scroller?.scrollTop ?? 0;

    setLoadingOlder(true);
    try {
      const page = await chatsAPI.getHistory(selectedId, { before: olderCursor });
      const older = Array.isArray(page?.messages) ? (page.messages as BackendMessage[]) : [];
      if (older.length > 0) {
        setMessages((current) => [...older, ...current]);
      }
      setHasMoreMessages(!!page?.hasMore);
      setOlderCursor(page?.nextCursor ?? null);

      // setTimeout rather than rAF so the restore still runs when the tab is
      // backgrounded and animation frames are not being served.
      window.setTimeout(() => {
        if (!scroller) return;
        scroller.scrollTop = scroller.scrollHeight - previousHeight + previousTop;
      }, 0);
    } catch {
      setError('Older messages could not be loaded.');
    } finally {
      setLoadingOlder(false);
    }
  }

  // Opening a conversation always starts at the newest message.
  useEffect(() => {
    pinnedToBottomRef.current = true;
  }, [selectedId]);

  /** Loads the selected channel's call events (newest page, rendered oldest first). */
  async function loadCallHistory(conversationId: string) {
    setLoadingCallHistory(true);
    try {
      const page = await callsAPI.getHistory({ conversationId });
      const msgs = Array.isArray(page?.messages) ? (page.messages as BackendMessage[]) : [];
      // API pages are newest-first; the log renders chronologically.
      setCallHistory([...msgs].reverse());
      setCallHistoryHasMore(!!page?.hasMore);
      setCallHistoryCursor(page?.nextCursor ?? null);
    } catch {
      setCallHistory([]);
      setCallHistoryHasMore(false);
      setCallHistoryCursor(null);
    } finally {
      setLoadingCallHistory(false);
    }
  }

  /** Appends the next page of older call events, holding the list viewport still. */
  async function loadOlderCallHistory() {
    if (!selectedId || !callHistoryCursor || loadingCallHistory) return;

    const scroller = callHistoryScrollRef.current;
    const previousHeight = scroller?.scrollHeight ?? 0;
    const previousTop = scroller?.scrollTop ?? 0;

    setLoadingCallHistory(true);
    try {
      const page = await callsAPI.getHistory({
        conversationId: selectedId,
        before: callHistoryCursor,
      });
      const older = Array.isArray(page?.messages) ? [...page.messages].reverse() : [];
      if (older.length > 0) {
        setCallHistory((current) => {
          const seen = new Set(current.map((m) => m.id));
          return [...current, ...older.filter((m) => !seen.has(m.id))];
        });
      }
      setCallHistoryHasMore(!!page?.hasMore);
      setCallHistoryCursor(page?.nextCursor ?? null);

      // Restore the viewport after content grows above/below (setTimeout so it
      // still runs when the tab is backgrounded and rAF is starved).
      window.setTimeout(() => {
        if (!scroller) return;
        scroller.scrollTop = scroller.scrollHeight - previousHeight + previousTop;
      }, 0);
    } catch {
      // Cursor stays put so the next scroll retries.
    } finally {
      setLoadingCallHistory(false);
    }
  }

  // Fetch the channel's call log lazily, once per channel, when the tab opens.
  useEffect(() => {
    if (activeTab !== 'calls' || !selectedId) return;
    if (callHistoryLoadedForRef.current === selectedId) return;
    callHistoryLoadedForRef.current = selectedId;
    setCallHistory([]);
    setCallHistoryCursor(null);
    setCallHistoryHasMore(false);
    void loadCallHistory(selectedId);
  }, [activeTab, selectedId]);

  // When the log is short enough that nothing scrolls, keep pulling pages
  // until it fills the viewport or history is exhausted.
  useEffect(() => {
    if (activeTab !== 'calls') return;
    const scroller = callHistoryScrollRef.current;
    if (!scroller || !callHistoryHasMore || loadingCallHistory) return;
    if (scroller.scrollHeight <= scroller.clientHeight) {
      void loadOlderCallHistory();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, callHistory, callHistoryHasMore, loadingCallHistory]);

  /**
   * Brings a jumped-to search hit into view and flashes it briefly.
   *
   * Done imperatively against the DOM rather than through render state: this
   * page remounts several times during load, and a highlight held in state is
   * lost with whichever instance set it.
   */
  useEffect(() => {
    if (messages.length === 0) return;
    const target = new URLSearchParams(window.location.search).get('message');
    if (!target) return;

    let clearTimer = 0;
    let attempts = 0;

    // Applied as inline style rather than classes: React owns className on
    // this row and rewrites it on the next render, which would wipe the flash.
    const applyFlash = (el: HTMLElement, on: boolean) => {
      el.style.backgroundColor = on ? 'rgb(254 252 232)' : '';
      el.style.boxShadow = on ? '0 0 0 2px rgb(252 211 77)' : '';
      el.style.borderRadius = on ? '0.5rem' : '';
    };

    // Poll briefly: the row may not be painted yet on a cold page load.
    const poll = window.setInterval(() => {
      const el = document.getElementById(`message-${target}`);
      if (el) {
        window.clearInterval(poll);
        el.scrollIntoView({ block: 'center' });
        applyFlash(el, true);
        clearTimer = window.setTimeout(() => applyFlash(el, false), 3000);
      } else if (++attempts > 40) {
        window.clearInterval(poll);
      }
    }, 100);

    return () => {
      window.clearInterval(poll);
      if (clearTimer) window.clearTimeout(clearTimer);
    };
  }, [messages.length]);

  /**
   * Keys off the newest message id rather than message count, so prepending a
   * page of older history does not yank the viewport to the bottom.
   */
  const newestMessageId = messages.length > 0 ? messages[messages.length - 1].id : null;
  useEffect(() => {
    if (!pinnedToBottomRef.current) return;
    const scroller = messageScrollRef.current;
    if (!scroller) return;
    // Assign synchronously: rAF is starved in background/non-compositing tabs.
    scroller.scrollTop = scroller.scrollHeight;
    // Second pass catches attachments that resolve their height late.
    const timer = window.setTimeout(() => {
      if (!pinnedToBottomRef.current) return;
      const el = messageScrollRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    }, 100);
    return () => window.clearTimeout(timer);
  }, [selectedId, newestMessageId, activeTab]);

  const scheduleChatListRefresh = useMemo(
    () => debounce((preferredId?: string | null) => { void loadChats(preferredId, true); }, 800),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const stored = typeof window !== 'undefined' ? localStorage.getItem('veloce_user') : null;
        if (stored) { const u = JSON.parse(stored); setCurrentUserId(u?.id || u?.userId || ''); }
      } catch { /* ignore */ }
      loadChats();
      loadPeople();
    }, 0);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function selectChannel(id: string) {
    setSelectedId(id);
    setChats((prev) =>
      prev.map((c) => (c.conversationId === id ? { ...c, unreadCount: 0 } : c)),
    );
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (selectedId) {
        loadSurface(selectedId);
      }
    }, 0);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  useEffect(() => {
    setShowChannelInfo(false);
  }, [selectedId]);

  useEffect(() => {
    if (!selectedId) return;

    const token = typeof window !== 'undefined' ? localStorage.getItem('veloce_token') : null;
    if (!token) return;

    const socketUrl = resolveServiceBaseUrl();
    const socket = socketUrl ? io(socketUrl, { auth: { token } }) : io({ auth: { token } });

    socket.on('connect', () => {
      socket.emit('room.join', { conversationId: selectedId });
    });

    socket.on('message.sent', (message: BackendMessage & { conversationId: string }) => {
      if (message.conversationId === selectedId) {
        setMessages((prev) => {
          if (prev.some((m) => m.id === message.id)) return prev;
          return [...prev, message];
        });
      }
    });

    socket.on('conversation.deleted', (data: { conversationId: string }) => {
      setChats((prev) => {
        const remaining = prev.filter((c) => c.conversationId !== data.conversationId);
        if (selectedId === data.conversationId) {
          setSelectedId(remaining[0]?.conversationId || '');
        }
        return remaining;
      });
    });

    socket.on('message.edited', (data?: { messageId?: string; content?: string }) => {
      if (data?.messageId && data?.content) {
        setMessages((prev) =>
          prev.map((m) => (m.id === data.messageId ? { ...m, content: data.content, isEdited: true } : m)),
        );
      } else {
        loadSurface(selectedId);
      }
    });

    socket.on('message.deleted', (data?: { messageId?: string }) => {
      if (data?.messageId) {
        setMessages((prev) => prev.filter((m) => m.id !== data.messageId));
      } else {
        loadSurface(selectedId);
      }
      scheduleChatListRefresh(selectedId);
    });

    socket.on('message.reacted', () => {
      loadSurface(selectedId);
    });

    socket.on('poll.voted', () => {
      loadSurface(selectedId);
    });

    socket.on('task.created', () => {
      loadSurface(selectedId);
    });

    socket.on('user.presence', () => {
      scheduleChatListRefresh(selectedId);
    });

    return () => {
      socket.emit('room.leave', { conversationId: selectedId });
      socket.disconnect();
    };
  }, [selectedId]);

  useEffect(() => {
    function handleOpen() {
      setCreateMemberSearch('');
      setShowCreate(true);
    }
    window.addEventListener('open-create-channel', handleOpen);

    if (sessionStorage.getItem('open-create-channel') === 'true') {
      sessionStorage.removeItem('open-create-channel');
      window.setTimeout(() => setShowCreate(true), 0);
    }

    return () => {
      window.removeEventListener('open-create-channel', handleOpen);
    };
  }, []);

  const selectedChat = chats.find((chat) => chat.conversationId === selectedId) || null;
  const filteredPeopleForCreate = useMemo(() => {
    const q = createMemberSearch.trim().toLowerCase();
    return people.filter((p) => {
      if (!q) return true;
      return `${p.displayName} ${p.email || ''}`.toLowerCase().includes(q);
    });
  }, [people, createMemberSearch]);
  const canPost = !!selectedChat?.isMember && !selectedChat.group?.isReadOnly;
  const rootMessages = messages.filter(
    (message) =>
      !message.replyToMessageId &&
      !['SYSTEM_CALL_START', 'SYSTEM_CALL_END', 'SYSTEM_CALL_DECLINE'].includes(message.messageType || '')
  );
  const repliesByMessage = messages.reduce<Record<string, BackendMessage[]>>((groups, message) => {
    if (message.replyToMessageId) {
      groups[message.replyToMessageId] = [...(groups[message.replyToMessageId] || []), message];
    }
    return groups;
  }, {});
  const selectedThread = selectedThreadId ? messages.find((message) => message.id === selectedThreadId) || null : null;
  const selectedThreadReplies = selectedThreadId ? repliesByMessage[selectedThreadId] || [] : [];

  const isCallActiveInChannel = useMemo(() => {
    const lastCallMsg = [...messages].reverse().find((m) =>
      ['SYSTEM_CALL_START', 'SYSTEM_CALL_END', 'SYSTEM_CALL_DECLINE'].includes(m.messageType || '')
    );
    return lastCallMsg?.messageType === 'SYSTEM_CALL_START';
  }, [messages]);

  const pinnedMessages = useMemo(() => {
    return messages.filter((m) => m.isPinned || (Array.isArray(m.pinnedMessages) && m.pinnedMessages.length > 0));
  }, [messages]);

  const filteredChats = useMemo(() => {
    const q = channelSearchQuery.trim().toLowerCase();
    if (!q) return chats;
    return chats.filter((chat) => {
      const cName = channelName(chat).toLowerCase();
      const tName = teamName(chat).toLowerCase();
      const desc = (chat.group?.description || '').toLowerCase();
      return cName.includes(q) || tName.includes(q) || desc.includes(q);
    });
  }, [chats, channelSearchQuery]);

  const orgSpaces = filteredChats.filter((chat) => chat.group?.spaceType !== 'TEAM_CHANNEL');
  const availableTeams = useMemo(() => {
    const names = chats
      .filter((c) => c.group?.teamName)
      .map((c) => c.group?.teamName);
    const uniqueNames = Array.from(new Set(names)).filter(Boolean) as string[];
    return uniqueNames;
  }, [chats]);
  const availableDepartments = useMemo(() => {
    const depts = people
      .map((p) => p.department)
      .filter(Boolean) as string[];
    const unique = Array.from(new Set(depts));
    return unique.length > 0 ? unique : ['IT', 'Engineering', 'Sales', 'HR', 'Marketing', 'Finance', 'Operations'];
  }, [people]);
  const teamGroups = useMemo(() => {
    return filteredChats
      .filter((chat) => chat.group?.spaceType === 'TEAM_CHANNEL' || !chat.group?.spaceType)
      .reduce<Record<string, ChatItem[]>>((groups, chat) => {
        const name = teamName(chat);
        groups[name] = [...(groups[name] || []), chat];
        return groups;
      }, {});
  }, [filteredChats]);

  async function refreshSelected() {
    await loadChats(selectedId);
    if (selectedId) await loadSurface(selectedId);
  }

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedChat || (!draft.trim() && !pendingFile) || !canPost) return;
    setSending(true);
    setError('');
    try {
      if (pendingFile) {
        setUploading(true);
        try {
          await filesAPI.upload(pendingFile, selectedChat.conversationId);
          setPendingFile(null);
          if (chatFileInputRef.current) chatFileInputRef.current.value = '';
        } catch {
          setError('File upload failed.');
          setSending(false);
          setUploading(false);
          return;
        } finally {
          setUploading(false);
        }
      }

      if (draft.trim()) {
        const message = await messagesAPI.send({ conversationId: selectedChat.conversationId, content: draft.trim() });
        setMessages((prev) => {
          if (prev.some((m) => m.id === message.id)) return prev;
          return [...prev, message];
        });
        setDraft('');
      }

      scheduleChatListRefresh(selectedChat.conversationId);
    } catch {
      setError('Message could not be sent.');
    } finally {
      setSending(false);
    }
  }

  async function sendThreadReply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedChat || !selectedThread || !threadDraft.trim() || !canPost) return;
    setError('');
    try {
      const message = await messagesAPI.send({
        conversationId: selectedChat.conversationId,
        content: threadDraft.trim(),
        replyToMessageId: selectedThread.id,
      });
      setMessages((prev) => {
        if (prev.some((m) => m.id === message.id)) return prev;
        return [...prev, message];
      });
      setThreadDraft('');
    } catch {
      setError('Thread reply could not be sent.');
    }
  }

  async function handleMessageAction(messageId: string, action: import('../../components/MessageBubble').MessageAction, payload?: string) {
    setError('');
    try {
      if (action === 'react') {
        const emoji = payload || '👍';
        await messagesAPI.react(messageId, emoji);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === messageId
              ? { ...m, reactions: [...(m.reactions || []), { emoji, userId: currentUserId }] }
              : m,
          ),
        );
      } else if (action === 'unreact') {
        const emoji = payload || '👍';
        await messagesAPI.unreact(messageId, emoji);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === messageId
              ? { ...m, reactions: (m.reactions || []).filter((r) => !(r.emoji === emoji && r.userId === currentUserId)) }
              : m,
          ),
        );
      } else if (action === 'edit') {
        const updated = await messagesAPI.edit(messageId, payload || '');
        setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, content: updated.content, isEdited: true } : m)));
      } else if (action === 'delete') {
        const everyone = payload === 'everyone';
        await messagesAPI.delete(messageId, everyone);
        if (everyone) {
          setMessages((prev) =>
            prev.map((m) => (m.id === messageId ? { ...m, content: 'This message was deleted', isDeletedGlobally: true } : m)),
          );
        } else {
          setMessages((prev) => prev.filter((m) => m.id !== messageId));
        }
      } else if (action === 'star') {
        await messagesAPI.star(messageId);
      } else if (action === 'unstar') {
        await messagesAPI.unstar(messageId);
      } else if (action === 'pin') {
        if (selectedId) await messagesAPI.pin(messageId, selectedId);
      } else if (action === 'unpin') {
        if (selectedId) await messagesAPI.unpin(messageId, selectedId);
      } else if (action === 'forward') {
        if (payload) await messagesAPI.forward(messageId, payload);
      } else if (action === 'reply') {
        setShowChannelInfo(false);
        setSelectedThreadId(messageId);
        setActiveTab('messages');
      } else if (action === 'votePoll' && payload) {
        const message = messages.find((m) => m.id === messageId);
        const pollId = message?.polls?.id;
        if (pollId) {
          await messagesAPI.votePoll(pollId, payload);
          if (selectedId) await loadSurface(selectedId);
        }
      } else if (action === 'toggleTask' && payload) {
        const task = messages.flatMap((m) => m.tasks || []).find((t: TaskData) => t.id === payload);
        if (task) {
          const isCompleted = task.status === 'COMPLETED';
          await tasksAPI.update(payload, { complete: !isCompleted });
          if (selectedId) await loadSurface(selectedId);
        }
      }
    } catch {
      setError(`Action "${action}" failed.`);
    }
  }


  async function joinSelected() {
    if (!selectedChat) return;
    setError('');
    try {
      await chatsAPI.join(selectedChat.conversationId);
      invalidateChatsFeed();
      await loadChats(selectedChat.conversationId, true);
    } catch {
      setError('Channel could not be joined.');
    }
  }

  function openLeaveDialog(prefill?: {
    isOwner: boolean;
    transferCandidates: TransferCandidate[];
  }) {
    setLeavePrefill(prefill ?? null);
    setShowLeaveDialog(true);
  }

  async function handleLeaveSuccess() {
    if (!selectedChat) return;
    setError('');
    setShowChannelInfo(false);
    invalidateChatsFeed();
    await loadChats(selectedChat.conversationId, true);
  }

  async function uploadFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || !selectedChat?.isMember) return;
    if (file.size > MAX_UPLOAD_BYTES) {
      setError(`File exceeds the maximum upload size of ${MAX_UPLOAD_LABEL}.`);
      event.target.value = '';
      return;
    }
    setUploading(true);
    setError('');
    try {
      await filesAPI.upload(file, selectedChat.conversationId);
      await loadSurface(selectedChat.conversationId);
    } catch {
      setError('File upload failed.');
    } finally {
      setUploading(false);
      event.target.value = '';
    }
  }

  async function downloadFile(file: FileItem) {
    setError('');
    try {
      const response = await filesAPI.download(file.id);
      saveBlob(response.data, file.filename);
    } catch {
      setError('Download is not available for this file.');
    }
  }

  async function viewFile(file: FileItem) {
    setError('');
    try {
      const response = await filesAPI.view(file.id);
      const opened = openBlobPreview(response.data, file.mimeType);
      if (!opened) {
        setError('Preview could not be opened. Allow pop-ups or use Download.');
      }
    } catch {
      setError('Preview is not available for this file.');
    }
  }

  async function createTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedChat || !newTaskTitle.trim()) return;
    setCreatingTask(true);
    setError('');
    try {
      const created = await tasksAPI.create({
        conversationId: selectedChat.conversationId,
        title: newTaskTitle.trim(),
        priority: newTaskPriority,
        dueDate: newTaskDue ? new Date(newTaskDue).toISOString() : null,
      });
      setTasks((current) => [...current, created]);
      setNewTaskTitle('');
    } catch {
      setError('Task could not be created.');
    } finally {
      setCreatingTask(false);
    }
  }

  async function toggleTask(task: TaskItem) {
    setError('');
    try {
      const updated = await tasksAPI.update(task.id, { complete: task.status !== 'COMPLETED' });
      setTasks((current) => current.map((item) => (item.id === task.id ? updated : item)));
    } catch {
      setError('Task could not be updated.');
    }
  }

  async function createSpace(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!createName.trim()) return;
    setCreatingSpace(true);
    setError('');
    try {
      const created = await chatsAPI.createGroup({
        name: createName.trim(),
        description: createDescription.trim() || undefined,
        participantIds: createParticipantIds,
        teamName: createSpaceType === 'TEAM_CHANNEL' ? createTeam.trim() || 'Workspace' : undefined,
        channelSlug: createName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
        spaceType: createSpaceType,
        isReadOnly: ['ANNOUNCEMENT', 'LEADERSHIP'].includes(createSpaceType),
      });
      setShowCreate(false);
      setCreateName('');
      setCreateTeam('');
      setCreateDescription('');
      setCreateParticipantIds([]);
      invalidateChatsFeed();
      await loadChats(created.id || created.conversationId, true);
    } catch {
      setError('Space could not be created.');
    } finally {
      setCreatingSpace(false);
    }
  }

  function toggleParticipant(userId: string) {
    setCreateParticipantIds((current) =>
      current.includes(userId) ? current.filter((id) => id !== userId) : [...current, userId],
    );
  }

  return (
    <div className="flex min-w-0 flex-1 bg-slate-50">
      {/* List-detail: below lg only one of the two panes is shown at a time,
          chosen by whether a channel is selected. */}
      <aside
        className={`w-full shrink-0 flex-col border-r border-slate-200 bg-white lg:flex lg:w-[300px] ${
          selectedId ? 'hidden' : 'flex'
        }`}
      >
        <div className="flex h-16 items-center justify-between border-b border-slate-200 px-4">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-blue-700" />
            <h1 className="text-sm font-bold text-slate-950">Teams</h1>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={refreshSelected} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" title="Refresh teams">
              <RefreshCw className="h-4 w-4" />
            </button>
            <button
              onClick={() => {
                setCreateMemberSearch('');
                setShowCreate(true);
              }}
              className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
              title="Create space"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="border-b border-slate-100 p-2.5">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
            <input
              type="search"
              value={channelSearchQuery}
              onChange={(e) => setChannelSearchQuery(e.target.value)}
              placeholder="Filter channels..."
              className="h-8 w-full rounded-lg border border-slate-200 bg-slate-50 pl-8 pr-3 text-xs text-slate-900 outline-none focus:border-blue-500 focus:bg-white transition"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3">
          {loadingChats ? (
            <div className="p-3 text-sm text-slate-500">Loading teams...</div>
          ) : chats.length === 0 ? (
            <div className="p-3 text-sm text-slate-500">No team spaces returned.</div>
          ) : (
            <>
              {orgSpaces.length > 0 && (
                <div className="mb-5">
                  <div className="mb-2 px-2 text-xs font-semibold uppercase text-slate-400">Organization</div>
                  <div className="space-y-1">
                    {orgSpaces.map((chat) => (
                      <button
                        key={chat.conversationId}
                        onClick={() => selectChannel(chat.conversationId)}
                        className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left ${
                          selectedId === chat.conversationId ? 'bg-blue-50 text-blue-800' : 'text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <MessageSquare className="h-4 w-4 shrink-0" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold">{channelName(chat)}</span>
                          <span className="block text-xs text-slate-400">{spaceLabel(chat.group?.spaceType)}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {Object.entries(teamGroups).map(([name, channels]) => (
                <div key={name} className="mb-5">
                  <div className="mb-2 px-2 text-xs font-semibold uppercase text-slate-400">{name}</div>
                  <div className="space-y-1">
                    {channels.map((chat) => (
                      <button
                        key={chat.conversationId}
                        onClick={() => selectChannel(chat.conversationId)}
                        className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left ${
                          selectedId === chat.conversationId ? 'bg-blue-50 text-blue-800' : 'text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <Hash className="h-4 w-4 shrink-0" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold">{channelName(chat)}</span>
                          <span className="block truncate text-xs text-slate-400">{chat.lastMessage?.content ? toPlainText(chat.lastMessage.content) : chat.group?.description || 'No messages yet'}</span>
                        </span>
                        {!!chat.unreadCount && <span className="rounded-full bg-blue-600 px-1.5 text-[10px] font-bold text-white">{chat.unreadCount}</span>}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      </aside>

      <main
        className={`min-w-0 flex-1 flex-col bg-white lg:flex ${
          selectedId ? 'flex' : 'hidden'
        }`}
      >
        <header className="flex h-16 items-center justify-between gap-2 border-b border-slate-200 px-3 lg:px-6">
          {/* Returns to the channel list on small screens, where the two panes
              never appear together. */}
          <button
            type="button"
            onClick={() => setSelectedId('')}
            aria-label="Back to channels"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-slate-600 transition hover:bg-slate-100 lg:hidden"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2 className="truncate text-lg font-bold text-slate-950">{selectedChat ? channelName(selectedChat) : 'Teams'}</h2>
              {selectedChat && !selectedChat.isMember && (
                <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">Not joined</span>
              )}
              {selectedChat?.group?.isReadOnly && (
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">Read only</span>
              )}
            </div>
            <p className="truncate text-xs text-slate-500">{selectedChat?.group?.description || selectedChat?.group?.teamName || 'Backend workspace channels'}</p>
          </div>
          {selectedChat && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowQuickSwitcher(true)}
                className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition shadow-sm"
                title="Quick Switcher (Cmd+K / Ctrl+K)"
              >
                <Command className="h-3.5 w-3.5 text-blue-600" />
                <span className="hidden sm:inline">Jump...</span>
                <kbd className="hidden sm:inline rounded bg-white px-1 text-[10px] font-mono text-slate-400 border border-slate-200">⌘K</kbd>
              </button>
              {selectedChat.isMember && (
                <button
                  onClick={() => {
                    setShowChannelInfo(true);
                    setSelectedThreadId(null);
                  }}
                  className={`flex h-9 w-9 items-center justify-center rounded-full transition ${
                    showChannelInfo
                      ? 'bg-blue-50 text-blue-700'
                      : 'text-slate-400 hover:bg-slate-100 hover:text-slate-600'
                  }`}
                  title="Channel info"
                >
                  <Users className="h-4.5 w-4.5" />
                </button>
              )}
              {selectedChat.isMember && !selectedChat.group?.isReadOnly && (
                <button
                  onClick={() => {
                    const channelLabel = channelName(selectedChat);
                    startOutgoingCall(selectedId, callRoomName(selectedId), channelLabel, currentUserName);
                  }}
                  className="flex h-9 w-9 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
                  title="Start Video Call"
                >
                  <Video className="h-4.5 w-4.5" />
                </button>
              )}
              {selectedChat.isMember ? (
                <button
                  onClick={() => openLeaveDialog()}
                  className="rounded-lg bg-red-600 px-3 py-2 text-xs font-semibold text-white hover:bg-red-700 active:bg-red-800 transition-colors duration-150 shadow-sm"
                >
                  Leave
                </button>
              ) : (
                <button onClick={joinSelected} className="rounded-lg bg-blue-700 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-800">
                  Join
                </button>
              )}
            </div>
          )}
        </header>

        <div className="flex border-b border-slate-200 bg-white px-6">
          {(['messages', 'threads', 'files', 'tasks', 'pinned', 'calls'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex items-center gap-1.5 border-b-2 px-4 py-3 text-sm font-semibold capitalize transition ${
                activeTab === tab ? 'border-blue-700 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-900'
              }`}
            >
              {tab === 'pinned' && <Pin className="h-3.5 w-3.5 text-amber-500" />}
              {tab === 'calls' && <Video className="h-3.5 w-3.5 text-emerald-600" />}
              <span>{tab}</span>
              {tab === 'pinned' && pinnedMessages.length > 0 && (
                <span className="rounded-full bg-amber-100 px-1.5 py-0.2 text-[10px] font-bold text-amber-700">
                  {pinnedMessages.length}
                </span>
              )}
              {tab === 'calls' && isCallActiveInChannel && (
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                </span>
              )}
            </button>
          ))}
        </div>

        {isCallActiveInChannel && (
          <div className="flex items-center justify-between border-b border-emerald-500/20 bg-emerald-50/80 dark:bg-emerald-950/40 px-6 py-2.5 text-emerald-800 dark:text-emerald-300 select-none shrink-0 backdrop-blur-sm">
            <div className="flex items-center gap-2.5 text-xs font-semibold">
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
              </span>
              <span>Video call in progress in #{selectedChat?.name || 'this channel'}</span>
            </div>
            <button
              type="button"
              onClick={() => {
                useCallStore.getState().joinCall(
                  selectedId,
                  callRoomName(selectedId),
                  `#${selectedChat?.name || 'Channel'}`,
                );
              }}
              className="flex items-center gap-1.5 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-1 text-xs font-semibold shadow transition active:scale-95 cursor-pointer"
            >
              <Video className="h-3.5 w-3.5" />
              <span>Join Call</span>
            </button>
          </div>
        )}

        {error && <div className="mx-6 mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

        {!selectedChat ? (
          <div className="flex flex-1 items-center justify-center text-sm text-slate-400">Select a team space.</div>
        ) : !selectedChat.isMember ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-slate-500">
            <Hash className="h-10 w-10 text-slate-300" />
            <p className="text-sm">Join this space to load messages, files, and tasks.</p>
            <button onClick={joinSelected} className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800">
              Join space
            </button>
          </div>
        ) : loadingSurface ? (
          <div className="flex flex-1 items-center justify-center text-sm text-slate-500">Loading channel...</div>
        ) : (
          <>
            {activeTab === 'messages' && (
              <div className="flex min-h-0 flex-1">
                <section className="flex min-w-0 flex-1 flex-col">
                  <div
                    ref={messageScrollRef}
                    // Screen readers otherwise get no signal that a message
                    // arrived. "polite" so it waits for a pause in speech, and
                    // additions-only so re-renders do not re-announce history.
                    role="log"
                    aria-live="polite"
                    aria-relevant="additions"
                    aria-label={`Messages in ${selectedChat ? channelName(selectedChat) : 'channel'}`}
                    onScroll={(event) => {
                      const el = event.currentTarget;
                      // Only follow new arrivals while the user is at the bottom.
                      pinnedToBottomRef.current =
                        el.scrollHeight - el.scrollTop - el.clientHeight < 80;
                      // Near the top and more history exists -> fetch the next page.
                      if (el.scrollTop < 120 && hasMoreMessages && !loadingOlder) {
                        void loadOlderMessages();
                      }
                    }}
                    className="flex-1 space-y-5 overflow-y-auto px-6 py-6"
                  >
                    {loadingOlder && (
                      <div className="py-2 text-center text-xs text-slate-400">Loading older messages...</div>
                    )}
                    {rootMessages.length === 0 ? (
                      <div className="flex h-full items-center justify-center text-sm text-slate-400">No messages yet. Say hello.</div>
                    ) : (
                      rootMessages.map((message) => {
                        const author = message.sender?.profile?.displayName || 'Workspace user';
                        const replies = repliesByMessage[message.id] || [];
                        const isThisCallActive = message.messageType === 'SYSTEM_CALL_START' && (() => {
                          const idx = messages.findIndex((m) => m.id === message.id);
                          if (idx === -1) return false;
                          const subsequent = messages.slice(idx + 1);
                          return !subsequent.some((m) =>
                            m.messageType === 'SYSTEM_CALL_END' || m.messageType === 'SYSTEM_CALL_DECLINE'
                          );
                        })();
                        return (
                          <div
                            key={message.id}
                            id={`message-${message.id}`}
                            className="transition-colors duration-500"
                          >
                          <MessageBubble
                            id={message.id}
                            content={message.content || ''}
                            author={author}
                            timestamp={timeAgo(message.createdAt)}
                            variant="channel"
                            isOwn={!!currentUserId && message.senderId === currentUserId}
                            isEdited={message.isEdited}
                            isDeletedGlobally={message.isDeletedGlobally}
                            reactions={reactionCounts(message.reactions, currentUserId)}
                            replyCount={replies.length}
                            canEdit={!!currentUserId && message.senderId === currentUserId}
                            availableConversations={chats.map((c) => ({ id: c.conversationId, name: channelName(c) }))}
                            avatarNode={
                              <div className={`flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold ${avatarAccent(author)}`}>
                                {initials(author)}
                              </div>
                            }
                            messageType={message.messageType}
                            conversationId={selectedId}
                            conversationName={selectedChat ? `#${channelName(selectedChat)}` : 'Channel Call'}
                            isCallActive={isThisCallActive}
                            polls={message.polls}
                            tasks={message.tasks}
                            currentUserId={currentUserId}
                            createdAt={message.createdAt}
                            attachmentsNode={
                              message.attachments?.length ? (
                                <div className="space-y-1">
                                  {message.attachments.map((attachment) => attachment.file && (
                                    attachment.file.mimeType?.startsWith('image/') ? (
                                      <ImageAttachment key={attachment.file.id} fileId={attachment.file.id} filename={attachment.file.filename} />
                                    ) : (
                                      <button
                                        key={attachment.file.id}
                                        onClick={() => downloadFile(attachment.file as FileItem)}
                                        className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                                      >
                                        <FileText className="h-4 w-4" />
                                        {attachment.file.filename}
                                      </button>
                                    )
                                  ))}
                                </div>
                              ) : undefined
                            }
                            onAction={(action, payload) => handleMessageAction(message.id, action, payload)}
                          />
                          </div>
                        );
                      })
                    )}
                  </div>

                  {canPost && (
                    <form onSubmit={sendMessage} className="relative border-t border-slate-200 px-5 py-3">
                      {/* Hidden file input */}
                      <input
                        type="file"
                        ref={chatFileInputRef}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (!file || !selectedChat?.isMember) return;
                          if (file.size > MAX_UPLOAD_BYTES) {
                            setError(`File exceeds the maximum upload size of ${MAX_UPLOAD_LABEL}.`);
                            e.target.value = '';
                            return;
                          }
                          setPendingFile(file);
                        }}
                        className="hidden"
                      />

                      {/* Pending file preview */}
                      {pendingFile && (
                        <div className={`mb-2 rounded-xl border px-4 py-2.5 text-xs shadow-sm animate-in fade-in slide-in-from-bottom-1 duration-150 ${
                          uploading
                            ? 'border-blue-300 bg-blue-50'
                            : 'border-blue-200 bg-blue-50/50 text-blue-900'
                        }`}>
                          {uploading ? (
                            <UploadProgressIndicator
                              variant="banner"
                              label={`Uploading ${pendingFile.name}...`}
                              className="border-0 bg-transparent p-0"
                            />
                          ) : (
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2.5 min-w-0">
                                {pendingFile.type.startsWith('image/') ? (
                                  <img src={URL.createObjectURL(pendingFile)} alt="preview" className="h-8 w-8 rounded-lg object-cover shadow-sm" />
                                ) : (
                                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white shadow-sm shadow-blue-500/20">
                                    <FileText className="h-4.5 w-4.5" />
                                  </div>
                                )}
                                <div className="min-w-0 flex-1">
                                  <div className="font-semibold truncate text-slate-800">{pendingFile.name}</div>
                                  <div className="text-[10px] text-slate-400 mt-0.5">{(pendingFile.size / 1024).toFixed(1)} KB · Ready to send</div>
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  setPendingFile(null);
                                  if (chatFileInputRef.current) chatFileInputRef.current.value = '';
                                }}
                                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition cursor-pointer"
                              >
                                <X className="h-4 w-4" />
                              </button>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Curated Emoji Picker Drawer */}
                      {showEmojiPicker && (
                        <div className="absolute bottom-16 left-5 z-20 flex gap-1.5 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl">
                          {['😀', '😂', '😍', '👍', '🎉', '🔥', '👏', '🚀'].map((emoji) => (
                            <button
                              key={emoji}
                              type="button"
                              onClick={() => {
                                  setDraft((d) => d + emoji);
                                  setShowEmojiPicker(false);
                              }}
                              className="flex h-9 w-9 items-center justify-center rounded-xl text-xl transition hover:bg-slate-100 hover:scale-125 cursor-pointer"
                            >
                              {emoji}
                            </button>
                          ))}
                        </div>
                      )}

                      <div className="flex min-h-[44px] items-center gap-1 rounded-2xl border border-slate-300 bg-white px-2 py-1">
                        {/* Quick Actions "+" Menu */}
                        <div className="relative shrink-0">
                          <button
                            type="button"
                            onClick={() => setShowActionsMenu(!showActionsMenu)}
                            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-50 hover:text-slate-600 transition cursor-pointer"
                            title="Quick actions"
                          >
                            <Plus className="h-4.5 w-4.5" />
                          </button>
                          {showActionsMenu && (
                            <div className="absolute bottom-12 left-0 z-20 w-64 rounded-2xl border border-slate-200/60 bg-white/95 backdrop-blur-md p-2 shadow-2xl ring-1 ring-black/5 animate-in slide-in-from-bottom-2 duration-150 dropdown-card">
                              <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                                Quick Actions
                              </div>
                              <div className="mt-1 space-y-0.5">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setShowCreatePoll(true);
                                    setShowActionsMenu(false);
                                  }}
                                  className="flex w-full items-start gap-3 rounded-xl p-2.5 text-left transition hover:bg-slate-50 cursor-pointer group animate-fade-in"
                                >
                                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-violet-600 group-hover:bg-violet-100 transition-colors">
                                    <BarChart2 className="h-4.5 w-4.5" />
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <div className="text-xs font-bold text-slate-800">Create Poll</div>
                                    <div className="text-[10px] text-slate-400 mt-0.5">Ask questions and get votes</div>
                                  </div>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setShowCreateTask(true);
                                    setShowActionsMenu(false);
                                  }}
                                  className="flex w-full items-start gap-3 rounded-xl p-2.5 text-left transition hover:bg-slate-50 cursor-pointer group animate-fade-in"
                                >
                                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 group-hover:bg-emerald-100 transition-colors">
                                    <CheckSquare className="h-4.5 w-4.5" />
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <div className="text-xs font-bold text-slate-800">Create Task</div>
                                    <div className="text-[10px] text-slate-400 mt-0.5">Assign and track team work</div>
                                  </div>
                                </button>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Attachment Paperclip Button */}
                        <button
                          type="button"
                          onClick={() => chatFileInputRef.current?.click()}
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-50 hover:text-slate-600 transition cursor-pointer"
                          title="Attach a file"
                          disabled={uploading}
                        >
                          <Paperclip className="h-4 w-4" />
                        </button>

                        {/* Emoji smile button */}
                        <button
                          type="button"
                          onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-50 hover:text-slate-600 transition cursor-pointer"
                          title="Emojis"
                        >
                          <Smile className="h-4.5 w-4.5" />
                        </button>

                        {/* Draft text input */}
                        <ChatComposerInput
                          value={draft}
                          onChange={setDraft}
                          mentionCandidates={mentionCandidates}
                          placeholder={`Message ${channelName(selectedChat)}`}
                        />

                        {/* Send Button */}
                        <button
                          type="submit"
                          disabled={sending || (!draft.trim() && !pendingFile)}
                          className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-700 text-white hover:bg-blue-800 disabled:bg-slate-100 disabled:text-slate-400 transition cursor-pointer shrink-0"
                          title="Send message"
                        >
                          <Send className="h-3.5 w-3.5" />
                        </button>
                      </div>

                      {/* Create Poll & Task Modals */}
                      <CreatePollModal
                        conversationId={selectedChat.conversationId}
                        isOpen={showCreatePoll}
                        onClose={() => setShowCreatePoll(false)}
                        onSuccess={() => loadSurface(selectedChat.conversationId)}
                      />
                      <CreateTaskModal
                        conversationId={selectedChat.conversationId}
                        people={people}
                        isOpen={showCreateTask}
                        onClose={() => setShowCreateTask(false)}
                        onSuccess={() => loadSurface(selectedChat.conversationId)}
                      />
                    </form>
                  )}
                </section>

                {showChannelInfo && selectedChat?.isMember && selectedId && (
                  <ChannelInfoPanel
                    conversationId={selectedId}
                    channelName={channelName(selectedChat)}
                    isMember={!!selectedChat.isMember}
                    currentUserId={currentUserId}
                    onClose={() => setShowChannelInfo(false)}
                    onMembersChanged={async () => {
                      invalidateChatsFeed();
                      await loadChats(selectedId, true);
                      await loadSurface(selectedId);
                    }}
                    onRequestLeave={(prefill) => openLeaveDialog(prefill)}
                  />
                )}

                {selectedChat?.isMember && selectedId && (
                  <LeaveChannelDialog
                    open={showLeaveDialog}
                    conversationId={selectedId}
                    channelName={channelName(selectedChat)}
                    isOwner={leavePrefill?.isOwner}
                    transferCandidates={leavePrefill?.transferCandidates}
                    onClose={() => {
                      setShowLeaveDialog(false);
                      setLeavePrefill(null);
                    }}
                    onSuccess={() => void handleLeaveSuccess()}
                  />
                )}

                {selectedThread && !showChannelInfo && (
                  <aside className="flex w-96 shrink-0 flex-col border-l border-slate-200 bg-slate-50">
                    <div className="flex h-14 items-center justify-between border-b border-slate-200 bg-white px-4">
                      <h3 className="text-sm font-bold text-slate-950">Thread</h3>
                      <button onClick={() => setSelectedThreadId(null)} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" title="Close thread">
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="flex-1 overflow-y-auto p-4">
                      <div className="rounded-xl border border-slate-200 bg-white p-4">
                        <div className="text-sm font-semibold text-slate-900">{selectedThread.sender?.profile?.displayName || 'Workspace user'}</div>
                        <div className="mt-2 text-sm leading-6 text-slate-700">
                          <FormattedMessageContent content={selectedThread.content || ''} />
                        </div>
                      </div>
                      <div className="mt-4 space-y-3">
                        {selectedThreadReplies.map((reply) => (
                          <div key={reply.id} className="rounded-xl border border-slate-200 bg-white p-3">
                            <div className="text-xs font-semibold text-slate-500">{reply.sender?.profile?.displayName || 'Workspace user'}</div>
                            <div className="mt-1 text-sm text-slate-700">
                              <FormattedMessageContent content={reply.content || ''} />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                    {canPost && (
                      <form onSubmit={sendThreadReply} className="border-t border-slate-200 bg-white p-3">
                        <div className="flex min-h-[44px] items-center gap-2 rounded-xl border border-slate-300 px-2 py-1">
                          <ChatComposerInput
                            value={threadDraft}
                            onChange={setThreadDraft}
                            mentionCandidates={mentionCandidates}
                            placeholder="Reply in thread"
                          />
                          <button
                            type="submit"
                            disabled={!threadDraft.trim()}
                            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-700 text-white disabled:bg-slate-200 disabled:text-slate-400"
                          >
                            <Send className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </form>
                    )}
                  </aside>
                )}
              </div>
            )}

            {activeTab === 'threads' && (
              <div className="flex-1 overflow-y-auto p-6">
                {Object.entries(repliesByMessage).length === 0 ? (
                  <div className="flex h-56 items-center justify-center rounded-xl border border-slate-200 bg-white text-sm text-slate-400">No threads yet.</div>
                ) : (
                  <div className="space-y-3">
                    {Object.entries(repliesByMessage).map(([messageId, replies]) => {
                      const parent = messages.find((message) => message.id === messageId);
                      return (
                        <button
                          key={messageId}
                          onClick={() => {
                            setShowChannelInfo(false);
                            setSelectedThreadId(messageId);
                            setActiveTab('messages');
                          }}
                          className="block w-full rounded-xl border border-slate-200 bg-white p-4 text-left hover:border-blue-200"
                        >
                          <div className="text-sm font-semibold text-slate-900">{parent?.content || 'Thread'}</div>
                          <div className="mt-1 text-xs text-slate-500">{replies.length} replies</div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'files' && (
              <div className="flex-1 overflow-y-auto p-6">
                {uploading && (
                  <UploadProgressIndicator
                    variant="banner"
                    label="Uploading file..."
                    className="mb-4"
                  />
                )}
                <div className="mb-4 flex justify-end">
                  <input ref={fileInputRef} type="file" className="hidden" onChange={uploadFile} />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading || !selectedChat.isMember}
                    className="flex items-center gap-2 rounded-lg bg-blue-700 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-800 disabled:opacity-50"
                  >
                    {uploading ? (
                      <UploadProgressIndicator label="Uploading..." />
                    ) : (
                      <>
                        <Upload className="h-4 w-4" />
                        Upload file
                      </>
                    )}
                  </button>
                </div>
                {files.length === 0 ? (
                  <div className="flex h-56 items-center justify-center rounded-xl border border-slate-200 bg-white text-sm text-slate-400">No files shared in this channel.</div>
                ) : (
                  <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                    {files.map((file) => (
                      <div key={file.id} className="flex items-center gap-3 border-b border-slate-100 px-4 py-3 last:border-0">
                        <FileText className="h-5 w-5 text-slate-500" />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-semibold text-slate-900">{file.filename}</div>
                          <div className="text-xs text-slate-500">{formatFileSize(file.fileSizeBytes)} - {timeAgo(file.createdAt)}</div>
                        </div>
                        <button
                          onClick={() => viewFile(file)}
                          disabled={!canPreviewFile(file.mimeType)}
                          className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
                          title={
                            canPreviewFile(file.mimeType)
                              ? `View ${file.filename}`
                              : 'Preview not available for this file type'
                          }
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        <button onClick={() => downloadFile(file)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" title={`Download ${file.filename}`}>
                          <Download className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'tasks' && (
              <div className="flex-1 overflow-y-auto p-6">
                {canPost && (
                  <form onSubmit={createTask} className="mb-4 grid gap-3 rounded-xl border border-slate-200 bg-white p-4 lg:grid-cols-[1fr_auto_auto_auto]">
                    <input
                      value={newTaskTitle}
                      onChange={(event) => setNewTaskTitle(event.target.value)}
                      className="h-10 rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-blue-400"
                      placeholder="Add a task..."
                      required
                    />
                    <input
                      value={newTaskDue}
                      onChange={(event) => setNewTaskDue(event.target.value)}
                      type="datetime-local"
                      className="h-10 rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-blue-400"
                    />
                    <select
                      value={newTaskPriority}
                      onChange={(event) => setNewTaskPriority(event.target.value)}
                      className="h-10 rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-blue-400"
                    >
                      <option value="NORMAL">Normal</option>
                      <option value="IMPORTANT">Important</option>
                      <option value="URGENT">Urgent</option>
                    </select>
                    <button type="submit" disabled={creatingTask} className="rounded-lg bg-blue-700 px-4 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-50">
                      {creatingTask ? 'Adding...' : 'Add'}
                    </button>
                  </form>
                )}
                {tasks.length === 0 ? (
                  <div className="flex h-56 items-center justify-center rounded-xl border border-slate-200 bg-white text-sm text-slate-400">No tasks in this channel yet.</div>
                ) : (
                  <div className="space-y-2">
                    {tasks.map((task) => (
                      <div key={task.id} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4">
                        <button
                          onClick={() => toggleTask(task)}
                          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${
                            task.status === 'COMPLETED' ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-slate-300 text-transparent hover:border-blue-500'
                          }`}
                          title="Toggle task"
                        >
                          <Check className="h-4 w-4" />
                        </button>
                        <div className="min-w-0 flex-1">
                          <div className={`text-sm font-semibold ${task.status === 'COMPLETED' ? 'text-slate-400 line-through' : 'text-slate-900'}`}>{task.title}</div>
                          <div className="text-xs text-slate-500">{task.priority} {task.dueDate ? `- ${timeAgo(task.dueDate)}` : ''}</div>
                        </div>
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">{task.status.replace('_', ' ')}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'pinned' && (
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-2">
                    <Pin className="h-5 w-5 text-amber-500" />
                    <h3 className="text-base font-bold text-slate-900">Pinned Messages</h3>
                  </div>
                  <span className="text-xs font-semibold text-slate-500 bg-slate-100 px-2.5 py-0.5 rounded-full">
                    {pinnedMessages.length} pinned
                  </span>
                </div>
                {pinnedMessages.length === 0 ? (
                  <div className="flex h-56 flex-col items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white text-slate-400">
                    <Pin className="h-8 w-8 text-slate-300" />
                    <p className="text-sm font-medium">No pinned messages in this channel yet.</p>
                    <p className="text-xs text-slate-400">Pin important announcements or links using the message action menu.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {pinnedMessages.map((message) => (
                      <div key={message.id} className="rounded-xl border border-amber-200/80 bg-amber-50/30 p-3 shadow-sm">
                        <MessageBubble
                          id={message.id}
                          content={message.content || ''}
                          author={message.sender?.profile?.displayName || 'Workspace user'}
                          timestamp={timeAgo(message.createdAt)}
                          variant="channel"
                          isOwn={!!currentUserId && message.senderId === currentUserId}
                          isEdited={message.isEdited}
                          isPinned={true}
                          reactions={reactionCounts(message.reactions, currentUserId)}
                          canEdit={!!currentUserId && message.senderId === currentUserId}
                          avatarNode={
                            <div className={`flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold ${avatarAccent(message.sender?.profile?.displayName || 'Workspace user')}`}>
                              {initials(message.sender?.profile?.displayName || 'Workspace user')}
                            </div>
                          }
                          currentUserId={currentUserId}
                          createdAt={message.createdAt}
                          onAction={(action, payload) => handleMessageAction(message.id, action, payload)}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'calls' && (
              <div
                ref={callHistoryScrollRef}
                onScroll={(event) => {
                  const el = event.currentTarget;
                  // Near the bottom and more call events exist -> fetch older.
                  if (el.scrollHeight - el.scrollTop - el.clientHeight < 120 && callHistoryHasMore && !loadingCallHistory) {
                    void loadOlderCallHistory();
                  }
                }}
                className="flex-1 overflow-y-auto p-6 space-y-6"
              >
                {/* Hero Call Banner */}
                <div className="rounded-2xl border border-emerald-200/80 bg-gradient-to-br from-emerald-50/70 via-white to-emerald-50/30 p-6 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-600 text-white shadow-md shadow-emerald-500/20">
                      <Video className="h-6 w-6" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-slate-900">
                        {isCallActiveInChannel ? 'Active Channel Call' : 'Channel Calls & Huddles'}
                      </h3>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {isCallActiveInChannel
                          ? 'A video call is currently active in this channel.'
                          : `Start an instant video call with members of #${selectedChat ? channelName(selectedChat) : 'channel'}.`}
                      </p>
                    </div>
                  </div>
                  {isCallActiveInChannel ? (
                    <button
                      type="button"
                      onClick={() => {
                        useCallStore.getState().joinCall(
                          selectedId,
                          callRoomName(selectedId),
                          `#${selectedChat ? channelName(selectedChat) : 'Channel'}`,
                        );
                      }}
                      className="flex items-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 text-xs font-bold shadow-md shadow-emerald-500/20 transition active:scale-95 cursor-pointer shrink-0"
                    >
                      <span className="relative flex h-2 w-2">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75" />
                        <span className="relative inline-flex h-2 w-2 rounded-full bg-white" />
                      </span>
                      <span>Join Active Call</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        const channelLabel = selectedChat ? channelName(selectedChat) : 'Channel';
                        startOutgoingCall(selectedId, callRoomName(selectedId), channelLabel, currentUserName);
                      }}
                      className="flex items-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 text-xs font-bold shadow-md shadow-emerald-500/20 transition active:scale-95 cursor-pointer shrink-0"
                    >
                      <Video className="h-4 w-4" />
                      <span>Start Channel Call</span>
                    </button>
                  )}
                </div>

                {/* Call History */}
                <div>
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
                    <div className="flex items-center gap-2">
                      <PhoneCall className="h-4 w-4 text-slate-700" />
                      <h3 className="text-sm font-bold text-slate-900">Call History Log</h3>
                    </div>
                    <span className="text-xs font-semibold text-slate-500 bg-slate-100 px-2.5 py-0.5 rounded-full">
                      {callHistory.length} record{callHistory.length === 1 ? '' : 's'}
                    </span>
                  </div>

                  {loadingCallHistory && callHistory.length === 0 ? (
                    <div className="flex h-48 items-center justify-center rounded-xl border border-slate-200 bg-white text-sm text-slate-400">Loading call history...</div>
                  ) : callHistory.length === 0 ? (
                    <div className="flex h-48 flex-col items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white text-slate-400">
                      <Video className="h-8 w-8 text-slate-300" />
                      <p className="text-sm font-medium">No call history in this channel yet.</p>
                      <p className="text-xs text-slate-400">Calls started in this channel will appear here.</p>
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      {callHistory.map((msg) => (
                        <div key={msg.id} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 transition hover:bg-slate-50/60">
                          <div className="flex items-center gap-3">
                            <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${
                              msg.messageType === 'SYSTEM_CALL_START' ? 'bg-emerald-50 text-emerald-600' :
                              msg.messageType === 'SYSTEM_CALL_END' ? 'bg-blue-50 text-blue-600' : 'bg-red-50 text-red-600'
                            }`}>
                              <Video className="h-5 w-5" />
                            </div>
                            <div>
                              <div className="text-xs font-bold text-slate-900">{msg.content || 'Channel Call'}</div>
                              <div className="text-[11px] text-slate-400 mt-0.5">{timeAgo(msg.createdAt)}</div>
                            </div>
                          </div>
                          <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                            msg.messageType === 'SYSTEM_CALL_START' ? 'bg-emerald-100 text-emerald-800' :
                            msg.messageType === 'SYSTEM_CALL_END' ? 'bg-slate-100 text-slate-700' : 'bg-red-100 text-red-700'
                          }`}>
                            {msg.messageType === 'SYSTEM_CALL_START' ? 'ONGOING' : msg.messageType === 'SYSTEM_CALL_END' ? 'ENDED' : 'DECLINED'}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                  {loadingCallHistory && callHistory.length > 0 && (
                    <div className="py-3 text-center text-xs text-slate-400">Loading more call history...</div>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </main>

      {showCreate && (
        <Portal>
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop Overlay */}
            <div 
              className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm transition-opacity cursor-pointer"
              onClick={() => setShowCreate(false)}
            />
            
            {/* Modal Content */}
            <form onSubmit={createSpace} className="relative z-10 w-full max-w-2xl sm:max-w-3xl rounded-2xl border border-slate-200 bg-white p-8 shadow-2xl modal-card">
              <div className="mb-6 flex items-center justify-between border-b border-slate-100 pb-4">
                <div>
                  <h2 className="text-xl sm:text-2xl font-bold text-slate-950">Create a Channel</h2>
                  <p className="text-xs sm:text-sm text-slate-500 mt-0.5">Channels are where your team communicates about specific topics.</p>
                </div>
                <button type="button" onClick={() => setShowCreate(false)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors" title="Close">
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="space-y-6">
                {/* Channel Name */}
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
                    Channel Name <span className="text-red-500">*</span>
                  </label>
                  <div className="relative flex items-center">
                    <span className="absolute left-3.5 text-slate-400 font-bold text-sm">#</span>
                    <input
                      value={createName}
                      onChange={(event) => setCreateName(event.target.value)}
                      placeholder="e.g. project-launch"
                      className="h-11 w-full rounded-xl border border-slate-200 pl-9 pr-3 text-sm text-slate-900 bg-white placeholder-slate-400 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all font-medium"
                      required
                    />
                  </div>
                </div>

                {/* Channel Type */}
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-2">
                    Channel Scope
                  </label>
                  <div className="grid grid-cols-3 gap-4">
                    {[
                      { id: 'TEAM_CHANNEL', label: 'Team Channel', desc: 'Grouped by team' },
                      { id: 'DEPARTMENT', label: 'Department', desc: 'Grouped by department' },
                      { id: 'ORG_FEED', label: 'All Company', desc: 'Entire organization' },
                    ].map((typeOption) => (
                      <button
                        key={typeOption.id}
                        type="button"
                        onClick={() => {
                          setCreateSpaceType(typeOption.id);
                          setCreateMemberSearch('');
                          if (typeOption.id === 'ORG_FEED') {
                            setCreateTeam('');
                            setCreateParticipantIds(people.map((p) => p.userId));
                          } else if (typeOption.id === 'DEPARTMENT') {
                            const defDept = availableDepartments[0] || 'IT';
                            setCreateTeam(defDept);
                            const matches = people.filter((p) => (p.department || '').toLowerCase().includes(defDept.toLowerCase())).map((p) => p.userId);
                            setCreateParticipantIds(matches.length > 0 ? matches : people.map((p) => p.userId));
                          } else {
                            setCreateTeam('');
                            setCreateParticipantIds([]);
                          }
                        }}
                        className={`flex flex-col items-start p-4 rounded-xl border text-left transition-all ${
                          createSpaceType === typeOption.id
                            ? 'border-blue-600 bg-blue-50/70 text-blue-950 ring-2 ring-blue-600/30 shadow-sm'
                            : 'border-slate-200 hover:border-slate-300 text-slate-700 bg-white hover:bg-slate-50/50'
                        }`}
                      >
                        <span className="text-sm font-bold">{typeOption.label}</span>
                        <span className="text-xs text-slate-500 mt-1 leading-tight">{typeOption.desc}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Team Name selection (for TEAM_CHANNEL) */}
                {createSpaceType === 'TEAM_CHANNEL' && (
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
                      Team Name
                    </label>
                    <input
                      value={createTeam}
                      onChange={(event) => setCreateTeam(event.target.value)}
                      placeholder="e.g. Engineering, Marketing, Product"
                      className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm text-slate-900 bg-white placeholder-slate-400 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all"
                    />
                    {availableTeams.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        <span className="text-[11px] text-slate-400 font-medium">Suggestions:</span>
                        {availableTeams.map((teamNameItem) => (
                          <button
                            key={teamNameItem}
                            type="button"
                            onClick={() => setCreateTeam(teamNameItem)}
                            className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold transition ${
                              createTeam === teamNameItem
                                ? 'bg-blue-600 text-white'
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                            }`}
                          >
                            {teamNameItem}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Department Name selection (for DEPARTMENT) */}
                {createSpaceType === 'DEPARTMENT' && (
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
                      Select Department
                    </label>
                    <input
                      value={createTeam}
                      onChange={(event) => {
                        const val = event.target.value;
                        setCreateTeam(val);
                        if (val.trim()) {
                          const dLower = val.trim().toLowerCase();
                          const matches = people
                            .filter((p) => (p.department || '').toLowerCase().includes(dLower))
                            .map((p) => p.userId);
                          setCreateParticipantIds(matches.length > 0 ? matches : people.map((p) => p.userId));
                        } else {
                          setCreateParticipantIds(people.map((p) => p.userId));
                        }
                      }}
                      placeholder="e.g. IT, Engineering, Sales, HR, Finance, Operations"
                      className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm text-slate-900 bg-white placeholder-slate-400 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all"
                    />
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <span className="text-[11px] text-slate-400 font-medium">Departments:</span>
                      {availableDepartments.map((deptItem) => (
                        <button
                          key={deptItem}
                          type="button"
                          onClick={() => {
                            setCreateTeam(deptItem);
                            const dLower = deptItem.toLowerCase();
                            const matches = people
                              .filter((p) => (p.department || '').toLowerCase().includes(dLower))
                              .map((p) => p.userId);
                            setCreateParticipantIds(matches.length > 0 ? matches : people.map((p) => p.userId));
                          }}
                          className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                            createTeam === deptItem
                              ? 'bg-blue-600 text-white shadow-sm'
                              : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                          }`}
                        >
                          {deptItem}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Description */}
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
                    Description <span className="text-slate-400 font-normal">(optional)</span>
                  </label>
                  <textarea
                    value={createDescription}
                    onChange={(event) => setCreateDescription(event.target.value)}
                    placeholder="What is this channel about?"
                    className="min-h-16 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 bg-white placeholder-slate-400 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all resize-none"
                  />
                </div>

                {/* Add Members Banner / Selector */}
                <div>
                  {createSpaceType === 'ORG_FEED' ? (
                    <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-3.5 flex items-center justify-between text-xs text-blue-900">
                      <div className="flex items-center gap-2.5">
                        <Users className="h-4.5 w-4.5 text-blue-600 shrink-0" />
                        <div>
                          <div className="font-bold">All Company Channel</div>
                          <div className="text-[11px] text-blue-700 mt-0.5">Includes all organization members automatically.</div>
                        </div>
                      </div>
                      <span className="rounded-full bg-blue-600 px-3 py-1 text-xs font-bold text-white shrink-0 shadow-sm shadow-blue-500/20">
                        {people.length} Members
                      </span>
                    </div>
                  ) : createSpaceType === 'DEPARTMENT' ? (
                    <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-3.5 flex items-center justify-between text-xs text-blue-900">
                      <div className="flex items-center gap-2.5">
                        <Users className="h-4.5 w-4.5 text-blue-600 shrink-0" />
                        <div>
                          <div className="font-bold">
                            {createTeam.trim() ? `${createTeam.trim()} Department` : 'Department'} Channel
                          </div>
                          <div className="text-[11px] text-blue-700 mt-0.5">
                            {createTeam.trim()
                              ? `Includes all members of ${createTeam.trim()} department automatically.`
                              : 'Select a department above to add members automatically.'}
                          </div>
                        </div>
                      </div>
                      <span className="rounded-full bg-blue-600 px-3 py-1 text-xs font-bold text-white shrink-0 shadow-sm shadow-blue-500/20">
                        {createParticipantIds.length} Members
                      </span>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="block text-xs font-bold uppercase tracking-wider text-slate-600">
                          Add Members <span className="text-slate-400 font-normal">({createParticipantIds.length} selected)</span>
                        </label>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setCreateParticipantIds(people.map((p) => p.userId))}
                            className="text-[11px] font-semibold text-blue-600 hover:text-blue-800 transition"
                          >
                            Select All ({people.length})
                          </button>
                          <span className="text-slate-300 text-[10px]">|</span>
                          <button
                            type="button"
                            onClick={() => setCreateParticipantIds([])}
                            className="text-[11px] font-semibold text-slate-400 hover:text-slate-600 transition"
                          >
                            Clear
                          </button>
                        </div>
                      </div>
                      {createParticipantIds.length > 0 && (
                        <div className="mb-2 flex flex-wrap gap-1 max-h-20 overflow-y-auto">
                          {createParticipantIds.map((id) => {
                            const p = people.find((x) => x.userId === id);
                            return (
                              <span
                                key={id}
                                className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-900 border border-blue-200"
                              >
                                {p?.displayName || id}
                                <button
                                  type="button"
                                  className="ml-0.5 leading-none text-blue-700 hover:text-blue-950 font-bold"
                                  onClick={() => toggleParticipant(id)}
                                  aria-label="Remove member"
                                >
                                  ×
                                </button>
                              </span>
                            );
                          })}
                        </div>
                      )}
                      <input
                        type="search"
                        value={createMemberSearch}
                        onChange={(event) => setCreateMemberSearch(event.target.value)}
                        placeholder="Search people or department…"
                        className="mb-2 h-9 w-full rounded-xl border border-slate-200 px-3 text-xs text-slate-900 outline-none focus:border-blue-500"
                      />
                      <div className="max-h-36 overflow-y-auto rounded-xl border border-slate-200 p-1.5 space-y-0.5">
                        {people.length === 0 ? (
                          <div className="p-2 text-xs text-slate-400">No people found.</div>
                        ) : filteredPeopleForCreate.length === 0 ? (
                          <div className="p-2 text-xs text-slate-400">No matching people.</div>
                        ) : (
                          filteredPeopleForCreate.map((person) => (
                            <label key={person.userId} className="flex cursor-pointer items-center justify-between rounded-lg px-2.5 py-1.5 hover:bg-slate-50 transition">
                              <div className="flex items-center gap-2 min-w-0">
                                <input
                                  type="checkbox"
                                  checked={createParticipantIds.includes(person.userId)}
                                  onChange={() => toggleParticipant(person.userId)}
                                  className="rounded text-blue-600 focus:ring-blue-500 h-4 w-4 shrink-0"
                                />
                                <span className="text-xs font-medium text-slate-800 truncate">{person.displayName}</span>
                              </div>
                              {person.department && (
                                <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full shrink-0 ml-2">
                                  {person.department}
                                </span>
                              )}
                            </label>
                          ))
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>

              <div className="mt-6 flex items-center justify-end gap-2 border-t border-slate-100 pt-4">
                <button 
                  type="button" 
                  onClick={() => setShowCreate(false)} 
                  className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition active:scale-[0.98]"
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  disabled={creatingSpace || !createName.trim()} 
                  className="rounded-xl bg-blue-600 px-5 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition active:scale-[0.98] shadow-sm shadow-blue-500/20"
                >
                  {creatingSpace ? 'Creating...' : 'Create Channel'}
                </button>
              </div>
            </form>
          </div>
        </Portal>
      )}

      {/* Quick Switcher Modal (Cmd+K) */}
      {showQuickSwitcher && (
        <Portal>
          <div className="fixed inset-0 z-50 flex items-start justify-center pt-24 p-4">
            <div className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm" onClick={() => setShowQuickSwitcher(false)} />
            <div className="relative z-10 w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl">
              <div className="flex items-center gap-2 border-b border-slate-100 pb-3 px-2">
                <Search className="h-4 w-4 text-slate-400 shrink-0" />
                <input
                  autoFocus
                  value={quickSearchQuery}
                  onChange={(e) => setQuickSearchQuery(e.target.value)}
                  placeholder="Jump to channel or team... (Type name)"
                  className="w-full text-sm text-slate-900 outline-none bg-transparent"
                />
                <kbd className="rounded border border-slate-200 bg-slate-100 px-1.5 py-0.5 text-[10px] font-mono text-slate-500">ESC</kbd>
              </div>
              <div className="mt-2 max-h-72 overflow-y-auto space-y-1">
                {chats
                  .filter((c) => {
                    const q = quickSearchQuery.trim().toLowerCase();
                    if (!q) return true;
                    return channelName(c).toLowerCase().includes(q) || teamName(c).toLowerCase().includes(q);
                  })
                  .map((c) => (
                    <button
                      key={c.conversationId}
                      onClick={() => {
                        setSelectedId(c.conversationId);
                        setShowQuickSwitcher(false);
                        setQuickSearchQuery('');
                      }}
                      className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left transition ${
                        selectedId === c.conversationId ? 'bg-blue-50 text-blue-800 font-bold' : 'hover:bg-slate-50 text-slate-700'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <Hash className="h-4 w-4 text-slate-400 shrink-0" />
                        <span className="truncate text-sm">{channelName(c)}</span>
                        <span className="text-xs text-slate-400">({teamName(c)})</span>
                      </div>
                      <span className="text-[10px] text-slate-400 uppercase font-semibold">{spaceLabel(c.group?.spaceType)}</span>
                    </button>
                  ))}
              </div>
            </div>
          </div>
        </Portal>
      )}

    </div>
  );
}
