'use client';

import { useEffect, useRef, useState, useMemo, type PointerEvent as ReactPointerEvent } from 'react';
import { Maximize2, Minimize2, PhoneOff, UserPlus, Search, Check, X } from 'lucide-react';
import Portal from './Portal';
import { usersAPI, chatsAPI } from '../../services/api';
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

type VideoCallModalProps = {
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

  const [showInviteModal, setShowInviteModal] = useState(false);
  const [people, setPeople] = useState<DirectoryPerson[]>([]);
  const [inviteSearch, setInviteSearch] = useState('');
  const [invitedUserIds, setInvitedUserIds] = useState<string[]>([]);
  const isPip = view === 'pip';

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

  async function handleInviteUser(person: DirectoryPerson) {
    const signaling = useCallStore.getState().signaling;
    try {
      // Ensure a direct conversation exists with this person before inviting.
      const conversation = await chatsAPI.createDirect(person.userId);
      const conversationId = conversation.id || conversation.conversationId;
      signaling?.inviteToCall(conversationId, roomName, resolvedName, conversationName);
      setInvitedUserIds((prev) => [...prev, person.userId]);
    } catch {
      setError('Could not invite this person.');
    }
  }

  const pipPosition = useCallStore((state) => state.activeCall?.pipPosition);
  const setPipPosition = useCallStore((state) => state.setPipPosition);

  const onMinimizeRef = useRef(onMinimize);
  const onExpandRef = useRef(onExpand);
  const onEndRef = useRef(onEnd);
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
          onEndRef.current();
        });

        apiRef.current.addListener('videoConferenceLeft', () => {
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
  }, [view, pipSurface]);

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
          className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm"
          aria-hidden="true"
        />
      )}

      <div
        ref={portalHostRef}
        className={
          !isPip
            ? 'fixed inset-0 z-[100] flex items-center justify-center p-4 pointer-events-none'
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
            /* ── Fullscreen: edge-to-edge video with floating transparent header ── */
            <>
              {/* Video container fills 100% of modal height */}
              <div className="absolute inset-0 bg-black">
                {error ? (
                  <div className="absolute inset-0 flex items-center justify-center p-4 text-center text-sm text-white">
                    {error}
                  </div>
                ) : (
                  <div ref={jitsiContainerRef} className="absolute inset-0" />
                )}
              </div>

              {/* Floating control bar in top-center of video width */}
              <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2.5 rounded-full bg-slate-900/40 backdrop-blur-xl border border-white/30 p-1.5 px-3.5 shadow-[0_8px_32px_rgba(0,0,0,0.37)] ring-1 ring-white/15 select-none">
                <button
                  type="button"
                  onClick={() => setShowInviteModal(true)}
                  className="flex h-9 items-center gap-1.5 rounded-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white px-4 text-xs font-bold shadow-md shadow-blue-500/20 transition active:scale-95 cursor-pointer"
                  title="Add / Invite Member to Call"
                >
                  <UserPlus className="h-4 w-4" />
                  <span>Add Member</span>
                </button>

                <div className="h-4.5 w-[1px] bg-white/25" />

                <button
                  type="button"
                  onClick={onMinimize}
                  disabled={!isReady && !error}
                  className="flex h-9 w-9 items-center justify-center rounded-full text-white/85 hover:bg-white/20 hover:text-white disabled:opacity-40 transition-colors"
                  title="Minimize to PiP"
                >
                  <Minimize2 className="h-4.5 w-4.5" />
                </button>

                <div className="h-4.5 w-[1px] bg-white/25" />

                <button
                  type="button"
                  onClick={handleEnd}
                  className="flex h-9 items-center gap-1.5 rounded-full bg-red-600 hover:bg-red-700 text-white px-4 text-xs font-bold shadow-md shadow-red-600/20 transition active:scale-95 cursor-pointer"
                  title="End call"
                >
                  <PhoneOff className="h-4 w-4" />
                  <span>End Call</span>
                </button>
              </div>
            </>
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
                    const isInvited = invitedUserIds.includes(person.userId);
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
                          disabled={isInvited}
                          onClick={() => handleInviteUser(person)}
                          className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition shadow-xs ${
                            isInvited
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-emerald-600 hover:bg-emerald-700 text-white active:scale-95'
                          }`}
                        >
                          {isInvited ? (
                            <>
                              <Check className="h-3.5 w-3.5" />
                              <span>Invited</span>
                            </>
                          ) : (
                            <>
                              <UserPlus className="h-3.5 w-3.5" />
                              <span>Invite</span>
                            </>
                          )}
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
