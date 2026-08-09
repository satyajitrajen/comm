import { io, Socket } from 'socket.io-client';
import { useAppStore } from '../store/useAppStore';

let socket: Socket | null = null;

export const initializeSocket = () => {
  const backendUrl = useAppStore.getState().backendUrl;
  const token = localStorage.getItem('auth_token');

  if (socket) {
    socket.disconnect();
  }

  socket = io(backendUrl, {
    path: '/socket.io',
    transports: ['websocket', 'polling'],
    auth: {
      token: token || '',
    },
    autoConnect: true,
  });

  socket.on('connect', () => {
    console.log('[Socket.IO] Connected to backend gateway');
    useAppStore.getState().setIsConnected(true);
  });

  socket.on('disconnect', () => {
    console.log('[Socket.IO] Disconnected');
    useAppStore.getState().setIsConnected(false);
  });

  socket.on('message:new', (data) => {
    console.log('[Socket.IO] New message received:', data);
    useAppStore.getState().addMessage(data.channelId, data);
    
    // Trigger native notification if window not focused
    if (window.electronAPI) {
      window.electronAPI.sendNotification(`New Message from ${data.senderName}`, {
        body: data.content,
      });
    }
  });

  socket.on('call:incoming', (data) => {
    console.log('[Socket.IO] Incoming call:', data);
    useAppStore.getState().receiveIncomingCall(data.callerName, data.callType || 'video');

    if (window.electronAPI) {
      window.electronAPI.sendNotification(`Incoming ${data.callType || 'Video'} Call`, {
        body: `${data.callerName} is calling you...`,
      });
    }
  });

  return socket;
};

export const getSocket = () => socket;
