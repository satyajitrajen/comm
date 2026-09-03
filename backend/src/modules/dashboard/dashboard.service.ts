import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { CALL_MESSAGE_TYPES } from '../chats/chats.service';

@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService) {}

  private async getActiveWorkspace(userId: string) {
    const workspaceUser = await this.prisma.workspaceUser.findFirst({
      where: { userId, isActive: true },
      include: { workspace: true },
    });

    if (!workspaceUser) {
      throw new ForbiddenException('User is not part of an active workspace');
    }

    return workspaceUser;
  }

  async getDashboard(userId: string) {
    const workspaceUser = await this.getActiveWorkspace(userId);
    const workspaceId = workspaceUser.workspaceId;
    const now = new Date();
    const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const conversationIds = (
      await this.prisma.conversationParticipant.findMany({
        where: { userId },
        select: { conversationId: true },
      })
    ).map((participant) => participant.conversationId);

    const assignedTaskIds = (
      await this.prisma.taskAssignee.findMany({
        where: { userId },
        select: { taskId: true },
      })
    ).map((assignee) => assignee.taskId);

    const [
      unreadCount,
      openTaskCount,
      fileCount,
      upcomingEventCount,
      recentConversations,
      upcomingEvents,
      assignedTasks,
    ] = await Promise.all([
      this.prisma.message.count({
        where: {
          conversationId: { in: conversationIds },
          senderId: { not: userId },
          reads: { none: { userId } },
        },
      }),
      this.prisma.task.count({
        where: {
          workspaceId,
          OR: [{ id: { in: assignedTaskIds } }, { createdBy: userId }],
          status: { not: 'COMPLETED' },
        },
      }),
      this.prisma.file.count({
        where: {
          workspaceId,
          uploadedBy: userId,
          isDeleted: false,
        },
      }),
      this.prisma.calendarEvent.count({
        where: {
          workspaceId,
          startsAt: { gte: now, lte: nextWeek },
        },
      }),
      this.prisma.conversation.findMany({
        where: {
          id: { in: conversationIds },
          workspaceId,
        },
        include: {
          group: true,
          participants: {
            where: { userId: { not: userId } },
            include: { user: { include: { profile: true } } },
            take: 3,
          },
          messages: {
            where: {
              messageType: {
                notIn: CALL_MESSAGE_TYPES,
              },
            },
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
        orderBy: { updatedAt: 'desc' },
        take: 5,
      }),
      this.prisma.calendarEvent.findMany({
        where: {
          workspaceId,
          startsAt: { gte: now },
        },
        orderBy: { startsAt: 'asc' },
        take: 5,
      }),
      this.prisma.task.findMany({
        where: {
          workspaceId,
          OR: [{ id: { in: assignedTaskIds } }, { createdBy: userId }],
          status: { not: 'COMPLETED' },
        },
        include: {
          conversation: { include: { group: true } },
          assignees: { include: { user: { include: { profile: true } } } },
        },
        orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
        take: 5,
      }),
    ]);

    return {
      workspace: {
        id: workspaceUser.workspace.id,
        name: workspaceUser.workspace.name,
        subdomain: workspaceUser.workspace.subdomain,
      },
      stats: {
        conversations: conversationIds.length,
        unreadMessages: unreadCount,
        openTasks: openTaskCount,
        files: fileCount,
        upcomingEvents: upcomingEventCount,
      },
      recentConversations: recentConversations.map((conversation) => {
        const directUser = conversation.participants[0]?.user;
        return {
          conversationId: conversation.id,
          type: conversation.type,
          name:
            conversation.group?.name ||
            directUser?.profile?.displayName ||
            directUser?.email ||
            'Conversation',
          group: conversation.group,
          lastMessage: conversation.messages[0] || null,
        };
      }),
      upcomingEvents,
      assignedTasks,
    };
  }
}
