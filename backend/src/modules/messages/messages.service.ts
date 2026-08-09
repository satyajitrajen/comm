import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { NotificationsService } from '../notifications/notifications.service';
import { extractMentionedUserIds } from '../../config/mentions';

@Injectable()
export class MessagesService {
  constructor(
    private prisma: PrismaService,
    private realtimeGateway: RealtimeGateway,
    private notificationsService: NotificationsService,
  ) {}

  private async assertConversationParticipant(
    conversationId: string,
    userId: string,
  ) {
    const participant = await this.prisma.conversationParticipant.findFirst({
      where: { conversationId, userId },
      select: { id: true },
    });

    if (!participant) {
      throw new ForbiddenException(
        'You are not a participant in this conversation',
      );
    }
  }

  private async assertConversationParticipants(
    conversationId: string,
    userIds: string[],
    errorMessage: string,
  ) {
    const uniqueIds = Array.from(new Set(userIds));

    if (uniqueIds.length === 0) {
      return;
    }

    const participantCount = await this.prisma.conversationParticipant.count({
      where: {
        conversationId,
        userId: { in: uniqueIds },
      },
    });

    if (participantCount !== uniqueIds.length) {
      throw new ForbiddenException(errorMessage);
    }
  }

  private async getMessageForParticipant(userId: string, messageId: string) {
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
      select: {
        id: true,
        conversationId: true,
        senderId: true,
        content: true,
        createdAt: true,
        conversation: {
          select: {
            workspaceId: true,
          },
        },
      },
    });

    if (!message) {
      throw new NotFoundException('Message not found');
    }

    await this.assertConversationParticipant(message.conversationId, userId);

    return message;
  }

  async sendMessage(
    userId: string,
    body: {
      conversationId: string;
      content?: string;
      replyToMessageId?: string;
      messageType?: string;
      priority?: string;
    },
  ) {
    await this.assertConversationParticipant(body.conversationId, userId);

    const conversation = await this.prisma.conversation.findUnique({
      where: { id: body.conversationId },
      include: { group: true },
    });

    if (conversation?.group?.isReadOnly) {
      const workspaceUser = await this.prisma.workspaceUser.findFirst({
        where: { userId, workspaceId: conversation.workspaceId },
      });
      const isAdmin =
        workspaceUser?.role === 'ADMIN' || workspaceUser?.role === 'OWNER';
      if (isAdmin) {
        // ok
      } else if (conversation.group.spaceType === 'ANNOUNCEMENT') {
        const canPublish =
          workspaceUser?.canPostAnnouncements ||
          (await this.prisma.announcementPublisher.findFirst({
            where: { conversationId: body.conversationId, userId },
          }));
        if (!canPublish) {
          throw new ForbiddenException(
            'You do not have permission to post in this announcement space',
          );
        }
      } else if (!workspaceUser?.canPostAnnouncements) {
        throw new ForbiddenException(
          'You do not have permission to post in this announcement space',
        );
      }
    }

    const message = await this.prisma.message.create({
      data: {
        conversationId: body.conversationId,
        senderId: userId,
        content: body.content || null,
        replyToMessageId: body.replyToMessageId || null,
        messageType: body.messageType || 'TEXT',
        priority: body.priority || 'NORMAL',
      },
      include: {
        sender: {
          include: { profile: true },
        },
        replyTo: true,
        reads: true,
        deliveries: true,
        reactions: true,
        attachments: {
          include: { file: true },
        },
      },
    });

    // Broadcast to room
    const room = `conversation:${body.conversationId}`;
    this.realtimeGateway.broadcastToRoom(room, 'message.sent', message);
    void this.realtimeGateway.emitMessageNotifyToParticipants(
      body.conversationId,
      userId,
      message,
    );

    // Anyone can type raw mention markup, so only ids that are genuinely
    // participants of this conversation are allowed to trigger a mention.
    const claimedMentions = extractMentionedUserIds(message.content);
    let mentionedUserIds: string[] = [];
    if (claimedMentions.length > 0) {
      const valid = await this.prisma.conversationParticipant.findMany({
        where: {
          conversationId: body.conversationId,
          userId: { in: claimedMentions, not: userId },
        },
        select: { userId: true },
      });
      mentionedUserIds = valid.map((p) => p.userId);
    }

    // Durable record alongside the live socket emit above. Without this an
    // offline recipient never learns the message happened.
    void this.notificationsService.notifyNewMessage({
      conversationId: body.conversationId,
      messageId: message.id,
      senderId: userId,
      senderName: message.sender?.profile?.displayName || 'Someone',
      // Null for direct messages, which have no group to name.
      conversationName: conversation?.group?.name ?? null,
      content: message.content,
      mentionedUserIds,
    });

    return message;
  }

  /**
   * Full-text-ish search across the conversations this user belongs to.
   *
   * Scoping is enforced by `participants: { some: { userId } }` on the
   * conversation relation rather than by filtering afterwards, so a message
   * from a channel the user is not in can never enter the result set.
   *
   * SQLite `contains` is adequate at current volumes; the upgrade path is an
   * FTS5 virtual table over Message.content.
   */
  async searchMessages(
    userId: string,
    options: {
      query: string;
      conversationId?: string;
      limit?: number;
      before?: string;
    },
  ) {
    const query = options.query?.trim();
    if (!query || query.length < 2) {
      return { messages: [], hasMore: false, nextCursor: null };
    }

    const limit = Math.min(Math.max(options.limit ?? 25, 1), 50);

    let cursor: { createdAt: Date; id: string } | null = null;
    if (options.before) {
      const anchor = await this.prisma.message.findUnique({
        where: { id: options.before },
        select: { id: true, createdAt: true },
      });
      if (anchor) cursor = anchor;
    }

    const rows = await this.prisma.message.findMany({
      where: {
        content: { contains: query },
        isDeletedGlobally: false,
        NOT: { deletions: { some: { deletedBy: userId } } },
        conversation: {
          participants: { some: { userId } },
          ...(options.conversationId ? { id: options.conversationId } : {}),
        },
        ...(cursor
          ? {
              OR: [
                { createdAt: { lt: cursor.createdAt } },
                { createdAt: cursor.createdAt, id: { lt: cursor.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      select: {
        id: true,
        conversationId: true,
        content: true,
        createdAt: true,
        sender: {
          select: { id: true, profile: { select: { displayName: true } } },
        },
        conversation: {
          select: { id: true, type: true, group: { select: { name: true } } },
        },
      },
    });

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;

    return {
      messages: page,
      hasMore,
      nextCursor: hasMore && page.length > 0 ? page[page.length - 1].id : null,
    };
  }

  async editMessage(userId: string, messageId: string, content: string) {
    const message = await this.getMessageForParticipant(userId, messageId);

    if (message.senderId !== userId) {
      throw new ForbiddenException('You can only edit your own messages');
    }

    const fiveMinutes = 5 * 60 * 1000;
    const elapsed = Date.now() - new Date(message.createdAt).getTime();
    if (elapsed > fiveMinutes) {
      throw new BadRequestException(
        'Message editing window of 5 minutes has elapsed',
      );
    }

    // Save compliance history
    await this.prisma.messageEdit.create({
      data: {
        messageId,
        oldContent: message.content || '',
        editedBy: userId,
      },
    });

    const updated = await this.prisma.message.update({
      where: { id: messageId },
      data: {
        content,
        isEdited: true,
      },
      include: {
        sender: {
          include: { profile: true },
        },
        reads: true,
        deliveries: true,
        reactions: true,
        replyTo: true,
        attachments: {
          include: { file: true },
        },
      },
    });

    // Broadcast edit
    const room = `conversation:${message.conversationId}`;
    this.realtimeGateway.broadcastToRoom(room, 'message.edited', {
      messageId: updated.id,
      conversationId: updated.conversationId,
      content: updated.content,
      isEdited: updated.isEdited,
      updatedAt: updated.updatedAt,
    });

    return updated;
  }

  async deleteMessage(
    userId: string,
    messageId: string,
    deleteForEveryone: boolean,
  ) {
    const message = await this.getMessageForParticipant(userId, messageId);

    if (deleteForEveryone) {
      if (message.senderId !== userId) {
        throw new ForbiddenException(
          'You can only delete your own messages for everyone',
        );
      }

      const twoHours = 2 * 60 * 60 * 1000;
      const elapsed = Date.now() - new Date(message.createdAt).getTime();
      if (elapsed > twoHours) {
        throw new BadRequestException(
          'Deletion for everyone window of 2 hours has elapsed',
        );
      }

      // Save compliance record
      await this.prisma.messageDeletion.create({
        data: {
          messageId,
          deletedBy: userId,
          originalContent: message.content,
        },
      });

      const updated = await this.prisma.message.update({
        where: { id: messageId },
        data: {
          content: 'This message was deleted',
          isDeletedGlobally: true,
        },
      });

      // Broadcast delete
      const room = `conversation:${message.conversationId}`;
      this.realtimeGateway.broadcastToRoom(room, 'message.deleted', {
        messageId: updated.id,
        conversationId: updated.conversationId,
        content: updated.content,
        isDeletedGlobally: updated.isDeletedGlobally,
      });

      return updated;
    } else {
      // Delete for me
      await this.prisma.messageDeletion.create({
        data: {
          messageId,
          deletedBy: userId,
          originalContent: message.content,
        },
      });
      return { id: messageId, deletedForMe: true };
    }
  }

  async addReaction(userId: string, messageId: string, emoji: string) {
    const message = await this.getMessageForParticipant(userId, messageId);

    const reaction = await this.prisma.messageReaction.upsert({
      where: {
        messageId_userId_emoji: {
          messageId,
          userId,
          emoji,
        },
      },
      create: {
        messageId,
        userId,
        emoji,
      },
      update: {},
    });

    // Broadcast reaction added
    const room = `conversation:${message.conversationId}`;
    this.realtimeGateway.broadcastToRoom(room, 'message.reacted', {
      messageId,
      conversationId: message.conversationId,
      userId,
      emoji,
      action: 'ADDED',
    });

    return reaction;
  }

  async removeReaction(userId: string, messageId: string, emoji: string) {
    const message = await this.getMessageForParticipant(userId, messageId);

    await this.prisma.messageReaction.delete({
      where: {
        messageId_userId_emoji: {
          messageId,
          userId,
          emoji,
        },
      },
    });

    // Broadcast reaction removed
    const room = `conversation:${message.conversationId}`;
    this.realtimeGateway.broadcastToRoom(room, 'message.reacted', {
      messageId,
      conversationId: message.conversationId,
      userId,
      emoji,
      action: 'REMOVED',
    });

    return { success: true };
  }

  async createTaskFromMessage(
    userId: string,
    body: {
      messageId: string;
      title: string;
      assigneeIds: string[];
      dueDate?: string;
      priority?: string;
    },
  ) {
    const message = await this.getMessageForParticipant(userId, body.messageId);
    const uniqueAssigneeIds = Array.from(new Set(body.assigneeIds || []));
    await this.assertConversationParticipants(
      message.conversationId,
      uniqueAssigneeIds,
      'Task assignees must be participants in this conversation',
    );

    const task = await this.prisma.$transaction(async (tx) => {
      const createdTask = await tx.task.create({
        data: {
          workspaceId: message.conversation.workspaceId,
          conversationId: message.conversationId,
          messageId: body.messageId,
          title: body.title,
          priority: body.priority || 'NORMAL',
          dueDate: body.dueDate ? new Date(body.dueDate) : null,
          createdBy: userId,
        },
      });

      if (uniqueAssigneeIds.length > 0) {
        await tx.taskAssignee.createMany({
          data: uniqueAssigneeIds.map((assigneeId) => ({
            taskId: createdTask.id,
            userId: assigneeId,
          })),
        });
      }

      await tx.message.update({
        where: { id: body.messageId },
        data: { messageType: 'TASK' },
      });

      return await tx.task.findUnique({
        where: { id: createdTask.id },
        include: {
          assignees: {
            include: {
              user: {
                include: { profile: true },
              },
            },
          },
        },
      });
    });

    // Broadcast task added to room
    const room = `conversation:${message.conversationId}`;
    this.realtimeGateway.broadcastToRoom(room, 'task.created', task);

    return task;
  }

  async createPoll(
    userId: string,
    body: {
      conversationId: string;
      question: string;
      options: string[];
      expiresAt?: string;
      isMultiSelect?: boolean;
    },
  ) {
    await this.assertConversationParticipant(body.conversationId, userId);

    const question = body.question?.trim();
    const options = (body.options || [])
      .map((option) => option.trim())
      .filter(Boolean);

    if (!question || options.length < 2) {
      throw new BadRequestException('Poll requires a question and two options');
    }

    const fullMessage = await this.prisma.$transaction(async (tx) => {
      const message = await tx.message.create({
        data: {
          conversationId: body.conversationId,
          senderId: userId,
          content: `Poll: ${question}`,
          messageType: 'POLL',
        },
      });

      const poll = await tx.poll.create({
        data: {
          messageId: message.id,
          question,
          isMultiSelect: body.isMultiSelect || false,
          expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
        },
      });

      await tx.pollOption.createMany({
        data: options.map((optText, index) => ({
          pollId: poll.id,
          optionText: optText,
          displayOrder: index,
        })),
      });

      const createdMessage = await tx.message.findUnique({
        where: { id: message.id },
        include: {
          polls: {
            include: {
              options: true,
              votes: {
                include: {
                  user: {
                    include: { profile: true },
                  },
                },
              },
            },
          },
          sender: {
            include: { profile: true },
          },
          reads: true,
          deliveries: true,
          reactions: true,
        },
      });

      if (!createdMessage) {
        throw new Error('Failed to create poll message');
      }

      return createdMessage;
    });

    // Broadcast poll added to room
    const room = `conversation:${body.conversationId}`;
    this.realtimeGateway.broadcastToRoom(room, 'poll.created', fullMessage);

    return fullMessage;
  }

  async votePoll(userId: string, pollId: string, optionId: string) {
    const poll = await this.prisma.poll.findUnique({
      where: { id: pollId },
      include: {
        message: {
          select: {
            conversationId: true,
          },
        },
        options: {
          select: {
            id: true,
          },
        },
      },
    });
    if (!poll) throw new NotFoundException('Poll not found');

    await this.assertConversationParticipant(
      poll.message.conversationId,
      userId,
    );

    if (!poll.options.some((option) => option.id === optionId)) {
      throw new BadRequestException('Poll option is invalid');
    }

    if (poll.expiresAt && new Date(poll.expiresAt).getTime() < Date.now()) {
      throw new BadRequestException('Poll voting has expired');
    }

    if (!poll.isMultiSelect) {
      await this.prisma.pollVote.deleteMany({
        where: { pollId, userId },
      });
    }

    await this.prisma.pollVote.upsert({
      where: {
        pollId_userId_optionId: {
          pollId,
          userId,
          optionId,
        },
      },
      create: {
        pollId,
        userId,
        optionId,
      },
      update: {},
    });

    // Retrieve full poll results to broadcast
    const updatedPoll = await this.prisma.poll.findUnique({
      where: { id: pollId },
      include: {
        options: true,
        votes: {
          include: {
            user: {
              include: { profile: true },
            },
          },
        },
      },
    });

    if (!updatedPoll) {
      throw new Error('Failed to update poll vote');
    }

    // Broadcast poll update
    const msg = await this.prisma.message.findUnique({
      where: { id: poll.messageId },
    });
    if (msg) {
      this.realtimeGateway.broadcastToRoom(
        `conversation:${msg.conversationId}`,
        'poll.voted',
        updatedPoll,
      );
    }

    return updatedPoll;
  }

  async starMessage(userId: string, messageId: string) {
    await this.getMessageForParticipant(userId, messageId);
    const starred = await this.prisma.starredMessage.upsert({
      where: { userId_messageId: { userId, messageId } },
      create: { userId, messageId },
      update: {},
    });
    return starred;
  }

  async unstarMessage(userId: string, messageId: string) {
    await this.getMessageForParticipant(userId, messageId);
    await this.prisma.starredMessage
      .delete({ where: { userId_messageId: { userId, messageId } } })
      .catch(() => null); // ignore if not starred
    return { success: true };
  }

  async pinMessage(userId: string, messageId: string, conversationId: string) {
    await this.assertConversationParticipant(conversationId, userId);
    const pinned = await this.prisma.pinnedMessage.upsert({
      where: { conversationId_messageId: { conversationId, messageId } },
      create: { conversationId, messageId, pinnedBy: userId },
      update: {},
    });
    const room = `conversation:${conversationId}`;
    this.realtimeGateway.broadcastToRoom(room, 'message.pinned', {
      messageId,
      conversationId,
    });
    return pinned;
  }

  async unpinMessage(
    userId: string,
    messageId: string,
    conversationId: string,
  ) {
    await this.assertConversationParticipant(conversationId, userId);
    await this.prisma.pinnedMessage
      .delete({
        where: { conversationId_messageId: { conversationId, messageId } },
      })
      .catch(() => null);
    const room = `conversation:${conversationId}`;
    this.realtimeGateway.broadcastToRoom(room, 'message.unpinned', {
      messageId,
      conversationId,
    });
    return { success: true };
  }

  async forwardMessage(
    userId: string,
    messageId: string,
    targetConversationId: string,
  ) {
    const source = await this.getMessageForParticipant(userId, messageId);
    await this.assertConversationParticipant(targetConversationId, userId);

    // Increment forwardedCount on the source message
    await this.prisma.message.update({
      where: { id: messageId },
      data: { forwardedCount: { increment: 1 } },
    });

    const forwarded = await this.prisma.message.create({
      data: {
        conversationId: targetConversationId,
        senderId: userId,
        content: source.content,
        messageType: 'TEXT',
        priority: 'NORMAL',
      },
      include: {
        sender: { include: { profile: true } },
        reactions: true,
        attachments: { include: { file: true } },
        reads: true,
        deliveries: true,
      },
    });

    const room = `conversation:${targetConversationId}`;
    this.realtimeGateway.broadcastToRoom(room, 'message.sent', forwarded);
    void this.realtimeGateway.emitMessageNotifyToParticipants(
      targetConversationId,
      userId,
      forwarded,
    );

    return forwarded;
  }
}
