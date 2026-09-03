'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Socket } from 'socket.io-client';
import { useCallStore } from '../store/useCallStore';
import type { CallConversationType } from '../lib/callRoom';
import { sendDesktopNotification } from '../lib/desktopRuntime';
import { getAppSocket } from '../lib/socket';

export type IncomingCall = {
  conversationId: string;
  roomName: string;
  callerId: string;
  callerName: string;
  conversationName: string;
  conversationType?: CallConversationType;
};

/**
 * Manages outgoing call invitations and incoming call events via WebSocket.
 * Uses the shared app socket — does not open or close the connection.
 */
export function useCallSignaling(activeConversationId?: string) {
  const socketRef = useRef<Socket | null>(null);
  const activeConversationIdRef = useRef<string | undefined>(activeConversationId);
  const [incomingCall, setIncomingCall] = useState<IncomingCall | null>(null);

  useEffect(() => {
    activeConversationIdRef.current = activeConversationId;
  }, [activeConversationId]);

  /** Close the local call/outgoing state only when it belongs to the event's conversation. */
  const closeCallIfMatching = (conversationId: string) => {
    const store = useCallStore.getState();
    const current = store.activeCall ?? store.outgoingCall;
    if (current && current.conversationId !== conversationId) return;
    setIncomingCall(null);
    store.endCall();
  };

  useEffect(() => {
    const socket = getAppSocket();
    if (!socket) return;
    socketRef.current = socket;

    const joinIfNeeded = () => {
      const cid = activeConversationIdRef.current;
      if (cid) {
        socket.emit('room.join', { conversationId: cid });
      }
    };

    const onIncoming = (data: IncomingCall) => {
      const store = useCallStore.getState();
      if (store.activeCall) {
        const sameCall =
          store.activeCall.conversationId === data.conversationId ||
          store.activeCall.roomName === data.roomName;
        if (!sameCall) {
          socket.emit('call.decline', {
            conversationId: data.conversationId,
            callerId: data.callerId,
          });
        }
        return;
      }

      setIncomingCall(data);

      sendDesktopNotification(`Incoming call from ${data.callerName}`, {
        body: `In ${data.conversationName}`,
        tag: `call-${data.conversationId}`,
      });

      if ('Notification' in window && Notification.permission === 'granted') {
        const n = new Notification(`📹 Incoming call from ${data.callerName}`, {
          body: `In ${data.conversationName} — tap to open`,
          icon: '/favicon.ico',
          tag: `call-${data.conversationId}`,
          requireInteraction: true,
        });
        n.onclick = () => {
          window.focus();
          n.close();
        };
      }
    };

    const onAccepted = (data: {
      conversationId: string;
      roomName?: string;
      conversationName?: string;
    }) => {
      setIncomingCall(null);
      const store = useCallStore.getState();
      if (!store.outgoingCall) return;
      if (data?.conversationId && data.conversationId !== store.outgoingCall.conversationId) return;
      store.startCall({
        conversationId: data?.conversationId || store.outgoingCall.conversationId,
        roomName: data?.roomName || store.outgoingCall.roomName,
        conversationName: data?.conversationName || store.outgoingCall.conversationName,
      });
    };

    const onDeclined = (data: { conversationId: string; declinedByName?: string }) => {
      setIncomingCall(null);
      const store = useCallStore.getState();
      if (data?.conversationId && store.outgoingCall?.conversationId !== data.conversationId) return;
      store.clearOutgoingCall();
      const notice = data?.declinedByName ? `Call declined by ${data.declinedByName}` : 'Call declined';
      store.setCallNotice(notice);
      setTimeout(() => useCallStore.getState().setCallNotice(null), 4000);
    };

    const onMessageSent = (msg: { conversationId?: string; messageType?: string }) => {
      if (msg?.messageType === 'SYSTEM_CALL_DECLINE') {
        const store = useCallStore.getState();
        if (msg.conversationId && store.outgoingCall?.conversationId !== msg.conversationId) return;
        store.clearOutgoingCall();
      }
    };

    const onEnded = (data: { conversationId: string }) => {
      closeCallIfMatching(data.conversationId);
    };

    const onLeft = (data: { conversationId: string }) => {
      closeCallIfMatching(data.conversationId);
    };

    const onCancelled = (data: { conversationId: string }) => {
      closeCallIfMatching(data.conversationId);
    };

    const onEscalated = (data: {
      roomName?: string;
      conversationId: string;
      conversationName?: string;
    }) => {
      const store = useCallStore.getState();
      if (store.activeCall && (!data.roomName || store.activeCall.roomName === data.roomName)) {
        store.updateConversationId(data.conversationId, data.conversationName);
        store.setCallNotice(`Call upgraded to group: ${data.conversationName || 'Group Call'}`);
        setTimeout(() => useCallStore.getState().setCallNotice(null), 4000);
      }
    };

    const onJoined = (data: {
      conversationId: string;
      joinedBy: string;
      roomName: string;
      conversationName?: string;
    }) => {
      const store = useCallStore.getState();
      if (store.activeCall && store.activeCall.roomName === data.roomName) {
        store.setCallNotice('A participant joined the call');
        setTimeout(() => useCallStore.getState().setCallNotice(null), 3000);
      }
    };

    const onDisconnect = () => {
      setIncomingCall(null);
    };

    const handleBeforeUnload = () => {
      const store = useCallStore.getState();
      const activeCall = store.activeCall;
      if (activeCall) {
        socket.emit('call.end', {
          conversationId: activeCall.conversationId,
          roomName: activeCall.roomName,
        });
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    const handlePageHide = (e: PageTransitionEvent) => {
      if (e.persisted) return;
      handleBeforeUnload();
    };
    window.addEventListener('pagehide', handlePageHide);

    socket.on('connect', joinIfNeeded);
    socket.on('call.incoming', onIncoming);
    socket.on('call.accepted', onAccepted);
    socket.on('call.declined', onDeclined);
    socket.on('message.sent', onMessageSent);
    socket.on('call.ended', onEnded);
    socket.on('call.left', onLeft);
    socket.on('call.cancelled', onCancelled);
    socket.on('call.escalated', onEscalated);
    socket.on('call.joined', onJoined);
    socket.on('disconnect', onDisconnect);

    if (socket.connected) {
      joinIfNeeded();
    }

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('pagehide', handlePageHide);
      socket.off('connect', joinIfNeeded);
      socket.off('call.incoming', onIncoming);
      socket.off('call.accepted', onAccepted);
      socket.off('call.declined', onDeclined);
      socket.off('message.sent', onMessageSent);
      socket.off('call.ended', onEnded);
      socket.off('call.left', onLeft);
      socket.off('call.cancelled', onCancelled);
      socket.off('call.escalated', onEscalated);
      socket.off('call.joined', onJoined);
      socket.off('disconnect', onDisconnect);
      socketRef.current = null;
    };
  }, []);

  useEffect(() => {
    const socket = socketRef.current ?? getAppSocket();
    const id = activeConversationId;
    if (!socket?.connected || !id) return;

    socket.emit('room.join', { conversationId: id });

    return () => {
      if (socket.connected) {
        socket.emit('room.leave', { conversationId: id });
      }
    };
  }, [activeConversationId]);

  const inviteToCall = useCallback(
    (
      conversationId: string,
      roomName: string,
      callerName: string,
      conversationName: string,
    ) => {
      (socketRef.current ?? getAppSocket())?.emit('call.invite', {
        conversationId,
        roomName,
        callerName,
        conversationName,
      });
    },
    [],
  );

  const acceptCall = useCallback(
    (
      conversationId: string,
      callerId: string,
      roomName: string,
      conversationName: string,
    ) => {
      (socketRef.current ?? getAppSocket())?.emit('call.accept', {
        conversationId,
        callerId,
        roomName,
        conversationName,
      });
      setIncomingCall(null);
    },
    [],
  );

  const declineCall = useCallback((conversationId: string, callerId: string) => {
    (socketRef.current ?? getAppSocket())?.emit('call.decline', { conversationId, callerId });
    setIncomingCall(null);
  }, []);

  const cancelCall = useCallback(
    (conversationId: string, roomName: string, callerName: string) => {
      (socketRef.current ?? getAppSocket())?.emit('call.cancel', {
        conversationId,
        roomName,
        callerName,
      });
    },
    [],
  );

  const joinCall = useCallback(
    (
      conversationId: string,
      roomName: string,
      conversationName: string,
      onJoined?: (actualRoomName: string, actualConversationId: string) => void,
    ) => {
      (socketRef.current ?? getAppSocket())?.emit(
        'call.join',
        { conversationId, roomName, conversationName },
        (response: { status: string; roomName?: string; conversationId?: string }) => {
          if (response?.status === 'joined' && onJoined) {
            onJoined(
              response.roomName || roomName,
              response.conversationId || conversationId,
            );
          }
        },
      );
    },
    [],
  );

  const endCall = useCallback((conversationId: string, roomName?: string) => {
    (socketRef.current ?? getAppSocket())?.emit('call.end', { conversationId, roomName });
  }, []);

  return {
    incomingCall,
    inviteToCall,
    acceptCall,
    declineCall,
    cancelCall,
    joinCall,
    endCall,
    socketRef,
  };
}
