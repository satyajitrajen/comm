import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
  WsException,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../prisma.service';
import { getJwtSecret } from '../../config/jwt';
import { isCorsOriginAllowed } from '../../config/cors-origins';
import { PresenceService } from '../../common/presence.service';

interface CustomSocket extends Socket {
  data: {
    userId?: string;
  };
}

type ActiveCall = {
  roomName: string;
  conversationId: string;
  participants: Set<string>;
  startedAt: Date;
};

type CallIncomingPayload = {
  conversationId: string;
  roomName: string;
  callerId: string;
  callerName: string;
  conversationName: string;
  conversationType: 'DIRECT' | 'TEAM' | 'GROUP';
};

type CallAcceptedPayload = {
  conversationId: string;
  acceptedBy: string;
  roomName: string;
  conversationName: string;
};

type CallEndedPayload = {
  conversationId: string;
  endedBy: string;
};

@WebSocketGateway({
  cors: {
    origin: (origin, callback) => {
      if (isCorsOriginAllowed(origin)) {
        callback(null, true);
      } else {
        callback(
          new Error(`CORS policy: origin ${origin ?? '(none)'} not allowed`),
        );
      }
    },
    credentials: true,
  },
})
export class RealtimeGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(RealtimeGateway.name);

  /** In-memory registry of live calls, keyed by Jitsi room name. */
  private activeCalls = new Map<string, ActiveCall>();

  constructor(
    private jwtService: JwtService,
    private prisma: PrismaService,
    private presence: PresenceService,
  ) {}

  async handleConnection(client: CustomSocket) {
    try {
      const auth = client.handshake.auth as Record<string, unknown> | undefined;
      const query = client.handshake.query as
        | Record<string, unknown>
        | undefined;
      const token = (auth?.token || query?.token) as string | undefined;
      if (!token) {
        client.disconnect();
        return;
      }

      const verified: unknown = await this.jwtService.verifyAsync(token, {
        secret: getJwtSecret(),
      });
      const payload = verified as { sub?: string };

      const userId = payload.sub;
      if (!userId) {
        client.disconnect();
        return;
      }
      client.data.userId = userId;
      const cameOnline = this.presence.connect(userId, client.id);

      await client.join(`user:${userId}`);

      // lastSeen is genuinely durable, so it is the only thing written here.
      // Presence itself lives in PresenceService, and the user's declared
      // availability is theirs alone to change.
      await this.prisma.userProfile.updateMany({
        where: { userId },
        data: { lastSeen: new Date() },
      });

      // Only announce on the offline -> online edge; extra tabs are a no-op.
      if (cameOnline) {
        this.server.emit('user.presence', {
          userId,
          status: 'ONLINE',
          lastSeen: null,
        });
      }

      this.logger.log(
        `[WS CONNECTED] User ${userId} connected on socket ${client.id}`,
      );
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : 'Unknown error';
      this.logger.warn(`[WS CONNECTION ERROR] ${errMsg}`);
      client.disconnect();
    }
  }

  async handleDisconnect(client: CustomSocket) {
    const userId = client.data.userId;
    if (userId) {
      // Only the very last socket closing takes the user offline; multi-tab
      // users would otherwise flicker offline on any single tab refresh.
      const wentOffline = this.presence.disconnect(userId, client.id);

      if (wentOffline) {
        const lastSeen = new Date();
        await this.prisma.userProfile.updateMany({
          where: { userId },
          data: { lastSeen },
        });

        this.server.emit('user.presence', {
          userId,
          status: 'OFFLINE',
          lastSeen: lastSeen.toISOString(),
        });
      }

      this.logger.log(
        `[WS DISCONNECTED] User ${userId} left socket ${client.id}`,
      );
    }
  }

  private async ensureConversationParticipant(
    conversationId: string,
    userId: string,
  ) {
    const participant = await this.prisma.conversationParticipant.findFirst({
      where: { conversationId, userId },
      select: { id: true },
    });

    if (!participant) {
      throw new WsException('Conversation not found or access denied');
    }
  }

  private async ensureMessagesInConversation(
    conversationId: string,
    messageIds: string[],
  ) {
    const uniqueIds = Array.from(new Set(messageIds));

    if (uniqueIds.length === 0) {
      return;
    }

    const count = await this.prisma.message.count({
      where: {
        id: { in: uniqueIds },
        conversationId,
      },
    });

    if (count !== uniqueIds.length) {
      throw new WsException('Message not found or access denied');
    }
  }

  @SubscribeMessage('room.join')
  async handleJoinRoom(
    @MessageBody() data: { conversationId: string },
    @ConnectedSocket() client: CustomSocket,
  ) {
    const userId = client.data.userId;
    if (!userId) throw new WsException('Authentication required');

    await this.ensureConversationParticipant(data.conversationId, userId);

    const room = `conversation:${data.conversationId}`;
    await client.join(room);
    this.logger.log(`[WS ROOM JOIN] Client ${client.id} joined room ${room}`);
    return { status: 'joined', room };
  }

  @SubscribeMessage('room.leave')
  async handleLeaveRoom(
    @MessageBody() data: { conversationId: string },
    @ConnectedSocket() client: CustomSocket,
  ) {
    const room = `conversation:${data.conversationId}`;
    await client.leave(room);
    this.logger.log(`[WS ROOM LEAVE] Client ${client.id} left room ${room}`);
    return { status: 'left', room };
  }

  @SubscribeMessage('user.typing')
  async handleTyping(
    @MessageBody() data: { conversationId: string; isTyping: boolean },
    @ConnectedSocket() client: CustomSocket,
  ) {
    const userId = client.data.userId;
    if (!userId) throw new WsException('Authentication required');

    await this.ensureConversationParticipant(data.conversationId, userId);

    const room = `conversation:${data.conversationId}`;
    client.to(room).emit('user.typing', {
      conversationId: data.conversationId,
      userId,
      isTyping: data.isTyping,
    });
  }

  @SubscribeMessage('receipt.delivered')
  async handleDeliveredReceipt(
    @MessageBody() data: { conversationId: string; messageId: string },
    @ConnectedSocket() client: CustomSocket,
  ) {
    const userId = client.data.userId;
    if (!userId) throw new WsException('Authentication required');

    await this.ensureConversationParticipant(data.conversationId, userId);
    await this.ensureMessagesInConversation(data.conversationId, [
      data.messageId,
    ]);

    try {
      await this.prisma.messageDelivery.upsert({
        where: {
          messageId_userId: {
            messageId: data.messageId,
            userId,
          },
        },
        create: {
          messageId: data.messageId,
          userId,
        },
        update: {},
      });

      const room = `conversation:${data.conversationId}`;
      client.to(room).emit('message.delivered', {
        messageId: data.messageId,
        conversationId: data.conversationId,
        recipientId: userId,
        deliveredAt: new Date().toISOString(),
      });
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : 'Unknown error';
      this.logger.error(`[WS RECEIPT DELIVERED ERROR] ${errMsg}`);
    }
  }

  @SubscribeMessage('receipt.read')
  async handleReadReceipt(
    @MessageBody() data: { conversationId: string; messageIds: string[] },
    @ConnectedSocket() client: CustomSocket,
  ) {
    const userId = client.data.userId;
    if (!userId) throw new WsException('Authentication required');

    await this.ensureConversationParticipant(data.conversationId, userId);
    await this.ensureMessagesInConversation(
      data.conversationId,
      data.messageIds,
    );

    try {
      await this.prisma.$transaction(
        data.messageIds.map((msgId) =>
          this.prisma.messageRead.upsert({
            where: {
              messageId_userId: {
                messageId: msgId,
                userId,
              },
            },
            create: {
              messageId: msgId,
              userId,
            },
            update: {},
          }),
        ),
      );

      const room = `conversation:${data.conversationId}`;
      client.to(room).emit('message.read', {
        conversationId: data.conversationId,
        readerId: userId,
        readAt: new Date().toISOString(),
        messageIds: data.messageIds,
      });
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : 'Unknown error';
      this.logger.error(`[WS RECEIPT READ ERROR] ${errMsg}`);
    }
  }

  // Method to easily broadcast message events from HTTP REST controllers
  broadcastToRoom(room: string, event: string, payload: unknown) {
    this.server.to(room).emit(event, payload);
  }

  /** Notify other participants (for background tabs / AppShell) without requiring conversation socket rooms. */
  async emitMessageNotifyToParticipants(
    conversationId: string,
    senderId: string,
    message: unknown,
  ) {
    const conv = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: {
        type: true,
        participants: { select: { userId: true } },
      },
    });
    if (!conv) return;
    const recipients = conv.participants
      .map((p) => p.userId)
      .filter((id) => id !== senderId);
    const payload = { message, conversationType: conv.type };
    for (const uid of recipients) {
      this.server.to(`user:${uid}`).emit('message.notify', payload);
    }
  }

  // ── Call Signaling ────────────────────────────────────────────────────────

  private async getUserDisplayName(userId: string): Promise<string> {
    const profile = await this.prisma.userProfile.findFirst({
      where: { userId },
      select: { displayName: true },
    });
    return profile?.displayName || 'Someone';
  }

  private async postCallMessage(
    conversationId: string,
    senderId: string,
    content: string,
    messageType: string,
  ) {
    try {
      const msg = await this.prisma.message.create({
        data: {
          conversationId,
          senderId,
          content,
          messageType,
        },
        include: {
          sender: { include: { profile: true } },
          reads: true,
          deliveries: true,
          reactions: true,
          attachments: { include: { file: true } },
        },
      });
      const room = `conversation:${conversationId}`;
      this.server.to(room).emit('message.sent', msg);
      void this.emitMessageNotifyToParticipants(conversationId, senderId, msg);
    } catch {
      /* non-critical */
    }
  }

  private getActiveCallByConversation(
    conversationId: string,
  ): ActiveCall | undefined {
    for (const call of this.activeCalls.values()) {
      if (call.conversationId === conversationId) return call;
    }
    return undefined;
  }

  private removeUserFromCall(userId: string, roomName?: string) {
    const call = roomName ? this.activeCalls.get(roomName) : undefined;
    if (!call) return undefined;
    call.participants.delete(userId);
    if (call.participants.size === 0) {
      this.activeCalls.delete(call.roomName);
    }
    return call;
  }

  @SubscribeMessage('call.invite')
  async handleCallInvite(
    @MessageBody()
    data: {
      conversationId: string;
      roomName: string;
      callerName: string;
      conversationName: string;
    },
    @ConnectedSocket() client: CustomSocket,
  ) {
    const userId = client.data.userId;
    if (!userId) throw new WsException('Authentication required');

    await this.ensureConversationParticipant(data.conversationId, userId);

    const conversation = await this.prisma.conversation.findUnique({
      where: { id: data.conversationId },
      select: { type: true },
    });

    const existing = this.activeCalls.get(data.roomName);
    if (!existing) {
      this.activeCalls.set(data.roomName, {
        roomName: data.roomName,
        conversationId: data.conversationId,
        participants: new Set([userId]),
        startedAt: new Date(),
      });
    } else {
      existing.participants.add(userId);
    }

    const participants = await this.prisma.conversationParticipant.findMany({
      where: { conversationId: data.conversationId },
      select: { userId: true },
    });

    const payload: CallIncomingPayload = {
      conversationId: data.conversationId,
      roomName: data.roomName,
      callerId: userId,
      callerName: data.callerName,
      conversationName: data.conversationName,
      conversationType:
        (conversation?.type as 'DIRECT' | 'TEAM' | 'GROUP' | undefined) ??
        'DIRECT',
    };

    for (const { userId: pid } of participants) {
      if (pid === userId) continue;
      this.server.to(`user:${pid}`).emit('call.incoming', payload);
    }

    // Only post a "started" transcript when this is a brand-new call.
    if (!existing) {
      await this.postCallMessage(
        data.conversationId,
        userId,
        `📹 ${data.callerName} started a video call`,
        'SYSTEM_CALL_START',
      );
    }

    this.logger.log(
      `[CALL INVITE] ${userId} invited conversation ${data.conversationId}`,
    );
    return { status: 'invited' };
  }

  @SubscribeMessage('call.decline')
  async handleCallDecline(
    @MessageBody() data: { conversationId: string; callerId: string },
    @ConnectedSocket() client: CustomSocket,
  ) {
    const userId = client.data.userId;
    if (!userId) throw new WsException('Authentication required');

    await this.ensureConversationParticipant(data.conversationId, userId);
    const callerParticipant =
      await this.prisma.conversationParticipant.findFirst({
        where: { conversationId: data.conversationId, userId: data.callerId },
        select: { id: true },
      });
    if (!callerParticipant) {
      throw new WsException('Invalid call target');
    }

    const declinerName = await this.getUserDisplayName(userId);

    // Remove decliner from any active call in this conversation.
    const call = this.getActiveCallByConversation(data.conversationId);
    call?.participants.delete(userId);
    if (call && call.participants.size === 0) {
      this.activeCalls.delete(call.roomName);
    }

    // Post a system call-declined message so it stays in chat transcript history
    try {
      const msg = await this.prisma.message.create({
        data: {
          conversationId: data.conversationId,
          senderId: userId,
          content: `📹 Call declined by ${declinerName}`,
          messageType: 'SYSTEM_CALL_DECLINE',
        },
        include: {
          sender: { include: { profile: true } },
          reads: true,
          deliveries: true,
          reactions: true,
          attachments: { include: { file: true } },
        },
      });
      const room = `conversation:${data.conversationId}`;
      this.server.to(room).emit('message.sent', msg);
      void this.emitMessageNotifyToParticipants(
        data.conversationId,
        userId,
        msg,
      );
    } catch {
      /* non-critical */
    }

    const declinedPayload = {
      conversationId: data.conversationId,
      declinedBy: userId,
      declinedByName: declinerName,
    };

    this.server
      .to(`user:${data.callerId}`)
      .emit('call.declined', declinedPayload);
    const room = `conversation:${data.conversationId}`;
    this.server.to(room).emit('call.declined', declinedPayload);

    return { status: 'declined' };
  }

  @SubscribeMessage('call.accept')
  async handleCallAccept(
    @MessageBody()
    data: {
      conversationId: string;
      callerId: string;
      roomName: string;
      conversationName: string;
    },
    @ConnectedSocket() client: CustomSocket,
  ) {
    const userId = client.data.userId;
    if (!userId) throw new WsException('Authentication required');

    await this.ensureConversationParticipant(data.conversationId, userId);

    // Caller must actually be a participant of this conversation.
    const callerParticipant =
      await this.prisma.conversationParticipant.findFirst({
        where: { conversationId: data.conversationId, userId: data.callerId },
        select: { id: true },
      });
    if (!callerParticipant) {
      throw new WsException('Invalid call target');
    }

    let call = this.activeCalls.get(data.roomName);
    if (!call) {
      call = {
        roomName: data.roomName,
        conversationId: data.conversationId,
        participants: new Set([data.callerId, userId]),
        startedAt: new Date(),
      };
      this.activeCalls.set(data.roomName, call);
    } else {
      call.participants.add(userId);
    }

    const payload: CallAcceptedPayload = {
      conversationId: data.conversationId,
      acceptedBy: userId,
      roomName: data.roomName,
      conversationName: data.conversationName,
    };

    this.server.to(`user:${data.callerId}`).emit('call.accepted', payload);
    const room = `conversation:${data.conversationId}`;
    this.server.to(room).emit('call.accepted', payload);

    return { status: 'accepted' };
  }

  @SubscribeMessage('call.join')
  async handleCallJoin(
    @MessageBody()
    data: {
      conversationId: string;
      roomName: string;
      conversationName: string;
    },
    @ConnectedSocket() client: CustomSocket,
  ) {
    const userId = client.data.userId;
    if (!userId) throw new WsException('Authentication required');

    await this.ensureConversationParticipant(data.conversationId, userId);

    let call = this.activeCalls.get(data.roomName);
    if (!call) {
      call = {
        roomName: data.roomName,
        conversationId: data.conversationId,
        participants: new Set([userId]),
        startedAt: new Date(),
      };
      this.activeCalls.set(data.roomName, call);
    } else {
      call.participants.add(userId);
    }

    const joinedPayload = {
      conversationId: data.conversationId,
      joinedBy: userId,
      roomName: data.roomName,
      conversationName: data.conversationName,
    };

    const room = `conversation:${data.conversationId}`;
    this.server.to(room).emit('call.joined', joinedPayload);

    this.logger.log(`[CALL JOIN] ${userId} joined call ${data.roomName}`);
    return { status: 'joined' };
  }

  @SubscribeMessage('call.cancel')
  async handleCallCancel(
    @MessageBody()
    data: { conversationId: string; roomName: string; callerName: string },
    @ConnectedSocket() client: CustomSocket,
  ) {
    const userId = client.data.userId;
    if (!userId) throw new WsException('Authentication required');

    await this.ensureConversationParticipant(data.conversationId, userId);

    this.removeUserFromCall(userId, data.roomName);
    const callerName =
      data.callerName || (await this.getUserDisplayName(userId));

    await this.postCallMessage(
      data.conversationId,
      userId,
      `📹 ${callerName} cancelled the call`,
      'SYSTEM_CALL_END',
    );

    const cancelledPayload = {
      conversationId: data.conversationId,
      cancelledBy: userId,
      roomName: data.roomName,
    };

    this.server
      .to(`conversation:${data.conversationId}`)
      .emit('call.cancelled', cancelledPayload);

    this.logger.log(`[CALL CANCEL] ${userId} cancelled call ${data.roomName}`);
    return { status: 'cancelled' };
  }

  @SubscribeMessage('call.end')
  async handleCallEnd(
    @MessageBody() data: { conversationId: string; roomName?: string },
    @ConnectedSocket() client: CustomSocket,
  ) {
    const userId = client.data.userId;
    if (!userId) throw new WsException('Authentication required');

    await this.ensureConversationParticipant(data.conversationId, userId);

    let call = data.roomName ? this.activeCalls.get(data.roomName) : undefined;
    if (!call) call = this.getActiveCallByConversation(data.conversationId);

    const room = `conversation:${data.conversationId}`;
    const endedPayload: CallEndedPayload = {
      conversationId: data.conversationId,
      endedBy: userId,
    };

    // No tracked call: just close this user's UI.
    if (!call) {
      this.server.to(`user:${userId}`).emit('call.left', endedPayload);
      return { status: 'ended' };
    }

    call.participants.delete(userId);
    const isLast = call.participants.size === 0;
    if (isLast) this.activeCalls.delete(call.roomName);

    const leaverName = await this.getUserDisplayName(userId);

    if (isLast) {
      await this.postCallMessage(
        data.conversationId,
        userId,
        `📹 ${leaverName} ended the video call`,
        'SYSTEM_CALL_END',
      );
      this.server.to(room).emit('call.ended', endedPayload);
    } else {
      // Call continues for the remaining participants.
      this.server.to(`user:${userId}`).emit('call.left', endedPayload);
    }

    this.logger.log(
      `[CALL END] ${userId} left call ${call.roomName} (${call.participants.size} remaining)`,
    );
    return { status: 'ended' };
  }

  sendNotificationToUser(userId: string, event: string, data: unknown) {
    this.server.to(`user:${userId}`).emit(event, data);
  }

  sendNotificationToUsers(userIds: string[], event: string, data: unknown) {
    for (const userId of userIds) {
      this.sendNotificationToUser(userId, event, data);
    }
  }
}
