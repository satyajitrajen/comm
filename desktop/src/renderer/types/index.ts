import { IElectronAPI } from '../../preload';

declare global {
  interface Window {
    electronAPI?: IElectronAPI;
  }
}

export type ThemeMode = 'light' | 'dark';

export interface User {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string;
  status: 'online' | 'away' | 'dnd' | 'offline';
  role?: string;
}

export interface Team {
  id: string;
  name: string;
  icon?: string;
  description?: string;
}

export interface Channel {
  id: string;
  teamId?: string;
  name: string;
  isPrivate: boolean;
  topic?: string;
  unreadCount?: number;
}

export interface DirectMessageUser {
  id: string;
  name: string;
  avatarUrl: string;
  status: 'online' | 'away' | 'dnd' | 'offline';
  unreadCount?: number;
}

export interface FileAttachment {
  name: string;
  size: string;
  url: string;
  type: 'image' | 'document' | 'code';
}

export interface Message {
  id: string;
  channelId: string;
  senderId: string;
  senderName: string;
  senderAvatar?: string;
  content: string;
  timestamp: string;
  attachments?: FileAttachment[];
  reactions?: Record<string, string[]>; // emoji -> userIds
}

export interface CallState {
  isCallActive: boolean;
  isIncoming: boolean;
  callerName?: string;
  callerAvatar?: string;
  callType?: 'audio' | 'video';
  channelId?: string;
  isMuted: boolean;
  isVideoOff: boolean;
  isScreenSharing: boolean;
}
