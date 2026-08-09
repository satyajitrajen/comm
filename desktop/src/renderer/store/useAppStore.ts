import { create } from 'zustand';
import { User, Team, Channel, DirectMessageUser, Message, CallState, ThemeMode } from '../types';
import { chatsAPI } from '../api/api';

export type ActiveTabMode =
  | 'home'
  | 'teams'
  | 'channels'
  | 'dms'
  | 'calls'
  | 'activity'
  | 'announcements'
  | 'calendar'
  | 'files'
  | 'people'
  | 'apps'
  | 'settings';

interface AppState {
  // Appearance & Theme
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;

  // Navigation & Settings
  activeTab: ActiveTabMode;
  backendUrl: string;
  isConnected: boolean;
  searchQuery: string;

  // Auth & Session
  isAuthenticated: boolean;
  currentUser: User | null;
  userStatus: 'online' | 'away' | 'dnd';

  // Teams & Channels
  teams: Team[];
  activeTeam: Team | null;
  channels: Channel[];
  activeChannel: Channel | null;

  // Direct Messages & People
  directMessages: DirectMessageUser[];
  activeDM: DirectMessageUser | null;

  // Real-time Messages & Typing
  messages: Record<string, Message[]>;
  typingUsers: Record<string, string[]>;

  // Call State
  callState: CallState;

  // Actions
  setActiveTab: (tab: ActiveTabMode) => void;
  setBackendUrl: (url: string) => void;
  setIsConnected: (connected: boolean) => void;
  setSearchQuery: (query: string) => void;
  setAuthenticated: (auth: boolean) => void;
  setCurrentUser: (user: User | null) => void;
  setUserStatus: (status: 'online' | 'away' | 'dnd') => void;
  logout: () => void;
  fetchChatsFeed: () => Promise<void>;

  // Team / Channel / DM Actions
  setActiveTeam: (team: Team) => void;
  setActiveChannel: (channel: Channel) => void;
  setActiveDM: (dm: DirectMessageUser) => void;
  addChannel: (channel: Channel) => void;

  // Message Actions
  addMessage: (targetId: string, message: Message) => void;
  addReaction: (targetId: string, messageId: string, emoji: string, userId: string) => void;
  setMessages: (targetId: string, messages: Message[]) => void;
  setTypingUsers: (targetId: string, users: string[]) => void;

  // Call Actions
  startCall: (callerName: string, callType: 'audio' | 'video') => void;
  receiveIncomingCall: (callerName: string, callType: 'audio' | 'video') => void;
  acceptCall: () => void;
  declineCall: () => void;
  endCall: () => void;
  toggleMute: () => void;
  toggleVideo: () => void;
  toggleScreenShare: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  theme: 'light',
  setTheme: (theme) => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
      document.documentElement.classList.remove('light');
    } else {
      document.documentElement.classList.add('light');
      document.documentElement.classList.remove('dark');
    }
    set({ theme });
  },

  activeTab: 'home',
  backendUrl: localStorage.getItem('backend_url') || 'http://localhost:5000',
  isConnected: false,
  searchQuery: '',

  isAuthenticated: Boolean(localStorage.getItem('auth_token') || localStorage.getItem('veloce_token')),
  currentUser: localStorage.getItem('veloce_user')
    ? (() => {
        try {
          const u = JSON.parse(localStorage.getItem('veloce_user') || '{}');
          return {
            id: u.id,
            name: u.displayName || u.email || 'Alex Mercer',
            email: u.email || '',
            avatarUrl: u.avatarUrl || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150',
            status: 'online',
            role: u.role || 'Member',
          };
        } catch {
          return null;
        }
      })()
    : {
        id: 'usr_1',
        name: 'Alex Mercer',
        email: 'alex.mercer@comm.internal',
        avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150',
        status: 'online',
        role: 'Lead Architect',
      },
  userStatus: 'online',

  teams: [],
  activeTeam: null,

  channels: [],
  activeChannel: null,

  directMessages: [],
  activeDM: null,

  messages: {},
  typingUsers: {},

  callState: {
    isCallActive: false,
    isIncoming: false,
    isMuted: false,
    isVideoOff: false,
    isScreenSharing: false,
  },

  setActiveTab: (tab) => set({ activeTab: tab }),
  setBackendUrl: (url) => {
    localStorage.setItem('backend_url', url);
    set({ backendUrl: url });
  },
  setIsConnected: (connected) => set({ isConnected: connected }),
  setSearchQuery: (query) => set({ searchQuery: query }),
  setAuthenticated: (auth) => set({ isAuthenticated: auth }),
  setCurrentUser: (user) => set({ currentUser: user }),
  setUserStatus: (status) => set({ userStatus: status }),
  logout: () => {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('veloce_token');
    localStorage.removeItem('veloce_refresh');
    localStorage.removeItem('veloce_session');
    localStorage.removeItem('veloce_user');
    set({ isAuthenticated: false, currentUser: null });
  },

  fetchChatsFeed: async () => {
    try {
      const feed = await chatsAPI.getFeed();
      if (Array.isArray(feed) && feed.length > 0) {
        const liveChannels: Channel[] = [];
        const liveDMs: DirectMessageUser[] = [];
        const liveTeamsMap: Record<string, Team> = {
          team_core: { id: 'team_core', name: 'Comm Engineering', icon: '⚡', description: 'Core product engineering & infrastructure' },
        };

        feed.forEach((item: any) => {
          if (item.type === 'DIRECT') {
            liveDMs.push({
              id: item.conversationId,
              name: item.recipient?.displayName || item.name || 'Team Member',
              avatarUrl: item.recipient?.avatarUrl || 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150',
              status: (item.recipient?.availability?.toLowerCase() as any) || 'online',
              unreadCount: item.unreadCount || 0,
            });
          } else {
            const teamName = item.group?.teamName || 'Comm Engineering';
            const teamId = `team_${teamName.toLowerCase().replace(/\s+/g, '_')}`;
            if (!liveTeamsMap[teamId]) {
              liveTeamsMap[teamId] = {
                id: teamId,
                name: teamName,
                icon: '🚀',
                description: `${teamName} workspace team`,
              };
            }

            liveChannels.push({
              id: item.conversationId,
              teamId,
              name: item.group?.name || item.name || 'channel',
              isPrivate: item.group?.spaceType === 'PRIVATE' || Boolean(item.group?.isReadOnly),
              topic: item.group?.description || 'Discussion channel',
              unreadCount: item.unreadCount || 0,
            });
          }
        });

        set((state) => ({
          teams: Object.values(liveTeamsMap),
          channels: liveChannels.length > 0 ? liveChannels : state.channels,
          directMessages: liveDMs.length > 0 ? liveDMs : state.directMessages,
          activeChannel: liveChannels.length > 0 ? (state.activeChannel ? liveChannels.find((c) => c.id === state.activeChannel?.id) || liveChannels[0] : liveChannels[0]) : state.activeChannel,
          activeDM: liveDMs.length > 0 ? (state.activeDM ? liveDMs.find((d) => d.id === state.activeDM?.id) || liveDMs[0] : liveDMs[0]) : state.activeDM,
        }));
      }
    } catch (err) {
      console.warn('Failed to fetch live chats feed from API:', err);
    }
  },

  setActiveTeam: (team) => set({ activeTeam: team }),
  setActiveChannel: (channel) => set({ activeChannel: channel, activeDM: null }),
  setActiveDM: (dm) => set({ activeDM: dm, activeChannel: null }),
  addChannel: (channel) => set((state) => ({ channels: [...state.channels, channel] })),

  addMessage: (targetId, message) =>
    set((state) => ({
      messages: {
        ...state.messages,
        [targetId]: [...(state.messages[targetId] || []), message],
      },
    })),

  addReaction: (targetId, messageId, emoji, userId) =>
    set((state) => {
      const currentList = state.messages[targetId] || [];
      const updatedList = currentList.map((msg) => {
        if (msg.id !== messageId) return msg;
        const existingReactions = msg.reactions || {};
        const currentUsers = existingReactions[emoji] || [];
        const hasReacted = currentUsers.includes(userId);
        const newUsers = hasReacted
          ? currentUsers.filter((id) => id !== userId)
          : [...currentUsers, userId];
        return {
          ...msg,
          reactions: {
            ...existingReactions,
            [emoji]: newUsers,
          },
        };
      });
      return {
        messages: {
          ...state.messages,
          [targetId]: updatedList,
        },
      };
    }),

  setMessages: (targetId, messages) =>
    set((state) => ({
      messages: { ...state.messages, [targetId]: messages },
    })),

  setTypingUsers: (targetId, users) =>
    set((state) => ({
      typingUsers: { ...state.typingUsers, [targetId]: users },
    })),

  startCall: (callerName, callType) =>
    set({
      callState: {
        isCallActive: true,
        isIncoming: false,
        callerName,
        callType,
        isMuted: false,
        isVideoOff: false,
        isScreenSharing: false,
      },
    }),

  receiveIncomingCall: (callerName, callType) =>
    set({
      callState: {
        isCallActive: true,
        isIncoming: true,
        callerName,
        callType,
        isMuted: false,
        isVideoOff: false,
        isScreenSharing: false,
      },
    }),

  acceptCall: () =>
    set((state) => ({
      callState: { ...state.callState, isIncoming: false },
    })),

  declineCall: () =>
    set({
      callState: { isCallActive: false, isIncoming: false, isMuted: false, isVideoOff: false, isScreenSharing: false },
    }),

  endCall: () =>
    set({
      callState: { isCallActive: false, isIncoming: false, isMuted: false, isVideoOff: false, isScreenSharing: false },
    }),

  toggleMute: () =>
    set((state) => ({
      callState: { ...state.callState, isMuted: !state.callState.isMuted },
    })),

  toggleVideo: () =>
    set((state) => ({
      callState: { ...state.callState, isVideoOff: !state.callState.isVideoOff },
    })),

  toggleScreenShare: () =>
    set((state) => ({
      callState: { ...state.callState, isScreenSharing: !state.callState.isScreenSharing },
    })),
}));
