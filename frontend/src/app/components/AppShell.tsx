'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  AppWindow,
  Bell,
  CalendarDays,
  Files,
  Home as HomeIcon,
  KeyRound,
  LogOut,
  Megaphone,
  MessageSquare,
  Settings,
  UserCircle2,
  Users,
  ChevronDown,
  Menu,
  Search,
  Plus,
  Check,
  Camera,
  PhoneCall,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
import { ChangeEvent, FormEvent, useState, useEffect, useRef, type ReactNode } from 'react';
import { usersAPI, notificationsAPI, authAPI, messagesAPI, filesAPI, type MessageSearchHit } from '../../services/api';
import { toPlainText } from '../../lib/mentions';
import { useChatStore } from '../../store/useChatStore';
import { useNotifications } from '../../hooks/useNotifications';
import { io } from 'socket.io-client';
import Portal from './Portal';
import ChangePasswordModal from './ChangePasswordModal';
import { VideoCallModal } from './VideoCallModal';
import { IncomingCallScreen } from './IncomingCallScreen';
import { OutgoingCallScreen } from './OutgoingCallScreen';
import { useCallSignaling } from '../../hooks/useCallSignaling';
import { useCallStore } from '../../store/useCallStore';
import {
  AVAILABILITY_PICKER_OPTIONS,
  statusDotClass,
  statusLabel,
} from '../../lib/statusAvailability';
import {
  navKeyAllowed,
  type StoredCapabilities,
} from '../../lib/permissions';
import {
  ensureDesktopConfig,
  resolveServiceBaseUrl,
  sendDesktopNotification,
} from '../../lib/desktopRuntime';
import { useBrowserPush } from '../../hooks/useBrowserPush';
import { unregisterBrowserPush } from '../../lib/push';

const navItems = [
  { label: 'Home', icon: HomeIcon, href: '/home', navKey: 'home', color: '#0284c7', activeBg: 'rgba(2, 132, 199, 0.12)' },
  { label: 'Teams', icon: Users, href: '/teams', navKey: 'teams', color: '#7c3aed', activeBg: 'rgba(124, 58, 237, 0.12)' },
  { label: 'Chat', icon: MessageSquare, href: '/dms', navKey: 'dms', color: '#059669', activeBg: 'rgba(5, 150, 105, 0.12)' },
  { label: 'Calls', icon: PhoneCall, href: '/calls', navKey: 'calls', color: '#10b981', activeBg: 'rgba(16, 185, 129, 0.12)' },
  { label: 'Activity', icon: Bell, href: '/activity', navKey: 'activity', color: '#d97706', activeBg: 'rgba(217, 119, 6, 0.12)' },
  { label: 'Announcements', icon: Megaphone, href: '/announcements', navKey: 'announcements', color: '#e11d48', activeBg: 'rgba(225, 29, 72, 0.12)' },
  { label: 'Calendar', icon: CalendarDays, href: '/calendar', navKey: 'calendar', color: '#4f46e5', activeBg: 'rgba(79, 70, 229, 0.12)' },
  { label: 'Files', icon: Files, href: '/files', navKey: 'files', color: '#2563eb', activeBg: 'rgba(37, 99, 235, 0.12)' },
  { label: 'People', icon: Users, href: '/people', navKey: 'people', color: '#db2777', activeBg: 'rgba(219, 39, 119, 0.12)' },
  { label: 'Apps', icon: AppWindow, href: '/apps', navKey: 'apps', color: '#0891b2', activeBg: 'rgba(8, 145, 178, 0.12)' },
  { label: 'Settings', icon: Settings, href: '/settings', navKey: 'settings', color: '#4b5563', activeBg: 'rgba(75, 85, 99, 0.12)' },
];

type StoredUser = {
  id?: string;
  displayName?: string;
  workspaceName?: string | null;
  workspaceRole?: string | null;
  isAdmin?: boolean;
  aboutText?: string | null;
  avatarUrl?: string | null;
  /** Declared override only; live presence comes from the socket. */
  availability?: string | null;
  allowedNavKeys?: string[] | null;
  capabilities?: StoredCapabilities | null;
  canPostAnnouncements?: boolean;
};

function Avatar({
  initials,
  accent,
  size = 'md',
}: {
  initials: string;
  accent: string;
  size?: 'sm' | 'md' | 'lg';
}) {
  const sizeClass =
    size === 'sm' ? 'h-6 w-6 text-[10px]' : size === 'lg' ? 'h-11 w-11 text-sm' : 'h-9 w-9 text-xs';
  return (
    <div className={`${sizeClass} relative flex shrink-0 items-center justify-center rounded-full font-semibold ${accent}`}>
      {initials}
    </div>
  );
}

function initialsFor(name?: string | null) {
  return (name?.trim() || 'U')
    .split(/\s+/)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<StoredUser | null>(null);

  const [headerSearch, setHeaderSearch] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [searching, setSearching] = useState(false);
  const [searchMessages, setSearchMessages] = useState<MessageSearchHit[]>([]);
  const [searchPeople, setSearchPeople] = useState<
    { userId: string; displayName: string; email?: string | null }[]
  >([]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('veloce_user');
      if (stored) setUser(JSON.parse(stored));
    } catch {
      // ignore
    }
    const onUserUpdated = () => {
      try {
        const stored = localStorage.getItem('veloce_user');
        if (stored) setUser(JSON.parse(stored));
      } catch {
        /* ignore */
      }
    };
    window.addEventListener('storage', onUserUpdated);
    return () => window.removeEventListener('storage', onUserUpdated);
  }, []);
  const [showProfileEditor, setShowProfileEditor] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [displayNameInput, setDisplayNameInput] = useState('');
  const [aboutTextInput, setAboutTextInput] = useState('');
  /** URL sent to the backend on Save (server URL after upload, or existing URL). */
  const [avatarUrlInput, setAvatarUrlInput] = useState('');
  /** Data URL used only for local preview — never sent to backend. */
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [profileSuccess, setProfileSuccess] = useState('');
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const avatarFileInputRef = useRef<HTMLInputElement>(null);

  function handleAvatarFileUpload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      setProfileError('Image size should be under 10MB.');
      return;
    }
    setProfileError('');
    setProfileSuccess('');
    setUploadingAvatar(true);

    // 1. Instant client-side preview via data URL (always works, no network needed)
    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      if (dataUrl) {
        setAvatarPreviewUrl(dataUrl); // show immediately
      }
    };
    reader.readAsDataURL(file);

    // 2. Upload binary via FormData — on success, store the server URL for saving
    filesAPI.upload(file)
      .then((uploaded) => {
        const fileId = uploaded.file?.id || uploaded.id;
        if (fileId) {
          // Store server URL for profile save — preview stays as data URL
          setAvatarUrlInput(`/api/v1/files/${fileId}/view`);
          setProfileSuccess('Photo uploaded! Click Save to apply.');
        } else {
          setProfileError('Upload succeeded but no file ID returned.');
        }
      })
      .catch((err: any) => {
        console.error('Failed to upload profile picture via FormData:', err);
        const errorMsg = err?.response?.data?.message || err?.message || 'Failed to upload image.';
        setProfileError(Array.isArray(errorMsg) ? errorMsg.join(', ') : String(errorMsg));
        setAvatarPreviewUrl(''); // clear preview only on error
      })
      .finally(() => {
        setUploadingAvatar(false);
        if (e.target) e.target.value = '';
      });
  }
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const [showNewDropdown, setShowNewDropdown] = useState(false);
  const [showStatusDropdown, setShowStatusDropdown] = useState(false);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [socketConnected, setSocketConnected] = useState(false);
  /** Off-canvas nav state; only meaningful below the lg breakpoint. */
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('teamtime_sidebar_collapsed');
      if (stored === 'true') setSidebarCollapsed(true);
    } catch {
      // ignore
    }
  }, []);

  const toggleSidebarCollapse = () => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('teamtime_sidebar_collapsed', String(next));
      } catch {
        // ignore
      }
      return next;
    });
  };
  const [showDisconnectedBanner, setShowDisconnectedBanner] = useState(false);
  const hasConnectedRef = useRef(false);

  useEffect(() => {
    void ensureDesktopConfig();
  }, []);

  useBrowserPush(Boolean(user?.id));

  const activeCall = useCallStore((state) => state.activeCall);
  const outgoingCall = useCallStore((state) => state.outgoingCall);
  const callNotice = useCallStore((state) => state.callNotice);
  const minimizeCall = useCallStore((state) => state.minimizeCall);
  const expandCall = useCallStore((state) => state.expandCall);
  const signalEndCall = useCallStore((state) => state.signalEndCall);
  const cancelOutgoingCall = useCallStore((state) => state.cancelOutgoingCall);
  const acceptIncomingCall = useCallStore((state) => state.acceptIncomingCall);
  const registerSignaling = useCallStore((state) => state.registerSignaling);
  const declineCallFromStore = useCallStore((state) => state.declineCall);

  const { incomingCall, inviteToCall, acceptCall, declineCall, endCall, cancelCall, joinCall } = useCallSignaling();

  useEffect(() => {
    registerSignaling({ inviteToCall, acceptCall, declineCall, endCall, cancelCall, joinCall });
  }, [registerSignaling, inviteToCall, acceptCall, declineCall, endCall, cancelCall, joinCall]);

  // Track active-call state for the Electron main process so it can warn on close.
  useEffect(() => {
    if (typeof window !== 'undefined') {
      (window as any).__commInCall = !!activeCall;
    }
  }, [activeCall]);

  // Listen for desktop "force end call" IPC and end the call gracefully.
  useEffect(() => {
    if (typeof window !== 'undefined' && window.electronAPI?.onForceEndCall) {
      window.electronAPI.onForceEndCall(() => {
        signalEndCall();
      });
    }
  }, [signalEndCall]);

  /**
   * Only warn about a connection that was working and then dropped. Showing it
   * before the first connect would nag on every cold load, and a 2s grace
   * period keeps a fast reconnect from flashing the bar.
   */
  useEffect(() => {
    if (socketConnected) {
      hasConnectedRef.current = true;
      setShowDisconnectedBanner(false);
      return;
    }
    if (!hasConnectedRef.current) return;

    const timer = window.setTimeout(() => setShowDisconnectedBanner(true), 2000);
    return () => window.clearTimeout(timer);
  }, [socketConnected]);

  /** Own status: live socket for presence, stored value for the override. */
  const selfStatus = {
    presence: socketConnected ? ('ONLINE' as const) : ('OFFLINE' as const),
    availability: user?.availability ?? null,
  };

  useEffect(() => {
    let isMounted = true;
    notificationsAPI.getAll(1, 1).then((data) => {
      if (isMounted && data) {
        setUnreadNotifications(data.unreadCount || 0);
      }
    }).catch(() => {});
    return () => { isMounted = false; };
  }, [pathname]);

  // ── Global socket listener for browser notifications ──────────────────────
  const { notify } = useNotifications();

  useEffect(() => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('veloce_token') : null;
    if (!token) return;

    let currentUserId = '';
    try {
      const stored = localStorage.getItem('veloce_user');
      if (stored) currentUserId = JSON.parse(stored)?.id || '';
    } catch { /* ignore */ }

    const socketUrl = resolveServiceBaseUrl();

    const socket = socketUrl ? io(socketUrl, { auth: { token } }) : io({ auth: { token } });

    // Own presence is simply whether this socket is up. It is never stored,
    // and there is no way to set it by hand.
    socket.on('connect', () => setSocketConnected(true));
    socket.on('disconnect', () => setSocketConnected(false));

    socket.on('message.notify', (payload: {
      conversationType: string;
      message: {
        id: string;
        conversationId: string;
        senderId?: string;
        content?: string | null;
        sender?: { profile?: { displayName?: string | null } | null } | null;
      };
    }) => {
      const message = payload.message;
      if (!message?.conversationId) return;
      // Don't notify for own messages
      if (message.senderId === currentUserId) return;

      const senderName = message.sender?.profile?.displayName || 'Someone';
      const preview = message.content
        ? message.content.slice(0, 80) + (message.content.length > 80 ? '…' : '')
        : '📎 Sent an attachment';

      const convo = payload.conversationType;
      const href =
        convo === 'DIRECT'
          ? `/dms?conversation=${message.conversationId}`
          : `/teams?conversation=${message.conversationId}`;

      notify({
        title: `New message from ${senderName}`,
        body: preview,
        tag: `msg-${message.conversationId}`, // groups notifications per conversation
        onClick: () => {
          window.location.href = href;
        },
      });

      sendDesktopNotification(`New message from ${senderName}`, { body: preview });

      // Also bump the unread count badge
      setUnreadNotifications((n) => n + 1);
    });

    socket.on('event.created', (event: {
      id: string;
      title: string;
      startsAt: string;
      meetingLink?: string | null;
      creatorName: string;
    }) => {
      notify({
        title: `New Event: ${event.title}`,
        body: `Invited by ${event.creatorName}. Starts on ${new Date(event.startsAt).toLocaleString()}`,
        tag: `event-${event.id}`,
        tone: 'event',
        onClick: () => {
          window.location.href = `/calendar`;
        },
      });
      sendDesktopNotification(`New Event: ${event.title}`, {
        body: `Invited by ${event.creatorName}`,
      });
      setUnreadNotifications((n) => n + 1);
    });

    socket.on('event.reminder', (event: {
      id: string;
      title: string;
      startsAt: string;
      meetingLink?: string | null;
    }) => {
      notify({
        title: `Event Starting Soon: ${event.title}`,
        body: `Starts at ${new Date(event.startsAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.${event.meetingLink ? ' Click to join meeting.' : ''}`,
        tag: `reminder-${event.id}`,
        tone: 'event',
        onClick: () => {
          if (event.meetingLink) {
            window.open(event.meetingLink, '_blank');
          } else {
            window.location.href = `/calendar`;
          }
        },
      });
      sendDesktopNotification(`Event Starting Soon: ${event.title}`, {
        body: `Starts at ${new Date(event.startsAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
      });
      setUnreadNotifications((n) => n + 1);
    });

    return () => {
      socket.disconnect();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notify]);

  function triggerCreateChannel() {
    if (pathname === '/teams') {
      window.dispatchEvent(new CustomEvent('open-create-channel'));
    } else {
      sessionStorage.setItem('open-create-channel', 'true');
      router.push('/teams');
    }
  }

  function triggerCreateDM() {
    if (pathname === '/dms') {
      window.dispatchEvent(new CustomEvent('open-create-dm'));
    } else {
      sessionStorage.setItem('open-create-dm', 'true');
      router.push('/dms');
    }
  }

  async function handleLogout() {
    await unregisterBrowserPush();
    const sessionId = localStorage.getItem('veloce_session');
    const refreshToken = localStorage.getItem('veloce_refresh');
    try {
      if (sessionId && refreshToken) {
        await authAPI.logout({ sessionId, refreshToken });
      }
    } catch {
      /* still sign out locally */
    }
    useChatStore.getState().logout();
    router.replace('/login');
  }

  function handleEditProfile() {
    if (user) {
      setDisplayNameInput(user.displayName || '');
      setAboutTextInput(user.aboutText || '');
      setAvatarUrlInput(user.avatarUrl || '');
      setAvatarPreviewUrl(''); // reset preview; existing avatar shows via avatarUrlInput
      setProfileError('');
      setProfileSuccess('');
    }
    setShowProfileEditor(true);
  }

  /** Sets or clears the declared override. Presence is not settable. */
  async function handleUpdateStatus(availability: string) {
    try {
      await usersAPI.updateProfile({ statusAvailability: availability });
      const nextUser = { ...user, availability: availability || null };
      localStorage.setItem('veloce_user', JSON.stringify(nextUser));
      setUser(nextUser);
      setShowStatusDropdown(false);

      if (window.electronAPI?.setTrayStatus) {
        const trayStatus =
          availability === 'DND' || availability === 'BUSY'
            ? 'dnd'
            : availability === 'AWAY'
              ? 'away'
              : 'online';
        window.electronAPI.setTrayStatus(trayStatus);
      }
    } catch (err) {
      console.error('Failed to update status', err);
    }
  }

  async function saveProfile(event: FormEvent) {
    event.preventDefault();
    setSavingProfile(true);
    setProfileError('');
    setProfileSuccess('');
    try {
      const updated = await usersAPI.updateProfile({
        displayName: displayNameInput.trim(),
        aboutText: aboutTextInput.trim(),
        avatarUrl: avatarUrlInput.trim() || null,
      });

      const nextUser = {
        ...user,
        displayName: updated.displayName || displayNameInput.trim(),
        aboutText: updated.aboutText ?? aboutTextInput.trim(),
        avatarUrl: updated.avatarUrl ?? (avatarUrlInput.trim() || null),
      };
      localStorage.setItem('veloce_user', JSON.stringify(nextUser));
      setUser(nextUser);
      setProfileSuccess('Profile updated successfully!');
      setTimeout(() => {
        setShowProfileEditor(false);
        setProfileSuccess('');
      }, 700);
    } catch (err: any) {
      console.error('Failed to save profile:', err);
      const errorMsg = err?.response?.data?.message || err?.message || 'Profile could not be updated.';
      setProfileError(Array.isArray(errorMsg) ? errorMsg.join(', ') : String(errorMsg));
    } finally {
      setSavingProfile(false);
    }
  }

  // Debounced global search. Fires only once the query is worth a round trip,
  // and a stale flag drops out-of-order responses from earlier keystrokes.
  useEffect(() => {
    const term = headerSearch.trim();
    if (term.length < 2) {
      setSearchMessages([]);
      setSearchPeople([]);
      setSearching(false);
      return;
    }

    let stale = false;
    setSearching(true);
    const timer = window.setTimeout(async () => {
      try {
        const [messageResult, directory] = await Promise.all([
          messagesAPI.search(term, { limit: 6 }),
          usersAPI.getDirectory().catch(() => []),
        ]);
        if (stale) return;
        setSearchMessages(messageResult.messages ?? []);
        const lower = term.toLowerCase();
        setSearchPeople(
          (Array.isArray(directory) ? directory : [])
            .filter(
              (person: { displayName?: string; email?: string | null }) =>
                (person.displayName || '').toLowerCase().includes(lower) ||
                (person.email || '').toLowerCase().includes(lower),
            )
            .slice(0, 4),
        );
      } catch {
        if (!stale) {
          setSearchMessages([]);
          setSearchPeople([]);
        }
      } finally {
        if (!stale) setSearching(false);
      }
    }, 250);

    return () => {
      stale = true;
      window.clearTimeout(timer);
    };
  }, [headerSearch]);

  // Cmd/Ctrl+K focuses search — the header already advertises this shortcut.
  // Escape closes the mobile drawer.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
        setShowSearchResults(true);
      }
      if (event.key === 'Escape') setMobileNavOpen(false);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // A drawer left open across a route change would cover the new page.
  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  const visibleNavItems = navItems.filter((item) => navKeyAllowed(item.navKey, user));

  const displayName = user?.displayName || 'User';
  const initials = initialsFor(displayName);

  const getPageTitle = (path: string) => {
    const matched = navItems.find((item) => path.startsWith(item.href));
    return matched ? matched.label : 'Home';
  };

  return (
    <div className="app-shell app-shell-surface relative isolate flex h-full min-h-0 flex-col overflow-hidden text-slate-950">
      <div className="relative flex min-h-0 flex-1 overflow-hidden">
      {/* Lets keyboard users jump past ten nav links on every page. Visible
          only while focused. */}
      <a
        href="#app-main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-blue-700 focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white"
      >
        Skip to content
      </a>
      <div className="app-shell-gradient" />
      <div className="app-shell-glow" />
      <div className="app-shell-glow-calm" />
      <div className="app-shell-glow-rain" />
      <div className="app-shell-glow-violet" />
      <div className="app-shell-glow-bottom" />
      <div className="app-shell-noise" />

      {/* Scrim closes the drawer on small screens; absent from lg upward. */}
      {mobileNavOpen && (
        <div
          className="fixed inset-0 z-30 bg-slate-900/40 lg:hidden"
          aria-hidden="true"
          onClick={() => setMobileNavOpen(false)}
        />
      )}

      <aside
        id="app-sidebar"
        aria-label="Main navigation"
        className={`app-shell-sidebar shrink-0 flex-col bg-white border-r border-slate-200/80 text-slate-800 shadow-[1px_0_10px_rgba(0,0,0,0.01)] backdrop-blur-md transition-all duration-300 ease-in-out lg:static lg:z-20 lg:flex ${
          sidebarCollapsed ? 'lg:w-[70px]' : 'lg:w-[240px]'
        } ${
          mobileNavOpen
            ? 'fixed inset-y-0 left-0 z-40 flex w-[240px]'
            : 'hidden'
        }`}
      >
        {/* Sidebar Header with Logo and Minimize Button */}
        <div className={`flex h-16 items-center border-b border-slate-100/80 ${sidebarCollapsed ? 'justify-center px-2' : 'justify-between px-4'}`}>
          <Link
            href="/home"
            className="flex max-w-full shrink-0 items-center rounded-lg outline-none ring-blue-500/40 focus-visible:ring-2 overflow-hidden"
            aria-label="TeamTime home"
            title="TeamTime Home"
          >
            {sidebarCollapsed ? (
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50">
                <img
                  src="/teamtime.png"
                  alt="TeamTime"
                  width={36}
                  height={36}
                  className="h-7 w-7 object-contain"
                />
              </div>
            ) : (
              <img
                src="/teamtime.png"
                alt="TeamTime"
                width={200}
                height={48}
                className="h-11 w-auto max-w-[165px] object-contain object-left"
              />
            )}
          </Link>

          {!sidebarCollapsed && (
            <button
              onClick={toggleSidebarCollapse}
              className="hidden lg:flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
              title="Minimize sidebar"
            >
              <PanelLeftClose className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Navigation Items */}
        <nav className={`flex-1 space-y-1 py-4 overflow-y-auto ${sidebarCollapsed ? 'px-2' : 'px-3'}`}>
          {visibleNavItems.map((item) => {
            const Icon = item.icon;
            const active = pathname.startsWith(item.href);
            return (
              <Link
                key={item.label}
                href={item.href}
                id={`nav-${item.label.toLowerCase()}`}
                aria-current={active ? 'page' : undefined}
                title={sidebarCollapsed ? item.label : undefined}
                className={`relative flex items-center rounded-xl text-sm font-medium transition-all duration-200 group ${
                  sidebarCollapsed
                    ? 'justify-center h-10 w-full px-0'
                    : 'gap-3 px-3 py-2 w-full'
                } ${
                  active
                    ? 'bg-blue-50 text-blue-600 font-semibold'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                {/* Active Indicator Bar on Left */}
                {active && (
                  <div
                    className={`absolute top-1/2 -translate-y-1/2 w-[3px] h-7 rounded-r bg-blue-600 ${
                      sidebarCollapsed ? 'left-[-8px]' : 'left-[-12px]'
                    }`}
                  />
                )}
                
                <Icon className={`transition-colors duration-200 ${sidebarCollapsed ? 'h-5 w-5' : 'h-4 w-4'} ${active ? 'text-blue-600' : 'text-slate-400 group-hover:text-slate-500'}`} />
                {!sidebarCollapsed && <span className="select-none truncate">{item.label}</span>}
              </Link>
            );
          })}
        </nav>

        {/* Sidebar Minimize/Expand Toggle at Bottom of Nav */}
        <div className="px-2 pb-2">
          <button
            onClick={toggleSidebarCollapse}
            className={`hidden lg:flex w-full items-center rounded-xl py-2 text-xs font-semibold text-slate-500 hover:bg-slate-100 hover:text-slate-900 transition ${
              sidebarCollapsed ? 'justify-center px-0' : 'justify-between px-3'
            }`}
            title={sidebarCollapsed ? 'Expand sidebar' : 'Minimize sidebar'}
          >
            {sidebarCollapsed ? (
              <PanelLeftOpen className="h-4 w-4 text-slate-600" />
            ) : (
              <>
                <span className="truncate">Collapse sidebar</span>
                <PanelLeftClose className="h-4 w-4 text-slate-400" />
              </>
            )}
          </button>
        </div>

        {/* User Profile & Status Footer */}
        <div className="relative mt-auto">
          <div 
            onClick={() => setShowStatusDropdown(!showStatusDropdown)}
            className={`border-t border-slate-100/80 flex items-center cursor-pointer hover:bg-slate-50 active:scale-[0.98] transition-all duration-200 group ${
              sidebarCollapsed ? 'justify-center p-3' : 'justify-between p-4'
            }`}
            title={sidebarCollapsed ? `${displayName} (${statusLabel(selfStatus)})` : 'Set status'}
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="relative shrink-0">
                {user?.avatarUrl ? (
                  <img src={user.avatarUrl} alt={displayName} className="h-9 w-9 rounded-full object-cover shadow-xs border border-slate-200" />
                ) : (
                  <Avatar initials={initials || 'U'} accent="bg-orange-500 text-white shadow-sm" size="md" />
                )}
                {/* Status Dot badge on avatar */}
                <span
                  className="absolute -bottom-0.5 -right-0.5 rounded-full border-2 border-white shadow-xs"
                  style={{
                    width: '11px',
                    height: '11px',
                    minWidth: '11px',
                    minHeight: '11px',
                    backgroundColor:
                      selfStatus.availability === 'AWAY'
                        ? '#f59e0b'
                        : selfStatus.availability === 'DND'
                        ? '#ef4444'
                        : selfStatus.availability === 'OUT_OF_OFFICE'
                        ? '#a855f7'
                        : selfStatus.presence === 'ONLINE'
                        ? '#10b981'
                        : '#94a3b8',
                  }}
                />
              </div>
              {!sidebarCollapsed && (
                <div className="min-w-0">
                  <div className="text-sm font-bold text-slate-800 truncate leading-tight group-hover:text-slate-950">{displayName}</div>
                  <div className="text-[11px] text-slate-500 font-medium leading-tight flex items-center gap-1.5 mt-0.5">
                    <span
                      className="rounded-full shrink-0"
                      style={{
                        width: '8px',
                        height: '8px',
                        minWidth: '8px',
                        minHeight: '8px',
                        backgroundColor:
                          selfStatus.availability === 'AWAY'
                            ? '#f59e0b'
                            : selfStatus.availability === 'DND'
                            ? '#ef4444'
                            : selfStatus.availability === 'OUT_OF_OFFICE'
                            ? '#a855f7'
                            : selfStatus.presence === 'ONLINE'
                            ? '#10b981'
                            : '#94a3b8',
                      }}
                    />
                    <span className="truncate">{statusLabel(selfStatus)}</span>
                  </div>
                </div>
              )}
            </div>
            {!sidebarCollapsed && (
              <ChevronDown className="h-4 w-4 text-slate-400 group-hover:text-slate-600 transition-colors shrink-0" />
            )}
          </div>

          {showStatusDropdown && (
            <>
              <div 
                className="fixed inset-0 z-40" 
                onClick={(e) => { e.stopPropagation(); setShowStatusDropdown(false); }}
              />
              <div className={`absolute bottom-[72px] ${sidebarCollapsed ? 'left-16 w-60' : 'left-4 w-60'} rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl ring-1 ring-black/5 focus:outline-none z-50 dropdown-card`}>
                <div className="px-3 py-2 text-xs border-b border-slate-100 mb-1">
                  <div className="font-bold text-slate-800 text-xs">Set Status</div>
                  <div className="mt-0.5 text-[11px] font-normal text-slate-500">
                    Online and offline follow your connection.
                  </div>
                </div>
                <div className="space-y-0.5 py-0.5">
                  {AVAILABILITY_PICKER_OPTIONS.map((s) => {
                    const solidColor =
                      s.value === 'AWAY'
                        ? '#f59e0b'
                        : s.value === 'DND'
                        ? '#ef4444'
                        : s.value === 'OUT_OF_OFFICE'
                        ? '#a855f7'
                        : '#10b981';
                    const glowColor =
                      s.value === 'AWAY'
                        ? 'rgba(245, 158, 11, 0.25)'
                        : s.value === 'DND'
                        ? 'rgba(239, 68, 68, 0.25)'
                        : s.value === 'OUT_OF_OFFICE'
                        ? 'rgba(168, 85, 247, 0.25)'
                        : 'rgba(16, 185, 129, 0.25)';
                    const isSelected = (user?.availability ?? '') === s.value;
                    return (
                      <button
                        key={s.value || 'none'}
                        onClick={(e) => { e.stopPropagation(); handleUpdateStatus(s.value); }}
                        className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-xs font-semibold transition cursor-pointer ${
                          isSelected ? 'bg-slate-100 text-slate-900 font-bold' : 'text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <span
                          className="shrink-0 rounded-full"
                          style={{
                            width: '10px',
                            height: '10px',
                            minWidth: '10px',
                            minHeight: '10px',
                            backgroundColor: solidColor,
                            boxShadow: `0 0 0 2px ${glowColor}`,
                          }}
                        />
                        <span className="text-xs font-medium text-slate-800">{s.label}</span>
                        {isSelected && <Check className="h-4 w-4 ml-auto text-blue-600 shrink-0" />}
                      </button>
                    );
                  })}
                </div>
                <div className="border-t border-slate-100 my-1"></div>
                <button
                  onClick={(e) => { e.stopPropagation(); setShowStatusDropdown(false); handleEditProfile(); }}
                  className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-xs text-slate-700 hover:bg-slate-50 transition cursor-pointer"
                >
                  <UserCircle2 className="h-4 w-4 text-slate-400" />
                  <span>Edit Profile</span>
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); setShowStatusDropdown(false); setShowPasswordModal(true); }}
                  className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-xs text-slate-700 hover:bg-slate-50 transition cursor-pointer"
                >
                  <KeyRound className="h-4 w-4 text-slate-400" />
                  <span>Change password</span>
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); setShowStatusDropdown(false); handleLogout(); }}
                  className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-xs text-red-600 hover:bg-red-50 transition cursor-pointer"
                >
                  <LogOut className="h-4 w-4 text-red-400" />
                  <span>Logout</span>
                </button>
              </div>
            </>
          )}
        </div>
      </aside>

      <div className="app-shell-body flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="app-shell-header relative z-20 flex h-14 shrink-0 items-center justify-between gap-2 border-b border-slate-200/50 bg-white/80 px-3 backdrop-blur-md lg:h-20 lg:gap-0 lg:px-8">
          {/* Left section: menu toggle (desktop & mobile) + title */}
          <div className="flex min-w-0 items-center gap-2">
            <button
              type="button"
              onClick={() => {
                if (typeof window !== 'undefined' && window.innerWidth >= 1024) {
                  toggleSidebarCollapse();
                } else {
                  setMobileNavOpen((open) => !open);
                }
              }}
              aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Minimize sidebar'}
              aria-expanded={!sidebarCollapsed}
              aria-controls="app-sidebar"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-slate-600 hover:text-slate-900 transition hover:bg-slate-100"
              title={sidebarCollapsed ? 'Expand sidebar' : 'Minimize sidebar'}
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="flex min-w-0 flex-col justify-center">
              <h1 className="truncate text-base font-bold leading-tight tracking-tight text-slate-900 lg:text-xl">
                {getPageTitle(pathname)}
              </h1>
              <div className="mt-0.5 hidden text-[11px] font-medium text-slate-400 sm:block">
                {user?.workspaceName?.trim()
                  ? `${user.workspaceName} workspace`
                  : 'Workspace'}
              </div>
            </div>
          </div>

          {/* Center section: Search Bar — hidden on the narrowest screens */}
          <div className="relative mx-4 hidden w-full max-w-[480px] md:block">
            <div className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center">
              <Search className="h-4 w-4 text-slate-400" />
            </div>
            <input
              ref={searchInputRef}
              type="text"
              role="combobox"
              aria-expanded={showSearchResults}
              aria-controls="global-search-results"
              aria-label="Search messages and people"
              value={headerSearch}
              onChange={(e) => {
                setHeaderSearch(e.target.value);
                setShowSearchResults(true);
              }}
              onFocus={() => setShowSearchResults(true)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  setShowSearchResults(false);
                  e.currentTarget.blur();
                }
                if (e.key === 'Enter' && headerSearch.trim()) {
                  router.push(`/people?q=${encodeURIComponent(headerSearch.trim())}`);
                  setShowSearchResults(false);
                }
              }}
              placeholder="Search messages and people..."
              className="h-10 w-full rounded-xl border border-slate-200/80 bg-white/60 pl-10 pr-12 text-sm text-slate-800 placeholder-slate-400 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-1 focus:ring-blue-500/20"
            />
            <div className="absolute inset-y-0 right-3.5 flex items-center">
              <kbd className="pointer-events-none hidden h-5 select-none items-center gap-0.5 rounded border border-slate-200 bg-slate-50 px-1.5 font-mono text-[10px] font-medium text-slate-400 sm:flex">
                <span>⌘</span>K
              </kbd>
            </div>

            {showSearchResults && headerSearch.trim().length >= 2 && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setShowSearchResults(false)} />
                <div
                  id="global-search-results"
                  role="listbox"
                  className="absolute left-0 right-0 top-full z-40 mt-2 max-h-[420px] overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg"
                >
                  {searching && (
                    <div className="px-3 py-6 text-center text-sm text-slate-400">Searching...</div>
                  )}

                  {!searching && searchPeople.length === 0 && searchMessages.length === 0 && (
                    <div className="px-3 py-6 text-center text-sm text-slate-400">
                      No matches for “{headerSearch.trim()}”
                    </div>
                  )}

                  {!searching && searchPeople.length > 0 && (
                    <>
                      <div className="px-2.5 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                        People
                      </div>
                      {searchPeople.map((person) => (
                        <button
                          key={person.userId}
                          role="option"
                          aria-selected={false}
                          onClick={() => {
                            setShowSearchResults(false);
                            router.push(`/people?q=${encodeURIComponent(person.displayName)}`);
                          }}
                          className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left hover:bg-slate-50"
                        >
                          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[10px] font-bold text-slate-600">
                            {initialsFor(person.displayName)}
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-medium text-slate-900">
                              {person.displayName}
                            </span>
                            {person.email && (
                              <span className="block truncate text-[11px] text-slate-400">{person.email}</span>
                            )}
                          </span>
                        </button>
                      ))}
                    </>
                  )}

                  {!searching && searchMessages.length > 0 && (
                    <>
                      <div className="px-2.5 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                        Messages
                      </div>
                      {searchMessages.map((hit) => {
                        const isDirect = hit.conversation?.type === 'DIRECT';
                        const where = hit.conversation?.group?.name
                          ? `#${hit.conversation.group.name}`
                          : 'Direct message';
                        return (
                          <button
                            key={hit.id}
                            role="option"
                            aria-selected={false}
                            onClick={() => {
                              setShowSearchResults(false);
                              // Jump straight to the conversation containing the hit.
                              const base = isDirect ? '/dms' : '/teams';
                              router.push(`${base}?conversation=${hit.conversationId}&message=${hit.id}`);
                            }}
                            className="block w-full rounded-lg px-2.5 py-2 text-left hover:bg-slate-50"
                          >
                            <span className="flex items-center gap-1.5 text-[11px] font-medium text-slate-400">
                              <span className="truncate">{where}</span>
                              <span aria-hidden="true">·</span>
                              <span className="truncate">
                                {hit.sender?.profile?.displayName || 'Someone'}
                              </span>
                            </span>
                            <span className="mt-0.5 block truncate text-sm text-slate-700">
                              {toPlainText(hit.content || '')}
                            </span>
                          </button>
                        );
                      })}
                    </>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Right section: New button, Notifications, Profile */}
          <div className="flex items-center gap-4">
            {/* + New Button */}
            <div className="relative">
              <button 
                onClick={() => setShowNewDropdown(!showNewDropdown)}
                className="flex items-center gap-1.5 h-10 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-[0.98] text-sm font-semibold text-white transition-all shadow-sm shadow-blue-500/10 cursor-pointer"
              >
                <Plus className="h-4 w-4" />
                <span>New</span>
                <ChevronDown className="h-3.5 w-3.5 opacity-80" />
              </button>

              {showNewDropdown && (
                <>
                  <div 
                    className="fixed inset-0 z-30" 
                    onClick={() => setShowNewDropdown(false)}
                  />
                  <div className="absolute right-0 mt-2 w-48 origin-top-right rounded-xl border border-slate-200 bg-white p-1 shadow-lg ring-1 ring-black/5 focus:outline-none z-40 dropdown-card">
                    <button
                      onClick={() => {
                        setShowNewDropdown(false);
                        triggerCreateChannel();
                      }}
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 transition cursor-pointer"
                    >
                      <Plus className="h-4 w-4 text-slate-400" />
                      Create Channel
                    </button>
                    <button
                      onClick={() => {
                        setShowNewDropdown(false);
                        triggerCreateDM();
                      }}
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 transition cursor-pointer"
                    >
                      <Plus className="h-4 w-4 text-slate-400" />
                      New Direct Message
                    </button>
                  </div>
                </>
              )}
            </div>

            {/* Notification Bell */}
            <button 
              onClick={() => router.push('/activity')}
              className="relative flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200/80 bg-white/60 hover:bg-slate-50 text-slate-600 transition active:scale-[0.98]"
              title="Notifications"
            >
              <Bell className="h-5 w-5" />
              {unreadNotifications > 0 && (
                <span className="absolute top-2.5 right-2.5 h-2 w-2 rounded-full bg-rose-500 ring-2 ring-white" />
              )}
            </button>

            {/* User Profile Dropdown */}
            <div className="relative">
              <button 
                onClick={() => setShowUserDropdown(!showUserDropdown)}
                className="flex items-center justify-center focus:outline-none transition active:scale-[0.98]"
              >
                {user?.avatarUrl ? (
                  <img src={user.avatarUrl} alt={displayName} className="h-9 w-9 rounded-full object-cover shadow-xs border border-slate-200" />
                ) : (
                  <div className="relative h-9 w-9 shrink-0 flex items-center justify-center rounded-full font-semibold bg-orange-500 text-white text-xs shadow-sm">
                    {initials}
                  </div>
                )}
              </button>

              {showUserDropdown && (
                <>
                  <div 
                    className="fixed inset-0 z-30" 
                    onClick={() => setShowUserDropdown(false)}
                  />
                  <div className="absolute right-0 mt-2 w-48 origin-top-right rounded-xl border border-slate-200 bg-white p-1 shadow-lg ring-1 ring-black/5 focus:outline-none z-40 dropdown-card">
                    <div className="px-3 py-2 text-xs border-b border-slate-100">
                      <div className="font-bold text-slate-800 truncate">{displayName}</div>
                      <div className="text-slate-500 truncate">{user?.workspaceRole || 'Member'}</div>
                    </div>
                    <button
                      onClick={() => {
                        setShowUserDropdown(false);
                        handleEditProfile();
                      }}
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 transition"
                    >
                      <UserCircle2 className="h-4 w-4 text-slate-400" />
                      Edit Profile
                    </button>
                    <button
                      onClick={() => {
                        setShowUserDropdown(false);
                        setShowPasswordModal(true);
                      }}
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 transition"
                    >
                      <KeyRound className="h-4 w-4 text-slate-400" />
                      Change password
                    </button>
                    <button
                      onClick={() => {
                        setShowUserDropdown(false);
                        handleLogout();
                      }}
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 transition"
                    >
                      <LogOut className="h-4 w-4 text-red-400" />
                      Logout
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>
        {/* Without this the socket can drop silently and messages typed after
            it are never sent, with no indication anything is wrong. */}
        {showDisconnectedBanner && (
          <div
            role="status"
            aria-live="polite"
            className="flex shrink-0 items-center justify-center gap-2 bg-amber-50 px-4 py-2 text-xs font-medium text-amber-800"
          >
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-500" />
            Reconnecting… messages may not send until the connection is back.
          </div>
        )}

        <div
          id="app-main-content"
          tabIndex={-1}
          className="app-shell-content app-shell-frost flex min-w-0 flex-1 overflow-hidden rounded-none border-t border-l border-white/30 bg-white/40 p-0 backdrop-blur"
        >
          {children}
        </div>
      </div>

      {showProfileEditor && (
        <Portal>
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop Overlay */}
            <div 
              className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm transition-opacity cursor-pointer"
              onClick={() => setShowProfileEditor(false)}
            />
            
            {/* Modal Content */}
            <form onSubmit={saveProfile} className="relative z-10 w-full max-w-md rounded-2xl border border-slate-200/80 bg-white p-6 shadow-xl transition-all modal-card">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-base font-bold text-slate-950">Edit profile</h3>
                <button
                  type="button"
                  onClick={() => setShowProfileEditor(false)}
                  className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 transition-colors"
                  title="Close"
                >
                  ✕
                </button>
              </div>
              {/* Profile Picture Management */}
              <div className="mb-5 flex flex-col items-center gap-3">
                <div className="relative group">
                  {(avatarPreviewUrl || avatarUrlInput) ? (
                    <img
                      src={avatarPreviewUrl || avatarUrlInput}
                      alt=""
                      onError={(e) => { console.warn('Avatar img failed to load'); (e.target as HTMLImageElement).style.display = 'none'; }}
                      className="h-24 w-24 rounded-full object-cover ring-4 ring-blue-500/20 shadow-md"
                    />
                  ) : (
                    <div className="flex h-24 w-24 items-center justify-center rounded-full text-2xl font-bold bg-orange-500 text-white ring-4 ring-blue-500/20 shadow-md">
                      {(displayNameInput || 'User').split(' ').map((n) => n[0]).join('').substring(0, 2).toUpperCase()}
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => avatarFileInputRef.current?.click()}
                    disabled={uploadingAvatar}
                    className="absolute bottom-0 right-0 flex h-8 w-8 items-center justify-center rounded-full bg-blue-600 text-white shadow-lg hover:bg-blue-700 transition cursor-pointer border-2 border-white disabled:opacity-50"
                    title="Upload profile picture"
                  >
                    <Camera className="h-4 w-4" />
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => avatarFileInputRef.current?.click()}
                    disabled={uploadingAvatar}
                    className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition cursor-pointer disabled:opacity-50"
                  >
                    {uploadingAvatar ? 'Uploading...' : 'Upload Image'}
                  </button>
                  {(avatarPreviewUrl || avatarUrlInput) && (
                    <button
                      type="button"
                      onClick={() => { setAvatarPreviewUrl(''); setAvatarUrlInput(''); }}
                      className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-100 transition cursor-pointer"
                    >
                      Remove Photo
                    </button>
                  )}
                </div>
                <input
                  type="file"
                  ref={avatarFileInputRef}
                  onChange={handleAvatarFileUpload}
                  accept="image/*"
                  className="hidden"
                />
              </div>

              <label className="mb-3 block text-sm text-slate-700 font-medium">
                Display name
                <input
                  value={displayNameInput}
                  onChange={(event) => setDisplayNameInput(event.target.value)}
                  className="mt-1 block h-10 w-full rounded-lg border border-slate-200 px-3 text-sm text-slate-900 bg-white placeholder-slate-400 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 transition-all"
                  required
                />
              </label>
              <label className="mb-3 block text-sm text-slate-700 font-medium">
                About
                <textarea
                  value={aboutTextInput}
                  onChange={(event) => setAboutTextInput(event.target.value)}
                  rows={2}
                  className="mt-1 block w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 bg-white placeholder-slate-400 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 transition-all resize-none"
                />
              </label>

              {profileError && (
                <div className="mb-3 rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs font-semibold text-red-700 flex items-center gap-2">
                  <span className="shrink-0 text-sm">⚠️</span>
                  <span>{profileError}</span>
                </div>
              )}

              {profileSuccess && (
                <div className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50 p-2.5 text-xs font-semibold text-emerald-700 flex items-center gap-2">
                  <Check className="h-4 w-4 shrink-0 text-emerald-600" />
                  <span>{profileSuccess}</span>
                </div>
              )}
              <div className="mt-1 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowProfileEditor(false)}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition active:scale-[0.98]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingProfile}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition active:scale-[0.98] shadow-sm shadow-blue-500/10"
                >
                  {savingProfile ? 'Saving...' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </Portal>
      )}

      <ChangePasswordModal
        isOpen={showPasswordModal}
        onClose={() => setShowPasswordModal(false)}
      />

      {activeCall && (
        <VideoCallModal
          conversationId={activeCall.conversationId}
          roomName={activeCall.roomName}
          conversationName={activeCall.conversationName}
          view={activeCall.view}
          onMinimize={minimizeCall}
          onExpand={expandCall}
          onEnd={signalEndCall}
        />
      )}

      {outgoingCall && !activeCall && (
        <OutgoingCallScreen
          conversationName={outgoingCall.conversationName}
          onCancel={cancelOutgoingCall}
        />
      )}

      {incomingCall && !activeCall && (
        <IncomingCallScreen
          callerName={incomingCall.callerName}
          conversationName={incomingCall.conversationName}
          onAccept={() => {
            acceptIncomingCall(
              incomingCall.conversationId,
              incomingCall.callerId,
              incomingCall.roomName,
              incomingCall.conversationName,
            );
          }}
          onDecline={() =>
            declineCallFromStore(incomingCall.conversationId, incomingCall.callerId)
          }
        />
      )}

      {callNotice && (
        <Portal>
          <div className="fixed bottom-6 right-6 z-[300] rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white shadow-2xl ring-1 ring-white/10 animate-bounce">
            {callNotice}
          </div>
        </Portal>
      )}
      </div>
    </div>
  );
}
