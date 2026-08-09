import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma.service';

@Injectable()
export class TasksService {
  constructor(private prisma: PrismaService) {}

  async getMyTasks(userId: string) {
    // Tasks assigned to the user OR created by the user
    const assignedTaskIds = await this.prisma.taskAssignee.findMany({
      where: { userId },
      select: { taskId: true },
    });

    const ids = assignedTaskIds.map((a) => a.taskId);

    const tasks = await this.prisma.task.findMany({
      where: {
        OR: [{ id: { in: ids } }, { createdBy: userId }],
      },
      include: {
        assignees: {
          include: {
            user: {
              include: { profile: true },
            },
          },
        },
        creator: { include: { profile: true } },
        conversation: {
          include: { group: true },
        },
      },
      orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
    });

    return tasks;
  }

  async getAllWorkspaceTasks(userId: string) {
    // Get the user's workspace from their first WorkspaceUser record
    const workspaceUser = await this.prisma.workspaceUser.findFirst({
      where: { userId },
    });

    if (!workspaceUser) return [];

    const tasks = await this.prisma.task.findMany({
      where: { workspaceId: workspaceUser.workspaceId },
      include: {
        assignees: {
          include: {
            user: {
              include: { profile: true },
            },
          },
        },
        creator: { include: { profile: true } },
        conversation: {
          include: { group: true },
        },
      },
      orderBy: [{ dueDate: 'asc' }, { status: 'asc' }],
    });

    return tasks;
  }

  async createTask(
    userId: string,
    body: {
      conversationId: string;
      title: string;
      assigneeIds?: string[];
      dueDate?: string | null;
      priority?: string;
    },
  ) {
    const title = body.title?.trim();
    if (!title) {
      throw new BadRequestException('Task title is required');
    }

    const workspaceUser = await this.prisma.workspaceUser.findFirst({
      where: { userId, isActive: true },
    });

    if (!workspaceUser) {
      throw new ForbiddenException('User is not part of an active workspace');
    }

    const conversation = await this.prisma.conversation.findFirst({
      where: {
        id: body.conversationId,
        workspaceId: workspaceUser.workspaceId,
        participants: { some: { userId } },
      },
    });

    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    const assigneeIds = Array.from(new Set(body.assigneeIds || []));
    if (assigneeIds.length > 0) {
      const participantCount = await this.prisma.conversationParticipant.count({
        where: {
          conversationId: body.conversationId,
          userId: { in: assigneeIds },
        },
      });

      if (participantCount !== assigneeIds.length) {
        throw new BadRequestException(
          'Task assignees must be participants in this conversation',
        );
      }
    }

    const dueDate = body.dueDate ? new Date(body.dueDate) : null;
    if (body.dueDate && Number.isNaN(dueDate?.getTime())) {
      throw new BadRequestException('Valid due date is required');
    }

    return await this.prisma.$transaction(async (tx) => {
      const task = await tx.task.create({
        data: {
          workspaceId: workspaceUser.workspaceId,
          conversationId: body.conversationId,
          title,
          priority: body.priority || 'NORMAL',
          dueDate,
          createdBy: userId,
        },
      });

      if (assigneeIds.length > 0) {
        await tx.taskAssignee.createMany({
          data: assigneeIds.map((assigneeId) => ({
            taskId: task.id,
            userId: assigneeId,
          })),
        });
      }

      return await tx.task.findUnique({
        where: { id: task.id },
        include: {
          assignees: {
            include: {
              user: {
                include: { profile: true },
              },
            },
          },
          creator: { include: { profile: true } },
          conversation: {
            include: { group: true },
          },
        },
      });
    });
  }

  async updateTask(
    userId: string,
    taskId: string,
    body: {
      complete?: boolean;
      status?: string;
      title?: string;
      dueDate?: string | null;
      priority?: string;
    },
  ) {
    const workspaceUser = await this.prisma.workspaceUser.findFirst({
      where: { userId, isActive: true },
    });

    if (!workspaceUser) {
      throw new ForbiddenException('User is not part of an active workspace');
    }

    const existing = await this.prisma.task.findFirst({
      where: { id: taskId, workspaceId: workspaceUser.workspaceId },
      include: { assignees: { select: { userId: true } } },
    });

    if (!existing) {
      throw new NotFoundException('Task not found');
    }

    const isAdminOrAbove = ['OWNER', 'ADMIN', 'MANAGER'].includes(
      workspaceUser.role,
    );
    const isCreator = existing.createdBy === userId;
    const isAssignee = existing.assignees.some((a) => a.userId === userId);

    if (!isCreator && !isAssignee && !isAdminOrAbove) {
      throw new ForbiddenException(
        'You do not have permission to edit this task',
      );
    }

    const status =
      typeof body.complete === 'boolean'
        ? body.complete
          ? 'COMPLETED'
          : 'ACTIVE'
        : body.status;

    return await this.prisma.task.update({
      where: { id: taskId },
      data: {
        title: body.title,
        priority: body.priority,
        dueDate:
          body.dueDate === undefined
            ? undefined
            : body.dueDate
              ? new Date(body.dueDate)
              : null,
        status,
        completedAt:
          status === 'COMPLETED' ? new Date() : status ? null : undefined,
      },
      include: {
        assignees: {
          include: {
            user: {
              include: { profile: true },
            },
          },
        },
        creator: { include: { profile: true } },
        conversation: {
          include: { group: true },
        },
      },
    });
  }
}
