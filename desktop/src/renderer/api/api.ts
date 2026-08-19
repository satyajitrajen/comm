import axios from 'axios';
import { useAppStore } from '../store/useAppStore';

const getBaseUrl = () => {
  return useAppStore.getState().backendUrl || 'http://localhost:5000';
};

export const api = axios.create();

api.interceptors.request.use((config) => {
  config.baseURL = getBaseUrl();
  const token = localStorage.getItem('auth_token') || localStorage.getItem('veloce_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export const authAPI = {
  me: () => api.get('/api/v1/auth/me').then((res) => res.data),
  login: (body: Record<string, unknown>) => api.post('/api/v1/auth/login', body).then((res) => res.data),
  register: (body: Record<string, unknown>) => api.post('/api/v1/auth/register', body).then((res) => res.data),
  verifyTwoFactor: (body: { verifyKey: string; otpCode: string }) =>
    api.post('/api/v1/auth/verify-2fa', body).then((res) => res.data),
};

export const chatsAPI = {
  getFeed: () => api.get('/api/v1/chats').then((res) => res.data),
  getHistory: (id: string, params?: { limit?: number; before?: string }) =>
    api.get(`/api/v1/chats/${id}/messages`, { params }).then((res) => res.data),
  createDirect: (targetUserId: string) => api.post('/api/v1/chats/direct', { targetUserId }).then((res) => res.data),
  createGroup: (body: { name: string; description?: string; participantIds: string[] }) =>
    api.post('/api/v1/chats/group', body).then((res) => res.data),
  getDetails: (conversationId: string) => api.get(`/api/v1/chats/${conversationId}/details`).then((res) => res.data),
};

export const messagesAPI = {
  send: (body: { conversationId: string; content: string; replyToMessageId?: string; messageType?: string }) =>
    api.post('/api/v1/messages', body).then((res) => res.data),
  search: (q: string) => api.get('/api/v1/messages/search', { params: { q } }).then((res) => res.data),
  react: (id: string, emoji: string) => api.post(`/api/v1/messages/${id}/react`, { emoji }).then((res) => res.data),
};

export const usersAPI = {
  getDirectory: () => api.get('/api/v1/users/directory').then((res) => res.data),
  updateProfile: (body: Record<string, unknown>) => api.patch('/api/v1/users/profile', body).then((res) => res.data),
};

export const notificationsAPI = {
  getAll: (page = 1, limit = 30) => api.get(`/api/v1/notifications?page=${page}&limit=${limit}`).then((res) => res.data),
  markRead: (id: string) => api.patch(`/api/v1/notifications/${id}/read`).then((res) => res.data),
  markAllRead: () => api.patch('/api/v1/notifications/read-all').then((res) => res.data),
};

export const tasksAPI = {
  getMine: () => api.get('/api/v1/tasks?scope=mine').then((res) => res.data),
  getWorkspace: () => api.get('/api/v1/tasks?scope=workspace').then((res) => res.data),
  create: (body: { conversationId: string; title: string; assigneeIds?: string[]; dueDate?: string | null }) =>
    api.post('/api/v1/tasks', body).then((res) => res.data),
  update: (id: string, body: { complete?: boolean; status?: string }) =>
    api.patch(`/api/v1/tasks/${id}`, body).then((res) => res.data),
};

export const filesAPI = {
  getWorkspace: (search?: string) => api.get('/api/v1/files', { params: { search } }).then((res) => res.data),
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
  getEvents: (params?: { start?: string; end?: string }) => api.get('/api/v1/calendar', { params }).then((res) => res.data),
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
  deleteEvent: (id: string) => api.delete(`/api/v1/calendar/${id}`).then((res) => res.data),
  sendInvites: (id: string, attendeeIds?: string[]) =>
    api.post(`/api/v1/calendar/${id}/invites`, { attendeeIds }).then((res) => res.data),
};

export const appsAPI = {
  getAll: () => api.get('/api/v1/apps').then((res) => res.data),
  toggle: (id: string) => api.patch(`/api/v1/apps/${id}/toggle`).then((res) => res.data),
};

export const dashboardAPI = {
  get: () => api.get('/api/v1/dashboard').then((res) => res.data),
};
