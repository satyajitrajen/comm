'use client';

import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { ChevronLeft, Plus, RefreshCw, Search, Send, Users, X, Paperclip, Smile, FileText, BarChart2, CheckSquare, Video, User, Mail, Info } from 'lucide-react';
import { chatsAPI, messagesAPI, usersAPI, filesAPI, tasksAPI } from '../../../services/api';
import { toPlainText } from '../../../lib/mentions';
import { avatarAccent, initials, MAX_UPLOAD_BYTES, MAX_UPLOAD_LABEL, saveBlob, timeAgo } from '../_utils';
import Portal from '../../components/Portal';
import { MessageBubble, PollData, TaskData } from '../../components/MessageBubble';
import CreatePollModal from '../../components/CreatePollModal';
import CreateTaskModal from '../../components/CreateTaskModal';
import ChatComposerInput from '../../components/ChatComposerInput';
import UploadProgressIndicator from '../../components/UploadProgressIndicator';
import { FormattedMessageContent } from '../../../lib/tabularMessageContent';
import {
  debounce,
  getChatsFeedCached,
  invalidateChatsFeed,
} from '../../../lib/chatsFeedCache';
import { useCallStore } from '../../../store/useCallStore';
import { callRoomName } from '../../../lib/callRoom';
import { resolveServiceBaseUrl } from '../../../lib/desktopRuntime';
import { resolveStatus, statusDotClass, statusLabel } from '../../../lib/statusAvailability';

type DirectChat = {
  conversationId: string;
  id?: string;
  type: string;
  recipient?: { id?: string; displayName?: string | null; presence?: string | null; availability?: string | null; email?: string | null; avatarUrl?: string | null; aboutText?: string | null } | null;
  participants?: Array<{ user?: { id: string; email?: string | null; profile?: { displayName?: string | null } | null } | null }>;
  lastMessage?: { content?: string | null; createdAt?: string | null } | null;
  unreadCount?: number;
};

type FileItem = {
  id: string;
  filename: string;
  mimeType: string;
  fileSizeBytes: string | number;
  createdAt: string;
  uploader?: { profile?: { displayName?: string | null } | null } | null;
};

type BackendMessage = {
  id: string;
  senderId?: string;
  replyToMessageId?: string | null;
  content?: string | null;
  createdAt: string;
  isEdited?: boolean;
  isDeletedGlobally?: boolean;
  reactions?: Array<{ emoji: string; userId?: string }> | null;
  sender?: { id?: string; profile?: { displayName?: string | null } | null } | null;
  messageType?: string;
  polls?: PollData | null;
  tasks?: TaskData[] | null;
  attachments?: Array<{ file?: FileItem | null }> | null;
  reads?: Array<{ userId: string; readAt?: string }> | null;
  deliveries?: Array<{ userId: string; deliveredAt?: string }> | null;
};

type DirectoryPerson = {
  userId: string;
  displayName: string;
  email?: string | null;
  presence?: string | null;
  availability?: string | null;
};

function chatName(chat: DirectChat) {
  return (
    chat.recipient?.displayName ||
    chat.participants?.map((item) => item.user?.profile?.displayName || item.user?.email).filter(Boolean).join(', ') ||
    'Direct Message'
  );
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
  return <img src={src} alt={filename} className="max-w-full max-h-64 rounded-lg object-contain" />;
}

export default function DMsPage() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [currentUserId, setCurrentUserId] = useState('');
  const [chats, setChats] = useState<DirectChat[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [messages, setMessages] = useState<BackendMessage[]>([]);
  const [people, setPeople] = useState<DirectoryPerson[]>([]);
  const [query, setQuery] = useState('');
  const [personQuery, setPersonQuery] = useState('');
  const [draft, setDraft] = useState('');
  const [loadingChats, setLoadingChats] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  // Cursor paging state for scroll-up history loading.
  const messageScrollRef = useRef<HTMLDivElement | null>(null);
  const [hasMoreMessages, setHasMoreMessages] = useState(false);
  const [olderCursor, setOlderCursor] = useState<string | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  /** Whether the transcript should follow new arrivals. */
  const pinnedToBottomRef = useRef(true);
  const [showNewDm, setShowNewDm] = useState(false);
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [showCreatePoll, setShowCreatePoll] = useState(false);
  const [showCreateTask, setShowCreateTask] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showActionsMenu, setShowActionsMenu] = useState(false);
  const [creatingUserId, setCreatingUserId] = useState<string | null>(null);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [threadDraft, setThreadDraft] = useState('');
  const [currentUserName, setCurrentUserName] = useState('');
  const [showProfilePanel, setShowProfilePanel] = useState(false);
  const startOutgoingCall = useCallStore((state) => state.startOutgoingCall);

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

  // Resolve current user name for call invite
  useEffect(() => {
    try {
      const stored = localStorage.getItem('veloce_user');
      if (stored) {
        const u = JSON.parse(stored);
        setCurrentUserName(u.displayName || u.name || u.email || 'Someone');
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const stored = localStorage.getItem('veloce_user');
        if (stored) setCurrentUserId(JSON.parse(stored).id || '');
      } catch {
        setCurrentUserId('');
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    function handleOpen() {
      setShowNewDm(true);
    }
    window.addEventListener('open-create-dm', handleOpen);

    if (sessionStorage.getItem('open-create-dm') === 'true') {
      sessionStorage.removeItem('open-create-dm');
      window.setTimeout(() => setShowNewDm(true), 0);
    }

    return () => {
      window.removeEventListener('open-create-dm', handleOpen);
    };
  }, []);

  async function loadChats(preferredId?: string | null, force = false) {
    setLoadingChats(true);
    setError('');
    try {
      const feed = await getChatsFeedCached(force);
      const directChats = feed.filter((chat) => chat.type === 'DIRECT') as DirectChat[];
      // Deduplicate by conversationId — backend/cache race can produce duplicates
      const seen = new Set<string>();
      const uniqueChats = directChats.filter((chat) => {
        if (seen.has(chat.conversationId)) return false;
        seen.add(chat.conversationId);
        return true;
      });
      setChats(uniqueChats);
      const requested =
        preferredId ||
        (typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('conversation') : null);
      const nextSelected = requested && directChats.some((chat: DirectChat) => chat.conversationId === requested)
        ? requested
        : selectedId && directChats.some((chat: DirectChat) => chat.conversationId === selectedId)
          ? selectedId
          : directChats[0]?.conversationId || '';
      setSelectedId(nextSelected);
    } catch {
      setError('Direct messages could not be loaded.');
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

  const scheduleChatListRefresh = useMemo(
    () => debounce((preferredId?: string | null) => { void loadChats(preferredId, true); }, 800),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      loadChats();
      loadPeople();
    }, 0);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadMessages(conversationId: string) {
    if (!conversationId) {
      setMessages([]);
      setSelectedThreadId(null);
      return;
    }
    setSelectedThreadId(null);
    setLoadingMessages(true);
    try {
      const history = await chatsAPI.getHistory(conversationId);
      const raw = Array.isArray(history?.messages) ? (history.messages as BackendMessage[]) : [];
      // Deduplicate by message id in case the API returns overlapping pages
      const seenIds = new Set<string>();
      const unique = raw.filter((m) => { if (seenIds.has(m.id)) return false; seenIds.add(m.id); return true; });
      setMessages(unique);
      setHasMoreMessages(!!history?.hasMore);
      setOlderCursor(history?.nextCursor ?? null);
      setChats((current) =>
        current.map((chat) =>
          chat.conversationId === conversationId ? { ...chat, unreadCount: 0 } : chat,
        ),
      );
    } catch {
      setError('Conversation history could not be loaded.');
      setMessages([]);
      setHasMoreMessages(false);
      setOlderCursor(null);
    } finally {
      setLoadingMessages(false);
    }
  }

  /** Prepends older messages while holding the viewport still. */
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
        setMessages((current) => {
          const existingIds = new Set(current.map((m) => m.id));
          const newOlder = older.filter((m) => !existingIds.has(m.id));
          return [...newOlder, ...current];
        });
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

  useEffect(() => {
    const timer = window.setTimeout(() => {
      loadMessages(selectedId);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [selectedId]);

  // Opening a conversation always starts at the newest message.
  useEffect(() => {
    pinnedToBottomRef.current = true;
  }, [selectedId]);

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
    const timer = window.setTimeout(() => {
      if (!pinnedToBottomRef.current) return;
      const el = messageScrollRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    }, 100);
    return () => window.clearTimeout(timer);
  }, [selectedId, newestMessageId]);

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

    socket.on('message.edited', () => {
      loadMessages(selectedId);
    });

    socket.on('message.deleted', () => {
      loadMessages(selectedId);
      scheduleChatListRefresh(selectedId);
    });

    socket.on('message.reacted', () => {
      loadMessages(selectedId);
    });

    socket.on('poll.voted', () => {
      loadMessages(selectedId);
    });

    socket.on('task.created', () => {
      loadMessages(selectedId);
    });

    socket.on('user.presence', () => {
      scheduleChatListRefresh(selectedId);
    });

    return () => {
      socket.emit('room.leave', { conversationId: selectedId });
      socket.disconnect();
    };
  }, [selectedId]);

  const filteredChats = chats.filter((chat) => {
    const search = query.trim().toLowerCase();
    return !search || chatName(chat).toLowerCase().includes(search);
  });

  const selectedChat = chats.find((chat) => chat.conversationId === selectedId) || null;
  const selectedName = selectedChat ? chatName(selectedChat) : '';
  const unreadTotal = chats.reduce((total, chat) => total + (chat.unreadCount || 0), 0);

  const isCallActiveInDM = useMemo(() => {
    const lastCallMsg = [...messages].reverse().find((m) =>
      ['SYSTEM_CALL_START', 'SYSTEM_CALL_END', 'SYSTEM_CALL_DECLINE'].includes(m.messageType || '')
    );
    return lastCallMsg?.messageType === 'SYSTEM_CALL_START';
  }, [messages]);

  const rootMessages = useMemo(
    () =>
      messages.filter(
        (m) =>
          !m.replyToMessageId &&
          !['SYSTEM_CALL_START', 'SYSTEM_CALL_END', 'SYSTEM_CALL_DECLINE'].includes(m.messageType || '')
      ),
    [messages]
  );
  const repliesByMessage = useMemo(() => {
    return messages.reduce<Record<string, BackendMessage[]>>((groups, m) => {
      if (m.replyToMessageId) {
        groups[m.replyToMessageId] = [...(groups[m.replyToMessageId] || []), m];
      }
      return groups;
    }, {});
  }, [messages]);
  const selectedThread = useMemo(() => {
    return selectedThreadId ? messages.find((m) => m.id === selectedThreadId) || null : null;
  }, [selectedThreadId, messages]);
  const selectedThreadReplies = useMemo(() => {
    return selectedThreadId ? repliesByMessage[selectedThreadId] || [] : [];
  }, [selectedThreadId, repliesByMessage]);

  const selectablePeople = useMemo(() => {
    const existingRecipientIds = new Set(chats.map((chat) => chat.recipient?.id).filter(Boolean));
    return people.filter((person) => {
      const search = `${person.displayName} ${person.email || ''}`.toLowerCase();
      return person.userId !== currentUserId && !existingRecipientIds.has(person.userId) && (!personQuery || search.includes(personQuery.toLowerCase()));
    });
  }, [chats, currentUserId, people, personQuery]);

  async function createDirect(person: DirectoryPerson) {
    setCreatingUserId(person.userId);
    setError('');
    try {
      const conversation = await chatsAPI.createDirect(person.userId);
      const conversationId = conversation.id || conversation.conversationId;
      setShowNewDm(false);
      invalidateChatsFeed();
      await loadChats(conversationId, true);
    } catch {
      setError('Direct message could not be created.');
    } finally {
      setCreatingUserId(null);
    }
  }

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedId || (!draft.trim() && !pendingFile)) return;
    setSending(true);
    setError('');
    try {
      if (pendingFile) {
        setUploading(true);
        try {
          await filesAPI.upload(pendingFile, selectedId);
          setPendingFile(null);
          if (fileInputRef.current) fileInputRef.current.value = '';
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
        const sent = await messagesAPI.send({ conversationId: selectedId, content: draft.trim() });
        setMessages((prev) => {
          if (prev.some((m) => m.id === sent.id)) return prev;
          return [...prev, sent];
        });
        setDraft('');
      }

      await loadChats(selectedId);
      await loadMessages(selectedId);
    } catch {
      setError('Message could not be sent.');
    } finally {
      setSending(false);
    }
  }

  async function sendThreadReply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedId || !selectedThread || !threadDraft.trim()) return;
    try {
      const sent = await messagesAPI.send({
        conversationId: selectedId,
        content: threadDraft.trim(),
        replyToMessageId: selectedThread.id,
      });
      setMessages((prev) => {
        if (prev.some((m) => m.id === sent.id)) return prev;
        return [...prev, sent];
      });
      setThreadDraft('');
    } catch {
      setError('Thread reply could not be sent.');
    }
  }

  function handleFileSelect(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || !selectedId) return;
    if (file.size > MAX_UPLOAD_BYTES) {
      setError(`File exceeds the maximum upload size of ${MAX_UPLOAD_LABEL}.`);
      event.target.value = '';
      return;
    }
    setPendingFile(file);
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
        setSelectedThreadId(messageId);
      } else if (action === 'votePoll' && payload) {
        const message = messages.find((m) => m.id === messageId);
        const pollId = message?.polls?.id;
        if (pollId) {
          await messagesAPI.votePoll(pollId, payload);
          await loadMessages(selectedId);
        }
      } else if (action === 'toggleTask' && payload) {
        const task = messages.flatMap((m) => m.tasks || []).find((t: TaskData) => t.id === payload);
        if (task) {
          const isCompleted = task.status === 'COMPLETED';
          await tasksAPI.update(payload, { complete: !isCompleted });
          await loadMessages(selectedId);
        }
      }
    } catch {
      setError(`Action "${action}" failed.`);
    }
  }

  return (
    <>
      {/* List-detail: below lg only one pane shows, chosen by selection. */}
      <aside
        className={`w-full shrink-0 flex-col border-r border-slate-200 bg-white lg:flex lg:w-[300px] ${
          selectedId ? 'hidden' : 'flex'
        }`}
      >
        <div className="flex h-16 items-center justify-between border-b border-slate-200 px-4">
          <div className="flex items-center gap-2">
            <h1 className="text-sm font-bold text-slate-950">Chats</h1>
            {unreadTotal > 0 && (
              <span className="rounded-full bg-blue-600 px-2 py-0.5 text-[10px] font-bold text-white">
                {unreadTotal}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => loadChats(undefined, true)} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" title="Refresh chats">
              <RefreshCw className="h-4 w-4" />
            </button>
            <button onClick={() => setShowNewDm(true)} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" title="New chat">
              <Plus className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div className="px-3 py-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm outline-none focus:border-blue-400 focus:bg-white"
              placeholder="Search chats"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-2 py-1">
          {loadingChats ? (
            <div className="px-3 py-4 text-sm text-slate-500">Loading chats...</div>
          ) : filteredChats.length === 0 ? (
            <div className="px-3 py-4 text-sm text-slate-500">No chats returned.</div>
          ) : (
            filteredChats.map((chat) => {
              const name = chatName(chat);
              return (
                <button
                  key={chat.conversationId}
                  onClick={() => setSelectedId(chat.conversationId)}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left ${
                    selectedId === chat.conversationId ? 'bg-blue-50' : 'hover:bg-slate-50'
                  }`}
                >
                  {chat.recipient?.avatarUrl ? (
                    <img src={chat.recipient.avatarUrl} alt={name} className="h-9 w-9 rounded-full object-cover shadow-xs border border-slate-200" />
                  ) : (
                    <div className={`flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold ${avatarAccent(name)}`}>
                      {initials(name)}
                    </div>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-semibold text-slate-900">{name}</span>
                      <span className="shrink-0 text-xs text-slate-400">{timeAgo(chat.lastMessage?.createdAt)}</span>
                    </span>
                    <span className="mt-0.5 flex items-center justify-between gap-2">
                      <span className="truncate text-xs text-slate-500">{chat.lastMessage?.content ? toPlainText(chat.lastMessage.content) : 'No messages yet'}</span>
                      {!!chat.unreadCount && (
                        <span
                          className="min-w-5 rounded-full bg-blue-600 px-1.5 text-center text-[10px] font-bold text-white"
                          title={`${chat.unreadCount} unread message${chat.unreadCount === 1 ? '' : 's'}`}
                        >
                          {chat.unreadCount}
                        </span>
                      )}
                    </span>
                  </span>
                </button>
              );
            })
          )}
        </div>
      </aside>

      <main
        className={`min-w-0 flex-1 flex-col bg-white lg:flex ${
          selectedId ? 'flex' : 'hidden'
        }`}
      >
        {selectedChat ? (
          <>
            <header className="flex h-16 items-center gap-2 border-b border-slate-200 px-3 lg:gap-3 lg:px-5">
              {/* Returns to the conversation list on small screens. */}
              <button
                type="button"
                onClick={() => setSelectedId('')}
                aria-label="Back to conversations"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-slate-600 transition hover:bg-slate-100 lg:hidden"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              {selectedChat.recipient?.avatarUrl ? (
                <img src={selectedChat.recipient.avatarUrl} alt={selectedName} className="h-10 w-10 rounded-full object-cover shadow-xs border border-slate-200" />
              ) : (
                <div className={`flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold ${avatarAccent(selectedName)}`}>
                  {initials(selectedName)}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-slate-950">{selectedName}</div>
                <div className="flex items-center gap-1.5 text-xs text-slate-500">
                  {selectedChat.recipient ? (
                    <>
                      <span
                        className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: resolveStatus(selectedChat.recipient).hex || '#10b981' }}
                      />
                      <span className="font-semibold text-slate-600 dark:text-slate-300">{statusLabel(selectedChat.recipient)}</span>
                    </>
                  ) : (
                    'Workspace member'
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3 select-none">
                <button
                  onClick={() => {
                    startOutgoingCall(selectedId, callRoomName(selectedId), selectedName, currentUserName);
                  }}
                  className="p-1 text-slate-600 hover:text-slate-900 transition-colors cursor-pointer"
                  title="Start Video Call"
                >
                  <Video className="h-5 w-5" />
                </button>
                <button
                  onClick={() => setShowProfilePanel((prev) => !prev)}
                  className={`p-1 transition-colors cursor-pointer ${
                    showProfilePanel
                      ? 'text-blue-600'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                  title="View User Profile"
                >
                  <User className="h-5 w-5" />
                </button>
              </div>
            </header>

            {isCallActiveInDM && (
              <div className="flex items-center justify-between border-b border-emerald-700 bg-emerald-600 px-6 py-2.5 text-white select-none shrink-0">
                <div className="flex items-center gap-2.5 text-xs font-semibold">
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
                  </span>
                  <span>Video call in progress with {selectedName}</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    useCallStore.getState().joinCall(
                      selectedId,
                      callRoomName(selectedId),
                      selectedName || 'DM Call',
                    );
                  }}
                  className="flex items-center gap-1.5 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-1 text-xs font-semibold shadow transition active:scale-95 cursor-pointer"
                >
                  <Video className="h-3.5 w-3.5" />
                  <span>Join Call</span>
                </button>
              </div>
            )}

            <div className="flex min-h-0 flex-1">
              <section className="flex min-w-0 flex-1 flex-col">
                <div
                  ref={messageScrollRef}
                  // See teams/page.tsx: without this, incoming messages are
                  // silent to screen readers.
                  role="log"
                  aria-live="polite"
                  aria-relevant="additions"
                  aria-label={`Messages with ${selectedName}`}
                  onScroll={(event) => {
                    const el = event.currentTarget;
                    pinnedToBottomRef.current =
                      el.scrollHeight - el.scrollTop - el.clientHeight < 80;
                    if (el.scrollTop < 120 && hasMoreMessages && !loadingOlder) {
                      void loadOlderMessages();
                    }
                  }}
                  className="flex-1 space-y-5 overflow-y-auto px-6 py-6"
                >
                  {error && (
                    <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
                  )}
                  {loadingOlder && (
                    <div className="py-2 text-center text-xs text-slate-400">Loading older messages...</div>
                  )}
                  {loadingMessages ? (
                    <div className="text-sm text-slate-500">Loading conversation...</div>
                  ) : rootMessages.length === 0 ? (
                    <div className="flex h-full items-center justify-center text-sm text-slate-400">No messages in this conversation.</div>
                  ) : (
                    rootMessages.map((message) => {
                      const own = message.senderId === currentUserId || message.sender?.id === currentUserId;
                      const author = own ? 'You' : message.sender?.profile?.displayName || selectedName;
                      const isThisCallActive = message.messageType === 'SYSTEM_CALL_START' && (() => {
                        const idx = messages.findIndex((m) => m.id === message.id);
                        if (idx === -1) return false;
                        const subsequent = messages.slice(idx + 1);
                        return !subsequent.some((m) =>
                          m.messageType === 'SYSTEM_CALL_END' || m.messageType === 'SYSTEM_CALL_DECLINE'
                        );
                      })();
                      return (
                        <MessageBubble
                          key={message.id}
                          id={message.id}
                          content={message.content || ''}
                          author={author}
                          timestamp={timeAgo(message.createdAt)}
                          isOwn={own}
                          isEdited={message.isEdited}
                          isDeletedGlobally={message.isDeletedGlobally}
                          variant="dm"
                          canEdit={own}
                          createdAt={message.createdAt}
                          replyCount={repliesByMessage[message.id]?.length || 0}
                          reactions={(message.reactions || []).reduce<Array<{ emoji: string; count: number; reactedByMe: boolean }>>((acc, r) => {
                            const found = acc.find((x) => x.emoji === r.emoji);
                            if (found) { found.count += 1; if (r.userId === currentUserId) found.reactedByMe = true; }
                            else acc.push({ emoji: r.emoji, count: 1, reactedByMe: r.userId === currentUserId });
                            return acc;
                          }, [])}
                          availableConversations={chats.map((c) => ({ id: c.conversationId, name: chatName(c) }))}
                          avatarNode={
                            <div className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${avatarAccent(author)}`}>
                              {initials(author)}
                            </div>
                          }
                          messageType={message.messageType}
                          conversationId={selectedId}
                          conversationName={selectedName || 'DM Call'}
                          isCallActive={isThisCallActive}
                          polls={message.polls}
                          tasks={message.tasks}
                          currentUserId={currentUserId}
                          reads={message.reads || []}
                          deliveries={message.deliveries || []}
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
                      );
                    })
                  )}
                </div>

                <form onSubmit={sendMessage} className="relative border-t border-slate-200 px-5 py-3">
                  {/* Hidden file input */}
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileSelect}
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
                              if (fileInputRef.current) fileInputRef.current.value = '';
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
                      onClick={() => fileInputRef.current?.click()}
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
                      placeholder={`Message ${selectedName}`}
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
                    conversationId={selectedId}
                    isOpen={showCreatePoll}
                    onClose={() => setShowCreatePoll(false)}
                    onSuccess={() => loadMessages(selectedId)}
                  />
                  <CreateTaskModal
                    conversationId={selectedId}
                    people={people}
                    isOpen={showCreateTask}
                    onClose={() => setShowCreateTask(false)}
                    onSuccess={() => loadMessages(selectedId)}
                  />
                </form>
              </section>

              {showProfilePanel && selectedChat && (
                <aside className="w-80 shrink-0 border-l border-slate-200 bg-white p-6 flex flex-col justify-between select-none">
                  <div>
                    <div className="flex items-center justify-between border-b border-slate-200 pb-4">
                      <h3 className="text-sm font-bold text-black flex items-center gap-2">
                        <User className="h-4 w-4 text-blue-600" />
                        <span>User Profile</span>
                      </h3>
                      <button
                        onClick={() => setShowProfilePanel(false)}
                        className="rounded-lg p-1 text-slate-600 hover:bg-slate-100 hover:text-black cursor-pointer"
                        title="Close profile"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>

                    <div className="mt-6 flex flex-col items-center text-center">
                      {selectedChat.recipient?.avatarUrl ? (
                        <img
                          src={selectedChat.recipient.avatarUrl}
                          alt={selectedName}
                          className="mb-3 h-20 w-20 rounded-full object-cover shadow-md border-2 border-slate-200"
                        />
                      ) : (
                        <div className={`mb-3 flex h-20 w-20 items-center justify-center rounded-full text-xl font-bold ${avatarAccent(selectedName)}`}>
                          {initials(selectedName)}
                        </div>
                      )}
                      <h4 className="text-base font-extrabold text-black">{selectedName}</h4>
                      <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-700">
                        {selectedChat.recipient ? (
                          <>
                            <span
                              className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                              style={{ backgroundColor: resolveStatus(selectedChat.recipient).hex || '#10b981' }}
                            />
                            <span className="font-bold text-slate-800">{statusLabel(selectedChat.recipient)}</span>
                          </>
                        ) : (
                          <span className="font-semibold text-slate-700">Workspace Member</span>
                        )}
                      </div>
                    </div>

                    <div className="mt-6 space-y-3 text-xs">
                      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5">
                        <div className="text-[10px] font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
                          <Info className="h-3.5 w-3.5 text-slate-500" />
                          <span>About</span>
                        </div>
                        <div className="mt-1.5 font-semibold text-black leading-relaxed whitespace-pre-wrap">
                          {selectedChat.recipient?.aboutText || 'No status or bio available.'}
                        </div>
                      </div>

                      {selectedChat.recipient?.email && (
                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5">
                          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
                            <Mail className="h-3.5 w-3.5 text-slate-500" />
                            <span>Email Address</span>
                          </div>
                          <div className="mt-1.5 font-bold text-black truncate">{selectedChat.recipient.email}</div>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="pt-4 border-t border-slate-200">
                    <button
                      onClick={() => {
                        startOutgoingCall(selectedId, callRoomName(selectedId), selectedName, currentUserName);
                      }}
                      className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-700 px-4 py-2.5 text-xs font-semibold text-white shadow-md transition active:scale-95 cursor-pointer"
                    >
                      <Video className="h-4 w-4" />
                      <span>Start Video Call</span>
                    </button>
                  </div>
                </aside>
              )}

              {selectedThread && (
                <aside className="hidden w-96 shrink-0 flex-col border-l border-slate-200 bg-slate-50 lg:flex">
                  <div className="flex h-14 items-center justify-between border-b border-slate-200 bg-white px-4">
                    <h3 className="text-sm font-bold text-slate-950">Thread</h3>
                    <button onClick={() => setSelectedThreadId(null)} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" title="Close thread">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="flex-1 overflow-y-auto p-4">
                    <div className="rounded-xl border border-slate-200 bg-white p-4">
                      <div className="text-sm font-semibold text-slate-900">
                        {selectedThread.senderId === currentUserId || selectedThread.sender?.id === currentUserId
                          ? 'You'
                          : selectedThread.sender?.profile?.displayName || selectedName}
                      </div>
                      <div className="mt-2 text-sm leading-6 text-slate-700">
                        <FormattedMessageContent content={selectedThread.content || ''} />
                      </div>
                    </div>
                    <div className="mt-4 space-y-3">
                      {selectedThreadReplies.map((reply) => {
                        const own = reply.senderId === currentUserId || reply.sender?.id === currentUserId;
                        const replyAuthor = own ? 'You' : reply.sender?.profile?.displayName || selectedName;
                        return (
                          <div key={reply.id} className="rounded-xl border border-slate-200 bg-white p-3">
                            <div className="text-xs font-semibold text-slate-500">{replyAuthor}</div>
                            <div className="mt-1 text-sm text-slate-700">
                              <FormattedMessageContent content={reply.content || ''} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
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
                </aside>
              )}
            </div>
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center text-slate-400">
            <div className="text-center">
              <Users className="mx-auto mb-3 h-12 w-12 text-slate-300" />
              <p className="text-sm">Select or start a chat.</p>
            </div>
          </div>
        )}
      </main>

      {showNewDm && (
        <Portal>
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop Overlay */}
            <div 
              className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm transition-opacity cursor-pointer"
              onClick={() => setShowNewDm(false)}
            />
            
            {/* Modal Content */}
            <div className="relative z-10 w-full max-w-md rounded-xl border border-slate-200/80 bg-white p-6 shadow-xl modal-card">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-base font-bold text-slate-950">New chat</h2>
                <button onClick={() => setShowNewDm(false)} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 transition-colors" title="Close">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="relative mb-3">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  value={personQuery}
                  onChange={(event) => setPersonQuery(event.target.value)}
                  className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-4 text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 transition-all"
                  placeholder="Search people"
                />
              </div>
              <div className="max-h-80 overflow-y-auto">
                {selectablePeople.length === 0 ? (
                  <div className="py-8 text-center text-sm text-slate-500">No available people returned.</div>
                ) : (
                  selectablePeople.map((person) => (
                    <button
                      key={person.userId}
                      onClick={() => createDirect(person)}
                      disabled={creatingUserId === person.userId}
                      className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left hover:bg-slate-50 disabled:opacity-60 transition-colors"
                    >
                      <span className={`flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold ${avatarAccent(person.userId)}`}>
                        {initials(person.displayName)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-slate-900">{person.displayName}</span>
                        <span className="block truncate text-xs text-slate-500">{person.email || 'Workspace member'}</span>
                      </span>
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>
        </Portal>
      )}

    </>
  );
}
