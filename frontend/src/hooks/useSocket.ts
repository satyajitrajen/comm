import { useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { useChatStore, Message } from '../store/useChatStore';
import { resolveServiceBaseUrl } from '../lib/desktopRuntime';

interface DeliveryReceipt {
  messageId: string;
  recipientId: string;
}

interface ReadReceipt {
  conversationId: string;
  readerId: string;
  messageIds: string[];
}

interface EditEvent {
  messageId: string;
  content: string;
  isEdited: boolean;
  updatedAt: string;
}

interface DeleteEvent {
  messageId: string;
  content: string;
  isDeletedGlobally: boolean;
}

interface ReactEvent {
  messageId: string;
  action: 'ADDED' | 'REMOVED';
  userId: string;
  emoji: string;
}

interface TypingEvent {
  conversationId: string;
  userId: string;
  isTyping: boolean;
}

interface PresenceEvent {
  userId: string;
  status: 'ONLINE' | 'OFFLINE';
}

interface TaskCreatedEvent {
  messageId: string;
  title: string;
  assignees: Array<{ userId: string }>;
  dueDate?: string;
  priority?: string;
}

interface PollVotedEvent {
  messageId: string;
  question: string;
  options: Array<{ id: string; text: string }>;
  votes: Array<{ userId: string; optionId: string }>;
}

export const useSocket = () => {
  const socketRef = useRef<Socket | null>(null);
  const activeConversationIdRef = useRef<string | null>(null);
  const {
    accessToken,
    user,
    activeConversationId,
    addMessage,
    updateMessage,
    setTyping,
    setOnline,
  } = useChatStore();

  useEffect(() => {
    activeConversationIdRef.current = activeConversationId;
  }, [activeConversationId]);

  useEffect(() => {
    if (!accessToken || !user) {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      return;
    }

    const socketUrl = resolveServiceBaseUrl();
    const socketInstance = socketUrl
      ? io(socketUrl, { auth: { token: accessToken } })
      : io({ auth: { token: accessToken } });

    socketRef.current = socketInstance;

    socketInstance.on('connect', () => {
      const conv = activeConversationIdRef.current;
      if (conv) {
        socketInstance.emit('room.join', { conversationId: conv });
      }
    });

    socketInstance.on('message.sent', (message: Message) => {
      addMessage(message);

      if (message.senderId !== user.id) {
        socketInstance.emit('receipt.delivered', {
          conversationId: message.conversationId,
          messageId: message.id,
        });

        if (activeConversationIdRef.current === message.conversationId) {
          socketInstance.emit('receipt.read', {
            conversationId: message.conversationId,
            messageIds: [message.id],
          });
        }
      }
    });

    socketInstance.on('message.delivered', (receipt: DeliveryReceipt) => {
      updateMessage({
        id: receipt.messageId,
        deliveries: [{ userId: receipt.recipientId }],
      });
    });

    socketInstance.on('message.read', (receipt: ReadReceipt) => {
      receipt.messageIds.forEach((messageId) => {
        updateMessage({
          id: messageId,
          reads: [{ userId: receipt.readerId }],
        });
      });
    });

    socketInstance.on('message.edited', (edit: EditEvent) => {
      updateMessage({
        id: edit.messageId,
        content: edit.content,
        isEdited: edit.isEdited,
        updatedAt: edit.updatedAt,
      });
    });

    socketInstance.on('message.deleted', (del: DeleteEvent) => {
      updateMessage({
        id: del.messageId,
        content: del.content,
        isDeletedGlobally: del.isDeletedGlobally,
      });
    });

    socketInstance.on('message.reacted', (react: ReactEvent) => {
      const storeState = useChatStore.getState();
      const message = storeState.messages.find((m) => m.id === react.messageId);
      if (message) {
        let updatedReactions = [...(message.reactions || [])];
        if (react.action === 'ADDED') {
          updatedReactions = updatedReactions.filter(
            (r) => !(r.userId === react.userId && r.emoji === react.emoji),
          );
          updatedReactions.push({
            id: Math.random().toString(),
            userId: react.userId,
            emoji: react.emoji,
          });
        } else {
          updatedReactions = updatedReactions.filter(
            (r) => !(r.userId === react.userId && r.emoji === react.emoji),
          );
        }
        updateMessage({
          id: react.messageId,
          reactions: updatedReactions,
        });
      }
    });

    socketInstance.on('user.typing', (data: TypingEvent) => {
      setTyping(data.conversationId, data.userId, data.isTyping);
    });

    socketInstance.on('user.presence', (data: PresenceEvent) => {
      setOnline(data.userId, data.status === 'ONLINE');
    });

    socketInstance.on('task.created', (task: TaskCreatedEvent) => {
      updateMessage({
        id: task.messageId,
        messageType: 'TASK',
        tasks: task,
      });
    });

    socketInstance.on('poll.created', (pollMessage: Message) => {
      addMessage(pollMessage);
    });

    socketInstance.on('poll.voted', (poll: PollVotedEvent) => {
      updateMessage({
        id: poll.messageId,
        polls: poll,
      });
    });

    return () => {
      socketInstance.disconnect();
      socketRef.current = null;
    };
    // Intentionally omit activeConversationId: room join/leave handled in a separate effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, user?.id, addMessage, updateMessage, setTyping, setOnline]);

  useEffect(() => {
    if (socketRef.current && activeConversationId) {
      socketRef.current.emit('room.join', { conversationId: activeConversationId });
    }
    return () => {
      if (socketRef.current && activeConversationId) {
        socketRef.current.emit('room.leave', { conversationId: activeConversationId });
      }
    };
  }, [activeConversationId]);

  const emitTyping = (conversationId: string, isTyping: boolean) => {
    if (socketRef.current) {
      socketRef.current.emit('user.typing', { conversationId, isTyping });
    }
  };

  const emitRead = (conversationId: string, messageIds: string[]) => {
    if (socketRef.current && messageIds.length > 0) {
      socketRef.current.emit('receipt.read', { conversationId, messageIds });
    }
  };

  return {
    emitTyping,
    emitRead,
  };
};
