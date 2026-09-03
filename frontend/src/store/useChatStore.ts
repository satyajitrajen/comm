import { create } from 'zustand';
import { disconnectAppSocket } from '../lib/socket';

export interface User {
  id: string;
  email: string | null;
  phoneNumber: string | null;
  displayName: string;
  avatarUrl: string | null;
}

export interface ChatThread {
  conversationId: string;
  type: 'DIRECT' | 'GROUP' | 'BROADCAST';
  name: string;
  avatarUrl: string | null;
  unreadCount: number;
  isMuted: boolean;
  isPinned: boolean;
  isArchived: boolean;
  lastMessage: {
    id: string;
    content: string;
    senderId: string;
    messageType: string;
    createdAt: string;
  } | null;
  recipient: {
    id: string;
    displayName: string;
    avatarUrl: string | null;
    presence: string | null;
    availability: string | null;
  } | null;
}

export interface MessageReaction {
  id: string;
  userId: string;
  emoji: string;
}

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  content: string | null;
  messageType: 'TEXT' | 'IMAGE' | 'FILE' | 'TASK' | 'POLL' | 'BROADCAST';
  priority: 'NORMAL' | 'IMPORTANT' | 'URGENT';
  isEdited: boolean;
  isDeletedGlobally: boolean;
  createdAt: string;
  updatedAt?: string;
  sender: {
    id: string;
    profile: {
      displayName: string;
      avatarUrl: string | null;
    } | null;
  };
  reads: Array<{ userId: string }>;
  deliveries: Array<{ userId: string }>;
  reactions: MessageReaction[];
  replyTo?: {
    id: string;
    content: string | null;
  } | null;
  polls?: unknown;
  tasks?: unknown;
}

interface ChatStore {
  user: User | null;
  accessToken: string | null;
  chats: ChatThread[];
  activeConversationId: string | null;
  messages: Message[];
  typingUsers: { [convId: string]: { [userId: string]: boolean } };
  onlineUsers: Set<string>;
  setAuth: (user: User | null, token: string | null) => void;
  logout: () => void;
  setChats: (chats: ChatThread[]) => void;
  setActiveConversationId: (id: string | null) => void;
  setMessages: (messages: Message[]) => void;
  addMessage: (message: Message) => void;
  updateMessage: (message: Partial<Message> & { id?: string; messageId?: string }) => void;
  setTyping: (conversationId: string, userId: string, isTyping: boolean) => void;
  setOnline: (userId: string, isOnline: boolean) => void;
}

const normalizeMessage = (message: Message): Message => ({
  ...message,
  reads: message.reads || [],
  deliveries: message.deliveries || [],
  reactions: message.reactions || [],
});

export const useChatStore = create<ChatStore>((set) => ({
  user: typeof window !== 'undefined' ? JSON.parse(localStorage.getItem('veloce_user') || 'null') : null,
  accessToken: typeof window !== 'undefined' ? localStorage.getItem('veloce_token') : null,
  chats: [],
  activeConversationId: null,
  messages: [],
  typingUsers: {},
  onlineUsers: new Set(),

  setAuth: (user, token) => set(() => {
    if (user && token) {
      localStorage.setItem('veloce_user', JSON.stringify(user));
      localStorage.setItem('veloce_token', token);
    } else {
      localStorage.removeItem('veloce_user');
      localStorage.removeItem('veloce_token');
      localStorage.removeItem('veloce_refresh');
      localStorage.removeItem('veloce_session');
    }
    return { user, accessToken: token };
  }),

  logout: () => set(() => {
    disconnectAppSocket();
    localStorage.removeItem('veloce_user');
    localStorage.removeItem('veloce_token');
    localStorage.removeItem('veloce_refresh');
    localStorage.removeItem('veloce_session');
    return { user: null, accessToken: null, chats: [], activeConversationId: null, messages: [] };
  }),

  setChats: (chats) => set({ chats }),

  setActiveConversationId: (id) => set({ activeConversationId: id, messages: [] }),

  setMessages: (messages) => set({ messages: messages.map(normalizeMessage) }),

  addMessage: (message) => set((state) => {
    const normalizedMessage = normalizeMessage(message);
    // Append to active conversation if it matches
    const isCurrent = state.activeConversationId === normalizedMessage.conversationId;
    const isCallMsg = [
      'SYSTEM_CALL_START',
      'SYSTEM_CALL_END',
      'SYSTEM_CALL_DECLINE',
      'CALL',
      'CALL_MISSED',
      'CALL_ENDED',
      'VIDEO_CALL',
      'AUDIO_CALL',
    ].includes(normalizedMessage.messageType || '');

    const updatedMessages = isCurrent ? [...state.messages, normalizedMessage] : state.messages;

    // Update lastMessage in the chat threads feed (skip call messages)
    const updatedChats = state.chats.map((chat) => {
      if (chat.conversationId === normalizedMessage.conversationId) {
        return {
          ...chat,
          unreadCount: isCurrent || isCallMsg ? chat.unreadCount : chat.unreadCount + 1,
          lastMessage: isCallMsg
            ? chat.lastMessage
            : {
                id: normalizedMessage.id,
                content: normalizedMessage.content || 'File Attachment',
                senderId: normalizedMessage.senderId,
                messageType: normalizedMessage.messageType,
                createdAt: normalizedMessage.createdAt,
              },
        };
      }
      return chat;
    });

    return { messages: updatedMessages, chats: updatedChats };
  }),

  updateMessage: (updatedMsg) => set((state) => {
    const updatedMessages = state.messages.map((m) => {
      if (m.id === updatedMsg.messageId || m.id === updatedMsg.id) {
        return { ...m, ...updatedMsg };
      }
      return m;
    });
    return { messages: updatedMessages };
  }),

  setTyping: (conversationId, userId, isTyping) => set((state) => {
    const convTyping = state.typingUsers[conversationId] || {};
    const updatedConvTyping = { ...convTyping, [userId]: isTyping };
    return {
      typingUsers: {
        ...state.typingUsers,
        [conversationId]: updatedConvTyping,
      },
    };
  }),

  setOnline: (userId, isOnline) => set((state) => {
    const updated = new Set(state.onlineUsers);
    if (isOnline) {
      updated.add(userId);
    } else {
      updated.delete(userId);
    }
    return { onlineUsers: updated };
  }),
}));
