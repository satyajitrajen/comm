'use client';

import { useEffect, useRef, useState, useMemo, type PointerEvent as ReactPointerEvent } from 'react';
import { io } from 'socket.io-client';
import { Maximize2, Minimize2, PhoneOff, PhoneCall, UserPlus, Search, Check, X, MessageSquare, Send } from 'lucide-react';
import Portal from './Portal';
import { usersAPI, chatsAPI, messagesAPI } from '../../services/api';
import { resolveServiceBaseUrl } from '../../lib/desktopRuntime';
import { avatarAccent, initials } from '../(app)/_utils';
import {
  isDocumentPipSupported,
  moveToDocumentPip,
  restoreFromDocumentPip,
} from '../../lib/documentPip';
import {
  clampPipPosition,
  PIP_HEIGHT,
  PIP_WIDTH,
} from '../../lib/pipPosition';
import { useCallStore } from '../../store/useCallStore';
import type { CallView } from '../../store/useCallStore';

declare global {
  interface Window {
    JitsiMeetExternalAPI: any;
  }
}

type DirectoryPerson = {
  userId: string;
  displayName: string;
  email?: string | null;
  department?: string | null;
};

type InCallMessage = {
  id: string;
  conversationId: string;
  senderId: string;
  content: string | null;
  messageType?: string;
  createdAt: string;
  sender?: {
    id?: string;
    profile?: {
      displayName?: string | null;
      avatarUrl?: string | null;
    } | null;
  } | null;
};

type VideoCallModalProps = {
  conversationId?: string;
  roomName: string;
  conversationName: string;
  userName?: string;
  view: CallView;
  onMinimize: () => void;
  onExpand: () => void;
  onEnd: () => void;
};

type PipSurface = 'inline' | 'document';

export function VideoCallModal({
  conversationId,
  roomName,
  conversationName,
  userName,
  view,
  onMinimize,
  onExpand,
  onEnd,
}: VideoCallModalProps) {
  const jitsiContainerRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<any>(null);
  const pipShellRef = useRef<HTMLDivElement>(null);
  const portalHostRef = useRef<HTMLDivElement>(null);
  const dragOffsetRef = useRef({ x: 0, y: 0 });
  const [error, setError] = useState('');
  const [isReady, setIsReady] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [pipSurface, setPipSurface] = useState<PipSurface>('inline');
  const [duration, setDuration] = useState(0);

  const storeConversationId = useCallStore((state) => state.activeCall?.conversationId);
  const activeConversationId = conversationId || storeConversationId || '';

  // In-Call Chat State
  const [showInCallChat, setShowInCallChat] = useState(false);
  const [inCallMessages, setInCallMessages] = useState<InCallMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);
  const [unreadChatCount, setUnreadChatCount] = useState(0);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  const [showInviteModal, setShowInviteModal] = useState(false);
  const [people, setPeople] = useState<DirectoryPerson[]>([]);
  const [inviteSearch, setInviteSearch] = useState('');
  const [callCountByUser, setCallCountByUser] = useState<Record<string, number>>({});
  const [callingUserId, setCallingUserId] = useState<string | null>(null);
  const isPip = view === 'pip';

  const currentUserId = useMemo(() => {
    if (typeof window === 'undefined') return '';
    try {
      const stored = localStorage.getItem('veloce_user');
      return stored ? JSON.parse(stored).id || '' : '';
    } catch {
      return '';
    }
  }, []);

  // Fetch in-call chat history
  useEffect(() => {
    if (!activeConversationId) return;
    let isCurrent = true;

    chatsAPI
      .getHistory(activeConversationId, { limit: 50 })
      .then((data) => {
        if (!isCurrent) return;
        const msgs = (data?.messages || []) as InCallMessage[];
        setInCallMessages(msgs);
      })
      .catch(() => {});

    return () => {
      isCurrent = false;
    };
  }, [activeConversationId]);

  // Real-time live messaging in call
  useEffect(() => {
    if (!activeConversationId) return;
    const socketUrl = resolveServiceBaseUrl();
    const token = typeof window !== 'undefined' ? localStorage.getItem('veloce_token') : null;
    if (!token) return;

    const socket = socketUrl ? io(socketUrl, { auth: { token } }) : io({ auth: { token } });

    socket.emit('room.join', { conversationId: activeConversationId });

    socket.on('message.sent', (msg: InCallMessage) => {
      if (msg?.conversationId === activeConversationId) {
        setInCallMessages((prev) => {
          if (prev.some((m) => m.id === msg.id)) return prev;
          return [...prev, msg];
        });
        if (!showInCallChat && msg.senderId !== currentUserId) {
          setUnreadChatCount((count) => count + 1);
        }
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [activeConversationId, showInCallChat, currentUserId]);

  // Auto-scroll chat on new messages
  useEffect(() => {
    if (showInCallChat) {
      chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [inCallMessages, showInCallChat]);

  async function handleSendChatMessage(e?: React.FormEvent) {
    if (e) e.preventDefault();
    const text = chatInput.trim();
    if (!text || !activeConversationId || sendingMessage) return;

    setSendingMessage(true);
    setChatInput('');
    try {
      await messagesAPI.send({
        conversationId: activeConversationId,
        content: text,
      });
    } catch {
      setError('Could not send in-call chat message.');
    } finally {
      setSendingMessage(false);
    }
  }

  useEffect(() => {
    if (!showInviteModal) return;
    usersAPI
      .getDirectory()
      .then((data) => setPeople(Array.isArray(data) ? data : []))
      .catch(() => setPeople([]));
  }, [showInviteModal]);

  const filteredCandidates = useMemo(() => {
    const q = inviteSearch.trim().toLowerCase();
    return people.filter((p) => {
      if (!q) return true;
      return (
        p.displayName.toLowerCase().includes(q) ||
        (p.email || '').toLowerCase().includes(q)
      );
    });
  }, [people, inviteSearch]);

  async function handleCallUser(person: DirectoryPerson) {
    const signaling = useCallStore.getState().signaling;
    setCallingUserId(person.userId);
    try {
      // Ensure a direct conversation exists with this person before calling.
      const conversation = await chatsAPI.createDirect(person.userId);
      const conversationId = conversation.id || conversation.conversationId;
      signaling?.inviteToCall(conversationId, roomName, resolvedName, conversationName);
      setCallCountByUser((prev) => ({
        ...prev,
        [person.userId]: (prev[person.userId] || 0) + 1,
      }));
    } catch {
      setError('Could not call this person.');
    } finally {
      setCallingUserId(null);
    }
  }

  const pipPosition = useCallStore((state) => state.activeCall?.pipPosition);
  const setPipPosition = useCallStore((state) => state.setPipPosition);

  const onMinimizeRef = useRef(onMinimize);
  const onExpandRef = useRef(onExpand);
  const onEndRef = useRef(onEnd);
  const hasEndedRef = useRef(false);
  onMinimizeRef.current = onMinimize;
  onExpandRef.current = onExpand;
  onEndRef.current = onEnd;

  const resolvedName = (() => {
    if (userName) return userName;
    try {
      const stored = localStorage.getItem('veloce_user');
      if (stored) {
        const user = JSON.parse(stored);
        return user.displayName || user.name || user.email || 'Veloce User';
      }
    } catch {
      /* ignore */
    }
    return 'Veloce User';
  })();

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (isReady) {
      interval = setInterval(() => setDuration((d) => d + 1), 1000);
    }
    return () => clearInterval(interval);
  }, [isReady]);

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  useEffect(() => {
    return () => {
      restoreFromDocumentPip();
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    let retryTimer: ReturnType<typeof setTimeout>;

    const initJitsi = () => {
      if (!window.JitsiMeetExternalAPI || !jitsiContainerRef.current) {
        if (mounted) {
          retryTimer = setTimeout(initJitsi, 200);
        }
        return;
      }

      if (apiRef.current) {
        resizeJitsi();
        return;
      }

      try {
        const domain = 'meet.teamtime.live';
        const options = {
          roomName,
          width: '100%',
          height: '100%',
          parentNode: jitsiContainerRef.current,
          userInfo: {
            displayName: resolvedName,
          },
          configOverwrite: {
            prejoinPageEnabled: false,
            prejoinConfig: { enabled: false },
            startWithAudioMuted: false,
            startWithVideoMuted: false,
            disableInitialGUM: false,
            hideConferenceSubject: true,
            hideConferenceTimer: true,
            hideRecordingLabel: true,
            disableDeepLinking: true,
            enableEndConference: false,
            enableLeaveUserReason: false,
            toolbarButtons: [
              'microphone',
              'camera',
              'desktop',
              'fullscreen',
            ],
          },
          interfaceConfigOverwrite: {
            SHOW_JITSI_WATERMARK: false,
            SHOW_WATERMARK_FOR_GUESTS: false,
            SHOW_BRAND_WATERMARK: false,
            SHOW_POWERED_BY: false,
            DEFAULT_BACKGROUND: '#020617',
            TOOLBAR_ALWAYS_VISIBLE: true,
            TOOLBAR_BUTTONS: [
              'microphone',
              'camera',
              'desktop',
              'fullscreen',
            ],
            SETTINGS_SECTIONS: [],
          },
        };

        apiRef.current = new window.JitsiMeetExternalAPI(domain, options);
        apiRef.current.executeCommand('displayName', resolvedName);

        apiRef.current.addListener('videoConferenceJoined', () => {
          if (mounted) setIsReady(true);
        });

        apiRef.current.addListener('readyToClose', () => {
          if (hasEndedRef.current) return;
          hasEndedRef.current = true;
          onEndRef.current();
        });

        if (mounted) setIsReady(true);
      } catch (err) {
        console.error('Error initializing Jitsi', err);
        setError('Failed to load video call. Please check your connection to meet.teamtime.live.');
      }
    };

    retryTimer = setTimeout(initJitsi, 100);

    return () => {
      mounted = false;
      clearTimeout(retryTimer);
      if (apiRef.current) {
        apiRef.current.dispose();
        apiRef.current = null;
      }
      setIsReady(false);
    };
  }, [roomName, resolvedName]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && view === 'fullscreen') {
        onMinimizeRef.current();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [view]);

  useEffect(() => {
    if (!isPip) {
      restoreFromDocumentPip();
      setPipSurface('inline');
      return;
    }

    const shell = pipShellRef.current;
    const host = portalHostRef.current;
    if (!shell || !host) return;

    let cancelled = false;

    if (isDocumentPipSupported()) {
      void moveToDocumentPip(shell, host, {
        width: PIP_WIDTH,
        height: PIP_HEIGHT,
        onWindowClosed: () => {
          onExpandRef.current();
        },
      }).then((opened) => {
        if (!cancelled) {
          setPipSurface(opened ? 'document' : 'inline');
        }
      });
    } else {
      setPipSurface('inline');
    }

    return () => {
      cancelled = true;
    };
  }, [isPip]);

  function resizeJitsi() {
    const api = apiRef.current;
    if (!api) return;

    window.requestAnimationFrame(() => {
      const iframe = api.getIFrame?.();
      if (iframe) {
        iframe.style.width = '100%';
        iframe.style.height = '100%';
      }
    });
  }

  useEffect(() => {
    resizeJitsi();
  }, [view, pipSurface, showInCallChat]);

  useEffect(() => {
    if (!isPip || pipSurface !== 'inline' || !pipPosition) return;

    function handleResize() {
      const call = useCallStore.getState().activeCall;
      if (!call?.pipPosition) return;
      const clamped = clampPipPosition(call.pipPosition.x, call.pipPosition.y);
      if (clamped.x !== call.pipPosition.x || clamped.y !== call.pipPosition.y) {
        useCallStore.getState().setPipPosition(clamped.x, clamped.y);
      }
    }

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [isPip, pipSurface, pipPosition]);

  function handleExpand() {
    restoreFromDocumentPip();
    setPipSurface('inline');
    onExpand();
  }

  function handleEnd() {
    restoreFromDocumentPip();
    setPipSurface('inline');
    onEnd();
  }

  function handlePipPointerDown(event: ReactPointerEvent<HTMLElement>) {
    if (!isPip || pipSurface !== 'inline' || !pipPosition) return;
    if ((event.target as HTMLElement).closest('button')) return;

    const shell = pipShellRef.current;
    if (!shell) return;

    dragOffsetRef.current = {
      x: event.clientX - pipPosition.x,
      y: event.clientY - pipPosition.y,
    };

    setIsDragging(true);
    shell.setPointerCapture(event.pointerId);

    function handlePointerMove(moveEvent: PointerEvent) {
      const clamped = clampPipPosition(
        moveEvent.clientX - dragOffsetRef.current.x,
        moveEvent.clientY - dragOffsetRef.current.y,
      );
      setPipPosition(clamped.x, clamped.y);
    }

    const shellEl = shell;

    function endDrag(upEvent: PointerEvent) {
      setIsDragging(false);
      shellEl.releasePointerCapture(upEvent.pointerId);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', endDrag);
      window.removeEventListener('pointercancel', endDrag);
    }

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', endDrag);
    window.addEventListener('pointercancel', endDrag);
  }

  const outerPipClass =
    pipSurface === 'inline'
      ? 'fixed z-[110] overflow-hidden rounded-2xl border border-white/10 shadow-2xl'
      : 'w-full h-full overflow-hidden rounded-xl';

  const videoAreaClass = isPip ? 'absolute inset-0 bg-black' : 'relative flex-1 bg-black';

  const inlinePipStyle =
    isPip && pipSurface === 'inline' && pipPosition
      ? {
          left: pipPosition.x,
          top: pipPosition.y,
          width: PIP_WIDTH,
          height: PIP_HEIGHT,
        }
      : undefined;

  return (
    <Portal>
      {!isPip && (
        <div
          className="fixed inset-0 z-[120] bg-black/85 backdrop-blur-sm pointer-events-auto"
          aria-hidden="true"
        />
      )}

      <div
        ref={portalHostRef}
        className={
          !isPip
            ? 'fixed inset-0 z-[130] flex items-center justify-center p-4 pointer-events-none'
            : undefined
        }
      >
        <div
          role="dialog"
          aria-modal={!isPip}
          aria-label={`Video call — ${conversationName}`}
          ref={pipShellRef}
          {...(isPip ? { 'data-call-pip': '' } : {})}
          className={
            isPip
              ? outerPipClass
              : 'pointer-events-auto relative flex h-[90vh] w-[90vw] max-w-6xl flex-col overflow-hidden rounded-2xl bg-slate-950 shadow-2xl'
          }
          style={inlinePipStyle}
        >
          {/* ── PiP: overlay header floats above the video ── */}
          {isPip ? (
            <>
              {/* Video fills entire PiP shell */}
              <div className={videoAreaClass}>
                {error ? (
                  <div className="absolute inset-0 flex items-center justify-center p-3 text-center text-xs text-white bg-black">
                    {error}
                  </div>
                ) : (
                  <div ref={jitsiContainerRef} className="absolute inset-0" />
                )}
              </div>
            </>
          ) : (
            /* ── Fullscreen: edge-to-edge video with overlay in-call chat drawer ── */
            <div className="relative h-full w-full overflow-hidden bg-black">
              {/* Video container fills 100% of modal height stably */}
              <div className="absolute inset-0 bg-black">
                {error ? (
                  <div className="absolute inset-0 flex items-center justify-center p-4 text-center text-sm text-white">
                    {error}
                  </div>
                ) : (
                  <div ref={jitsiContainerRef} className="absolute inset-0" />
                )}
              </div>

              {/* Floating control bar in top-center of video area */}
              <div className="absolute top-4 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2.5 rounded-full bg-slate-900/70 backdrop-blur-xl border border-white/20 p-1.5 px-3.5 shadow-2xl ring-1 ring-white/10 select-none pointer-events-auto">
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setShowInviteModal(true);
                  }}
                  className="flex h-9 items-center gap-1.5 rounded-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white px-4 text-xs font-bold shadow-md shadow-blue-500/20 transition active:scale-95 cursor-pointer"
                  title="Add / Invite Member to Call"
                >
                  <UserPlus className="h-4 w-4" />
                  <span>Add Member</span>
                </button>

                <div className="h-4.5 w-[1px] bg-white/25" />

                {/* In-Call Chat Toggle Button */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setShowInCallChat((prev) => !prev);
                    setUnreadChatCount(0);
                  }}
                  className={`relative flex h-9 items-center gap-1.5 rounded-full px-3.5 text-xs font-bold transition active:scale-95 cursor-pointer pointer-events-auto ${
                    showInCallChat
                      ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
                      : 'bg-white/15 hover:bg-white/25 text-white'
                  }`}
                  title={showInCallChat ? 'Hide In-Call Chat' : 'Open In-Call Chat'}
                >
                  <MessageSquare className="h-4 w-4" />
                  <span>Chat</span>
                  {unreadChatCount > 0 && !showInCallChat && (
                    <span className="flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-emerald-500 px-1.5 text-[10px] font-extrabold text-white animate-pulse">
                      {unreadChatCount}
                    </span>
                  )}
                </button>

                <div className="h-4.5 w-[1px] bg-white/25" />

                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onMinimize();
                  }}
                  disabled={!isReady && !error}
                  className="flex h-9 w-9 items-center justify-center rounded-full text-white/85 hover:bg-white/20 hover:text-white disabled:opacity-40 transition-colors cursor-pointer"
                  title="Minimize to PiP"
                >
                  <Minimize2 className="h-4.5 w-4.5" />
                </button>

                <div className="h-4.5 w-[1px] bg-white/25" />

                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleEnd();
                  }}
                  className="flex h-9 items-center gap-1.5 rounded-full bg-red-600 hover:bg-red-700 text-white px-4 text-xs font-bold shadow-md shadow-red-600/20 transition active:scale-95 cursor-pointer"
                  title="End call"
                >
                  <PhoneOff className="h-4 w-4" />
                  <span>End Call</span>
                </button>
              </div>

              {/* Right: In-Call Chat Drawer Overlay */}
              {showInCallChat && (
                <aside className="absolute right-0 top-0 bottom-0 z-50 flex h-full w-80 md:w-96 flex-col border-l border-slate-800/80 bg-slate-950/98 backdrop-blur-2xl shadow-2xl pointer-events-auto">
                  {/* Chat Header */}
                  <header className="flex h-14 shrink-0 items-center justify-between border-b border-slate-800 px-4">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-600/20 text-blue-400">
                        <MessageSquare className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-xs font-bold text-white truncate">In-Call Chat</h3>
                        <p className="text-[10px] text-slate-400 truncate">{conversationName}</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setShowInCallChat(false);
                      }}
                      className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition cursor-pointer"
                      title="Close Chat"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </header>

                  {/* Chat Messages Body */}
                  <div className="flex-1 overflow-y-auto p-4 space-y-3">
                    {inCallMessages.length === 0 ? (
                      <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-slate-500">
                        <MessageSquare className="h-8 w-8 text-slate-600" />
                        <p className="text-xs font-medium">No messages yet in this call.</p>
                        <p className="text-[11px] text-slate-600">Messages sent here will stay archived in your chats.</p>
                      </div>
                    ) : (
                      inCallMessages.map((msg) => {
                        const isOwn = msg.senderId === currentUserId;
                        const isSystem = msg.messageType?.startsWith('SYSTEM_');
                        if (isSystem) {
                          return (
                            <div key={msg.id} className="my-1.5 flex justify-center">
                              <span className="rounded-full bg-slate-800/70 px-2.5 py-0.5 text-[10px] text-slate-400">
                                {msg.content}
                              </span>
                            </div>
                          );
                        }

                        const senderName = msg.sender?.profile?.displayName || 'Colleague';
                        const timeStr = new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

                        return (
                          <div
                            key={msg.id}
                            className={`flex flex-col ${isOwn ? 'items-end' : 'items-start'}`}
                          >
                            {!isOwn && (
                              <span className="mb-1 text-[10px] font-bold text-slate-400">
                                {senderName}
                              </span>
                            )}
                            <div
                              className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-xs break-words shadow-xs ${
                                isOwn
                                  ? 'bg-blue-600 text-white rounded-br-xs'
                                  : 'bg-slate-800 text-slate-100 rounded-bl-xs border border-slate-700/60'
                              }`}
                            >
                              {msg.content}
                            </div>
                            <span className="mt-0.5 text-[9px] text-slate-500">
                              {timeStr}
                            </span>
                          </div>
                        );
                      })
                    )}
                    <div ref={chatBottomRef} />
                  </div>

                  {/* Chat Input Footer */}
                  <form
                    onSubmit={handleSendChatMessage}
                    className="flex items-center gap-2 border-t border-slate-800 p-3 bg-slate-900/60"
                  >
                    <input
                      type="text"
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      placeholder="Type a message to call..."
                      className="h-9 flex-1 rounded-xl border border-slate-800 bg-slate-900 px-3.5 text-xs text-white placeholder-slate-500 outline-none focus:border-blue-500 focus:bg-slate-800 transition"
                    />
                    <button
                      type="submit"
                      disabled={!chatInput.trim() || sendingMessage}
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-40 transition active:scale-95 cursor-pointer shadow-sm shadow-blue-500/20"
                      title="Send Message"
                    >
                      <Send className="h-4 w-4" />
                    </button>
                  </form>
                </aside>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Invite / Add Member Modal Overlay */}
      {showInviteModal && (
        <Portal>
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <div
              className="absolute inset-0 bg-slate-950/60 backdrop-blur-md cursor-pointer"
              onClick={() => setShowInviteModal(false)}
            />
            <div className="relative z-10 flex w-full max-w-md flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl modal-card">
              <div className="mb-4 flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <UserPlus className="h-5 w-5 text-emerald-600" />
                  <h3 className="text-base font-bold text-slate-950">Add Member to Call</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setShowInviteModal(false)}
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
                  title="Close"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="relative mb-3">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="search"
                  value={inviteSearch}
                  onChange={(e) => setInviteSearch(e.target.value)}
                  placeholder="Search colleague to add to this call…"
                  className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-4 text-xs outline-none focus:border-emerald-500 focus:bg-white transition"
                />
              </div>

              <div className="max-h-64 overflow-y-auto space-y-1.5 p-1 rounded-xl border border-slate-100">
                {filteredCandidates.length === 0 ? (
                  <div className="p-4 text-center text-xs text-slate-400">No workspace members found.</div>
                ) : (
                  filteredCandidates.map((person) => {
                    const callCount = callCountByUser[person.userId] || 0;
                    const isCalling = callingUserId === person.userId;
                    return (
                      <div
                        key={person.userId}
                        className="flex items-center justify-between rounded-xl p-2.5 hover:bg-slate-50 transition"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold ${avatarAccent(person.displayName)}`}>
                            {initials(person.displayName)}
                          </div>
                          <div className="min-w-0">
                            <div className="truncate text-xs font-bold text-slate-900">{person.displayName}</div>
                            {person.email && <div className="truncate text-[10px] text-slate-400">{person.email}</div>}
                          </div>
                        </div>

                        <button
                          type="button"
                          disabled={isCalling}
                          onClick={() => handleCallUser(person)}
                          className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition shadow-xs cursor-pointer active:scale-95 ${
                            isCalling
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-300 opacity-80'
                              : callCount > 0
                              ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 hover:border-emerald-300'
                              : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                          }`}
                          title={callCount > 0 ? 'Ring colleague again' : 'Call colleague into this meeting'}
                        >
                          <PhoneCall className={`h-3.5 w-3.5 ${isCalling ? 'animate-pulse' : ''}`} />
                          <span>
                            {isCalling
                              ? 'Calling...'
                              : callCount > 0
                              ? `Call Again${callCount > 1 ? ` (${callCount})` : ''}`
                              : 'Call'}
                          </span>
                        </button>
                      </div>
                    );
                  })
                )}
              </div>

              <div className="mt-4 flex justify-end">
                <button
                  type="button"
                  onClick={() => setShowInviteModal(false)}
                  className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100 transition"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        </Portal>
      )}
    </Portal>
  );
}
