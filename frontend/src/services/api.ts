import axios, { type InternalAxiosRequestConfig } from 'axios';
import { useChatStore } from '../store/useChatStore';
import {
  ensureDesktopConfig,
  resolveApiBaseUrl,
} from '../lib/desktopRuntime';

export const TOKEN_UPDATED_EVENT = 'veloce-token-updated';

type AuthRefreshResponse = {
  accessToken: string;
  refreshToken: string;
  sessionId: string;
};

type RetryableConfig = InternalAxiosRequestConfig & { _retryAuth?: boolean };

export const api = axios.create({
  baseURL: resolveApiBaseUrl() || undefined,
});

if (typeof window !== 'undefined') {
  void ensureDesktopConfig().then(() => {
    const base = resolveApiBaseUrl();
    if (base) {
      api.defaults.baseURL = base;
    }
  });
}

function notifyTokenUpdated() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(TOKEN_UPDATED_EVENT));
  }
}

export function persistAuthTokens(accessToken: string, refreshToken: string, sessionId: string) {
  if (typeof window === 'undefined') return;
  localStorage.setItem('veloce_token', accessToken);
  localStorage.setItem('veloce_refresh', refreshToken);
  localStorage.setItem('veloce_session', sessionId);
  useChatStore.setState({ accessToken });
  notifyTokenUpdated();
}

let refreshInFlight: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    try {
      if (typeof window === 'undefined') return null;
      const sessionId = localStorage.getItem('veloce_session');
      const refreshToken = localStorage.getItem('veloce_refresh');
      if (!sessionId || !refreshToken) return null;

      const { data } = await axios.post<AuthRefreshResponse>(
        '/api/v1/auth/refresh',
        { sessionId, refreshToken },
        {
          baseURL: resolveApiBaseUrl() || undefined,
          headers: { 'X-Skip-Auth-Refresh': '1' },
        },
      );

      persistAuthTokens(data.accessToken, data.refreshToken, data.sessionId);
      return data.accessToken;
    } catch {
      return null;
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}

api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('veloce_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const status = error?.response?.status;
    const cfg = error?.config as RetryableConfig | undefined;

    if (typeof window === 'undefined' || status !== 401 || !cfg) {
      return Promise.reject(error);
    }

    if (cfg.headers?.['X-Skip-Auth-Refresh']) {
      return Promise.reject(error);
    }

    const url = String(cfg.url || '');
    if (
      url.includes('/auth/login') ||
      url.includes('/auth/register') ||
      url.includes('/auth/refresh') ||
      url.includes('/auth/logout') ||
      url.includes('/auth/verify-2fa')
    ) {
      localStorage.removeItem('veloce_token');
      localStorage.removeItem('veloce_refresh');
      localStorage.removeItem('veloce_session');
      localStorage.removeItem('veloce_user');
      useChatStore.getState().logout();
      if (!window.location.pathname.startsWith('/login')) {
        window.location.href = '/login';
      }
      return Promise.reject(error);
    }

    if (cfg._retryAuth) {
      localStorage.removeItem('veloce_token');
      localStorage.removeItem('veloce_refresh');
      localStorage.removeItem('veloce_session');
      localStorage.removeItem('veloce_user');
      useChatStore.getState().logout();
      if (!window.location.pathname.startsWith('/login')) {
        window.location.href = '/login';
      }
      return Promise.reject(error);
    }

    cfg._retryAuth = true;
    const newToken = await refreshAccessToken();
    if (!newToken) {
      localStorage.removeItem('veloce_token');
      localStorage.removeItem('veloce_refresh');
      localStorage.removeItem('veloce_session');
      localStorage.removeItem('veloce_user');
      useChatStore.getState().logout();
      if (!window.location.pathname.startsWith('/login')) {
        window.location.href = '/login';
      }
      return Promise.reject(error);
    }

    cfg.headers.Authorization = `Bearer ${newToken}`;
    return api(cfg);
  },
);

export const authAPI = {
  register: (body: Record<string, unknown>) => api.post('/api/v1/auth/register', body).then((res) => res.data),
  login: (body: Record<string, unknown>) => api.post('/api/v1/auth/login', body).then((res) => res.data),
  verifyTwoFactor: (body: { verifyKey: string; otpCode: string }) =>
    api.post('/api/v1/auth/verify-2fa', body).then((res) => res.data),
  /** Always succeeds, whether or not the address has an account. */
  forgotPassword: (email: string) =>
    api.post('/api/v1/auth/forgot-password', { email }).then((res) => res.data),
  resetPassword: (body: { token: string; password: string }) =>
    api.post('/api/v1/auth/reset-password', body).then((res) => res.data),
  refresh: (body: { sessionId: string; refreshToken: string }) =>
    api.post('/api/v1/auth/refresh', body).then((res) => res.data),
  logout: (body: { sessionId: string; refreshToken: string }) =>
    api.post('/api/v1/auth/logout', body, { headers: { 'X-Skip-Auth-Refresh': '1' } }).then((res) => res.data),
  me: () => api.get('/api/v1/auth/me').then((res) => res.data),
  changePassword: (body: { currentPassword: string; newPassword: string }) =>
    api.post('/api/v1/auth/change-password', body).then((res) => res.data),
};

export const chatsAPI = {
  getFeed: () => api.get('/api/v1/chats').then((res) => res.data),
  /**
   * Returns one page of history, oldest -> newest.
   * Pass the previous page's `nextCursor` as `before` to load older messages.
   */
  getHistory: (id: string, params?: { limit?: number; before?: string; around?: string }) =>
    api
      .get(`/api/v1/chats/${id}/messages`, { params })
      .then((res) => res.data as { messages: unknown[]; hasMore: boolean; nextCursor: string | null }),
  createDirect: (targetUserId: string) => api.post('/api/v1/chats/direct', { targetUserId }).then((res) => res.data),
  createGroup: (body: {
    name: string;
    description?: string;
    participantIds: string[];
    teamName?: string;
    channelSlug?: string;
    spaceType?: string;
    isReadOnly?: boolean;
  }) => api.post('/api/v1/chats/group', body).then((res) => res.data),
  join: (conversationId: string) => api.post(`/api/v1/chats/${conversationId}/join`).then((res) => res.data),
  leave: (conversationId: string, transferOwnerTo?: string) =>
    api
      .delete(`/api/v1/chats/${conversationId}/leave`, {
        params: transferOwnerTo ? { transferOwnerTo } : undefined,
      })
      .then((res) => res.data),
  getDetails: (conversationId: string) =>
    api.get(`/api/v1/chats/${conversationId}/details`).then((res) => res.data),
  updateGroup: (conversationId: string, body: {
    name?: string;
    description?: string;
    teamName?: string;
    spaceType?: string;
    isReadOnly?: boolean;
  }) => api.patch(`/api/v1/chats/${conversationId}`, body).then((res) => res.data),
  deleteGroup: (conversationId: string) =>
    api.delete(`/api/v1/chats/${conversationId}`).then((res) => res.data),
  mute: (conversationId: string) =>
    api.post(`/api/v1/chats/${conversationId}/mute`).then((res) => res.data),
  unmute: (conversationId: string) =>
    api.delete(`/api/v1/chats/${conversationId}/mute`).then((res) => res.data),
  addMembers: (conversationId: string, userIds: string[]) =>
    api.post(`/api/v1/chats/${conversationId}/members`, { userIds }).then((res) => res.data),
  removeMember: (conversationId: string, userId: string) =>
    api.delete(`/api/v1/chats/${conversationId}/members/${userId}`).then((res) => res.data),
  updateMemberRole: (conversationId: string, userId: string, role: string) =>
    api.patch(`/api/v1/chats/${conversationId}/members/${userId}/role`, { role }).then((res) => res.data),
};

export type MessageSearchHit = {
  id: string;
  conversationId: string;
  content: string | null;
  createdAt: string;
  sender?: { id?: string; profile?: { displayName?: string | null } | null } | null;
  conversation?: {
    id: string;
    type: string;
    group?: { name?: string | null } | null;
  } | null;
};

export type CallHistoryMessage = {
  id: string;
  conversationId: string;
  content: string | null;
  messageType: string;
  createdAt: string;
  sender?: { id?: string; profile?: { displayName?: string | null } | null } | null;
  conversation?: {
    id: string;
    type: string;
    group?: { name?: string | null } | null;
  } | null;
};

export const callsAPI = {
  /**
   * Participant-scoped call events (start / end / decline), newest first.
   * Pass the previous page's `nextCursor` as `before` to load older records.
   */
  getHistory: (params?: { conversationId?: string; limit?: number; before?: string }) =>
    api
      .get('/api/v1/messages/call-history', { params })
      .then(
        (res) =>
          res.data as { messages: CallHistoryMessage[]; hasMore: boolean; nextCursor: string | null },
      ),
};

export const messagesAPI = {
  /** Searches only conversations the caller participates in. */
  search: (q: string, params?: { conversationId?: string; limit?: number; before?: string }) =>
    api
      .get('/api/v1/messages/search', { params: { q, ...params } })
      .then(
        (res) =>
          res.data as { messages: MessageSearchHit[]; hasMore: boolean; nextCursor: string | null },
      ),

  send: (body: { conversationId: string; content: string; replyToMessageId?: string; messageType?: string; priority?: string }) =>
    api.post('/api/v1/messages', body).then((res) => res.data),

  edit: (id: string, content: string) => api.put(`/api/v1/messages/${id}`, { content }).then((res) => res.data),

  delete: (id: string, deleteForEveryone: boolean) =>
    api.delete(`/api/v1/messages/${id}?everyone=${deleteForEveryone}`).then((res) => res.data),

  react: (id: string, emoji: string) => api.post(`/api/v1/messages/${id}/react`, { emoji }).then((res) => res.data),

  unreact: (id: string, emoji: string) =>
    api.delete(`/api/v1/messages/${id}/react`, { data: { emoji } }).then((res) => res.data),

  createTask: (body: { messageId: string; title: string; assigneeIds: string[]; dueDate?: string; priority?: string }) =>
    api.post('/api/v1/messages/task', body).then((res) => res.data),

  createPoll: (body: {
    conversationId: string;
    question: string;
    options: string[];
    expiresAt?: string;
    isMultiSelect?: boolean;
  }) => api.post('/api/v1/messages/poll', body).then((res) => res.data),

  votePoll: (pollId: string, optionId: string) =>
    api.post(`/api/v1/messages/poll/${pollId}/vote`, { optionId }).then((res) => res.data),

  star: (id: string) => api.post(`/api/v1/messages/${id}/star`).then((res) => res.data),

  unstar: (id: string) => api.delete(`/api/v1/messages/${id}/star`).then((res) => res.data),

  pin: (id: string, conversationId: string) =>
    api.post(`/api/v1/messages/${id}/pin`, { conversationId }).then((res) => res.data),

  unpin: (id: string, conversationId: string) =>
    api.delete(`/api/v1/messages/${id}/pin`, { data: { conversationId } }).then((res) => res.data),

  forward: (id: string, targetConversationId: string) =>
    api.post(`/api/v1/messages/${id}/forward`, { targetConversationId }).then((res) => res.data),
};

export const usersAPI = {
  getDirectory: () => api.get('/api/v1/users/directory').then((res) => res.data),
  updateProfile: (body: Record<string, unknown>) => api.patch('/api/v1/users/profile', body).then((res) => res.data),
};

export const notificationsAPI = {
  getAll: (page = 1, limit = 30) =>
    api.get(`/api/v1/notifications?page=${page}&limit=${limit}`).then((res) => res.data),
  markRead: (id: string) => api.patch(`/api/v1/notifications/${id}/read`).then((res) => res.data),
  markAllRead: () => api.patch('/api/v1/notifications/read-all').then((res) => res.data),

  /** publicKey is null when the server has no VAPID keys configured. */
  getPushPublicKey: () =>
    api
      .get('/api/v1/notifications/push/public-key')
      .then((res) => res.data as { publicKey: string | null }),
  subscribePush: (body: { subscription?: unknown; token?: string; deviceType?: string }) =>
    api.post('/api/v1/notifications/push/subscribe', body).then((res) => res.data),
  unsubscribePush: (body: { subscription?: unknown; token?: string; deviceType?: string }) =>
    api
      .delete('/api/v1/notifications/push/subscribe', { data: body })
      .then((res) => res.data),
};

export const tasksAPI = {
  getMine: () => api.get('/api/v1/tasks?scope=mine').then((res) => res.data),
  getWorkspace: () => api.get('/api/v1/tasks?scope=workspace').then((res) => res.data),
  create: (body: { conversationId: string; title: string; assigneeIds?: string[]; dueDate?: string | null; priority?: string }) =>
    api.post('/api/v1/tasks', body).then((res) => res.data),
  update: (id: string, body: { complete?: boolean; status?: string; title?: string; dueDate?: string | null; priority?: string }) =>
    api.patch(`/api/v1/tasks/${id}`, body).then((res) => res.data),
};

export const filesAPI = {
  getWorkspace: (search?: string, conversationId?: string) =>
    api.get('/api/v1/files', { params: { search: search || undefined, conversationId } }).then((res) => res.data),
  getMine: () => api.get('/api/v1/files?scope=mine').then((res) => res.data),
  upload: (file: File, conversationId?: string) => {
    const formData = new FormData();
    formData.append('file', file);
    if (conversationId) formData.append('conversationId', conversationId);
    return api.post('/api/v1/files', formData).then((res) => res.data);
  },
  download: (id: string) => api.get(`/api/v1/files/${id}/download`, { responseType: 'blob' }),
  view: (id: string) => api.get(`/api/v1/files/${id}/view`, { responseType: 'blob' }),
};

export const calendarAPI = {
  getEvents: (params?: { start?: string; end?: string }) =>
    api.get('/api/v1/calendar', { params }).then((res) => res.data),
  createEvent: (body: {
    title: string;
    description?: string;
    startsAt: string;
    endsAt: string;
    teamName?: string;
    meetingLink?: string;
    attendeeIds?: string[];
  }) => api.post('/api/v1/calendar', body).then((res) => res.data),
  updateEvent: (
    id: string,
    body: {
      title?: string;
      description?: string;
      startsAt?: string;
      endsAt?: string;
      teamName?: string;
      meetingLink?: string;
      attendeeIds?: string[];
      notifyAttendees?: boolean;
    },
  ) => api.patch(`/api/v1/calendar/${id}`, body).then((res) => res.data),
  deleteEvent: (id: string) =>
    api.delete(`/api/v1/calendar/${id}`).then((res) => res.data),
  sendInvites: (id: string, attendeeIds?: string[]) =>
    api.post(`/api/v1/calendar/${id}/invites`, { attendeeIds }).then((res) => res.data),
  downloadIcs: (id: string) =>
    api.get(`/api/v1/calendar/${id}/ics`, { responseType: 'blob' }),
};

export const appsAPI = {
  getAll: () => api.get('/api/v1/apps').then((res) => res.data),
  toggle: (id: string) => api.patch(`/api/v1/apps/${id}/toggle`).then((res) => res.data),
};

export const dashboardAPI = {
  get: () => api.get('/api/v1/dashboard').then((res) => res.data),
};

export const adminAPI = {
  getUsers: () => api.get('/api/v1/admin/users').then((res) => res.data),
  importUsersCsv: (csv: string) =>
    api.post('/api/v1/admin/users/import', { csv }).then((res) => res.data),
  getImportTemplate: () =>
    api
      .get<{ csv: string }>('/api/v1/admin/users/import-template')
      .then((res) => res.data.csv),
  createUser: (body: {
    email: string;
    phoneNumber?: string | null;
    password: string;
    displayName: string;
    role: string;
    department?: string | null;
    statusAvailability?: string;
    aboutText?: string;
    isActive?: boolean;
  }) => api.post('/api/v1/admin/users', body).then((res) => res.data),
  updateUser: (
    userId: string,
    body: {
      email?: string;
      phoneNumber?: string | null;
      password?: string;
      displayName?: string;
      role?: string;
      department?: string | null;
      statusAvailability?: string;
      aboutText?: string;
      avatarUrl?: string | null;
      isActive?: boolean;
      canPostAnnouncements?: boolean;
      allowedNavKeys?: string[] | null;
      announcementPublisherConversationIds?: string[];
    },
  ) => api.patch(`/api/v1/admin/users/${userId}`, body).then((res) => res.data),
  getApprovalCycle: () => api.get('/api/v1/admin/settings/approval-cycle').then((res) => res.data),
  updateApprovalCycle: (body: {
    enabled: boolean;
    requiredApprovals: number;
    approverRole: string;
    appliesTo: string[];
    autoApproveAdmins: boolean;
    escalationHours: number;
  }) => api.patch('/api/v1/admin/settings/approval-cycle', body).then((res) => res.data),
  getRolePermissions: () =>
    api.get('/api/v1/admin/settings/role-permissions').then((res) => res.data),
  updateRolePermissions: (body: Record<string, unknown>) =>
    api.patch('/api/v1/admin/settings/role-permissions', body).then((res) => res.data),
};
