'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { useCallStore } from '../store/useCallStore';
import type { CallConversationType } from '../lib/callRoom';
import { resolveServiceBaseUrl, sendDesktopNotification } from '../lib/desktopRuntime';

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
 * Returns helpers to invite, decline, cancel, join, and end a call, plus any
 * incoming call state.
 */
export function useCallSignaling(activeConversationId?: string) {
  const socketRef = useRef<Socket | null>(null);
  const activeConversationIdRef = useRef<string | undefined>(activeConversationId);
  const [incomingCall, setIncomingCall] = useState<IncomingCall | null>(null);

  activeConversationIdRef.current = activeConversationId;

  /** Close the local call/outgoing state only when it belongs to the event's conversation. */
  const closeCallIfMatching = (conversationId: string) => {
    const store = useCallStore.getState();
    const current = store.activeCall ?? store.outgoingCall;
    if (current && current.conversationId !== conversationId) return;
    setIncomingCall(null);
    store.endCall();
  };

  // One long-lived socket per hook instance (do not reconnect when conversation changes).
  useEffect(() => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('veloce_token') : null;
    if (!token) return;

    const socketUrl = resolveServiceBaseUrl();

    const socket = socketUrl ? io(socketUrl, { auth: { token } }) : io({ auth: { token } });
    socketRef.current = socket;

    const joinIfNeeded = () => {
      const cid = activeConversationIdRef.current;
      if (cid) {
        socket.emit('room.join', { conversationId: cid });
      }
    };

    socket.on('connect', joinIfNeeded);

    socket.on('call.incoming', (data: IncomingCall) => {
      const store = useCallStore.getState();
      // Reject new incoming calls while already in an active call,
      // but only if it's a genuinely different call.
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

      // Browser notification for incoming call
      if ('Notification' in window && Notification.permission === 'granted') {
        const n = new Notification(`📹 Incoming call from ${data.callerName}`, {
          body: `In ${data.conversationName} — tap to open`,
          icon: '/favicon.ico',
          tag: `call-${data.conversationId}`,
          requireInteraction: true, // stays until user interacts
        });
        n.onclick = () => {
          window.focus();
          n.close();
        };
      }
    });

    // Caller side: other user accepted
    socket.on('call.accepted', (data: { conversationId: string; roomName?: string; conversationName?: string }) => {
      setIncomingCall(null);
      const store = useCallStore.getState();
      if (!store.outgoingCall) return;
      if (data?.conversationId && data.conversationId !== store.outgoingCall.conversationId) return;
      store.startCall({
        conversationId: data?.conversationId || store.outgoingCall.conversationId,
        roomName: data?.roomName || store.outgoingCall.roomName,
        conversationName: data?.conversationName || store.outgoingCall.conversationName,
      });
    });

    // Caller side: other user declined
    socket.on('call.declined', (data: { conversationId: string; declinedByName?: string }) => {
      setIncomingCall(null);
      const store = useCallStore.getState();
      if (data?.conversationId && store.outgoingCall?.conversationId !== data.conversationId) return;
      store.clearOutgoingCall();
      const notice = data?.declinedByName ? `Call declined by ${data.declinedByName}` : 'Call declined';
      store.setCallNotice(notice);
      setTimeout(() => useCallStore.getState().setCallNotice(null), 4000);
    });

    socket.on('message.sent', (msg: { conversationId?: string; messageType?: string }) => {
      if (msg?.messageType === 'SYSTEM_CALL_DECLINE') {
        const store = useCallStore.getState();
        if (msg.conversationId && store.outgoingCall?.conversationId !== msg.conversationId) return;
        store.clearOutgoingCall();
      }
    });

    // Last participant left — the call is over for everyone in the conversation.
    socket.on('call.ended', (data: { conversationId: string }) => {
      closeCallIfMatching(data.conversationId);
    });

    // This user left but others remain — close only their own UI.
    socket.on('call.left', (data: { conversationId: string }) => {
      closeCallIfMatching(data.conversationId);
    });

    // Caller cancelled before anyone joined.
    socket.on('call.cancelled', (data: { conversationId: string }) => {
      closeCallIfMatching(data.conversationId);
    });

    // Call escalated from 2-person direct to 3+ person group call
    socket.on('call.escalated', (data: { roomName?: string; conversationId: string; conversationName?: string }) => {
      const store = useCallStore.getState();
      if (store.activeCall && (!data.roomName || store.activeCall.roomName === data.roomName)) {
        store.updateConversationId(data.conversationId, data.conversationName);
        store.setCallNotice(`Call upgraded to group: ${data.conversationName || 'Group Call'}`);
        setTimeout(() => useCallStore.getState().setCallNotice(null), 4000);
      }
    });

    // Another participant joined the active call.
    socket.on('call.joined', (data: { conversationId: string; joinedBy: string; roomName: string; conversationName?: string }) => {
      const store = useCallStore.getState();
      if (store.activeCall && store.activeCall.roomName === data.roomName) {
        store.setCallNotice('A participant joined the call');
        setTimeout(() => useCallStore.getState().setCallNotice(null), 3000);
      }
    });

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

    socket.on('disconnect', () => {
      setIncomingCall(null);
    });

    if (socket.connected) {
      joinIfNeeded();
    }

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('pagehide', handlePageHide);
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);

  // Join/leave conversation rooms when selection changes (without tearing down the socket).
  useEffect(() => {
    const socket = socketRef.current;
    const id = activeConversationId;
    if (!socket?.connected || !id) return;

    socket.emit('room.join', { conversationId: id });

    return () => {
      if (socket.connected) {
        socket.emit('room.leave', { conversationId: id });
      }
    };
  }, [activeConversationId]);

  /** Emit a call invitation to all participants in a conversation */
  const inviteToCall = useCallback(
    (
      conversationId: string,
      roomName: string,
      callerName: string,
      conversationName: string,
    ) => {
      socketRef.current?.emit('call.invite', {
        conversationId,
        roomName,
        callerName,
        conversationName,
      });
    },
    [],
  );

  /** Accept an incoming call */
  const acceptCall = useCallback(
    (
      conversationId: string,
      callerId: string,
      roomName: string,
      conversationName: string,
    ) => {
      socketRef.current?.emit('call.accept', {
        conversationId,
        callerId,
        roomName,
        conversationName,
      });
      setIncomingCall(null);
    },
    [],
  );

  /** Decline an incoming call */
  const declineCall = useCallback((conversationId: string, callerId: string) => {
    socketRef.current?.emit('call.decline', { conversationId, callerId });
    setIncomingCall(null);
  }, []);

  /** Cancel an outgoing (ringing) call without ending it for others */
  const cancelCall = useCallback(
    (conversationId: string, roomName: string, callerName: string) => {
      socketRef.current?.emit('call.cancel', { conversationId, roomName, callerName });
    },
    [],
  );

  /** Join an already-live call (e.g. from a Join Call button).
   *  The server returns the actual roomName (important for escalated calls). */
  const joinCall = useCallback(
    (
      conversationId: string,
      roomName: string,
      conversationName: string,
      onJoined?: (actualRoomName: string, actualConversationId: string) => void,
    ) => {
      socketRef.current?.emit(
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

  /** Leave an ongoing call */
  const endCall = useCallback((conversationId: string, roomName?: string) => {
    socketRef.current?.emit('call.end', { conversationId, roomName });
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
