import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { PresenceService } from '../../common/presence.service';
import { PushService } from '../../common/push.service';

/** Truncated so a wall-of-text message does not bloat the notification row. */
const PREVIEW_MAX_CHARS = 140;

export type MessageNotificationInput = {
  conversationId: string;
  messageId: string;
  senderId: string;
  senderName: string;
  /** Channel name, or null for a direct message. */
  conversationName?: string | null;
  content?: string | null;
  /** Recipients to notify regardless of mute state. */
  mentionedUserIds?: string[];
};

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private prisma: PrismaService,
    private presence: PresenceService,
    private push: PushService,
  ) {}

  private preview(content?: string | null): string {
    const text = (content || '').replace(/\s+/g, ' ').trim();
    if (!text) return 'Sent an attachment';
    return text.length > PREVIEW_MAX_CHARS
      ? `${text.slice(0, PREVIEW_MAX_CHARS - 1)}…`
      : text;
  }

  /**
   * Persists a notification for every participant except the sender.
   *
   * Message alerts used to be socket-only, so anyone who was offline when a
   * message arrived never learned about it. Rows are written for everyone;
   * live delivery over the socket is still handled separately by the gateway.
   *
   * Mentions are always written, even for a muted conversation - being named
   * directly is the one thing mute should not swallow.
   */
  async notifyNewMessage(input: MessageNotificationInput): Promise<void> {
    try {
      const participants = await this.prisma.conversationParticipant.findMany({
        where: {
          conversationId: input.conversationId,
          userId: { not: input.senderId },
        },
        select: { userId: true },
      });
      if (participants.length === 0) return;

      const mentioned = new Set(input.mentionedUserIds ?? []);

      const muted = await this.prisma.mutedChat.findMany({
        where: {
          conversationId: input.conversationId,
          userId: { in: participants.map((p) => p.userId) },
        },
        select: { userId: true },
      });
      const mutedIds = new Set(muted.map((m) => m.userId));

      const body = this.preview(input.content);
      // Direct messages have no channel to name, so the sender is the subject.
      const where = input.conversationName
        ? ` in ${input.conversationName}`
        : '';

      const rows = participants
        .filter((p) => mentioned.has(p.userId) || !mutedIds.has(p.userId))
        .map((p) => ({
          userId: p.userId,
          title: mentioned.has(p.userId)
            ? `${input.senderName} mentioned you${where || ' in a direct message'}`
            : `${input.senderName}${where}`,
          body,
          notificationType: mentioned.has(p.userId) ? 'MENTION' : 'MESSAGE',
          resourceId: input.messageId,
        }));

      if (rows.length === 0) return;

      await this.prisma.notification.createMany({ data: rows });

      // Push only to people who are not already looking at the app; anyone
      // with a live socket has already had it delivered in-app.
      // Sent per recipient because a mention and a plain message carry
      // different titles.
      const url = `/teams?conversation=${input.conversationId}&message=${input.messageId}`;
      for (const row of rows) {
        if (this.presence.isOnline(row.userId)) continue;
        void this.push.sendToUsers([row.userId], {
          title: row.title,
          body,
          url,
        });
      }
    } catch (error) {
      // Never let notification bookkeeping fail the send itself.
      const reason = error instanceof Error ? error.message : 'unknown error';
      this.logger.warn(
        `[NOTIFY] Could not persist message notifications: ${reason}`,
      );
    }
  }

  async getNotifications(userId: string, page = 1, limit = 30) {
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      this.prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.notification.count({ where: { userId } }),
    ]);

    return {
      items,
      total,
      page,
      totalPages: Math.ceil(total / limit),
      unreadCount: await this.prisma.notification.count({
        where: { userId, isRead: false },
      }),
    };
  }

  async markAllRead(userId: string) {
    await this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });
    return { success: true };
  }

  async markRead(userId: string, notificationId: string) {
    const notification = await this.prisma.notification.findFirst({
      where: { id: notificationId, userId },
    });
    if (!notification) return { success: false };

    await this.prisma.notification.update({
      where: { id: notificationId },
      data: { isRead: true },
    });
    return { success: true };
  }
}
