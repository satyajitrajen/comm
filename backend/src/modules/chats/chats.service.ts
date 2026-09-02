import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { PresenceService } from '../../common/presence.service';

/** Roughly two screens of transcript on a desktop viewport. */
const DEFAULT_MESSAGE_PAGE_SIZE = 50;
/** Ceiling so a hand-crafted `limit` cannot reinstate the unbounded fetch. */
const MAX_MESSAGE_PAGE_SIZE = 100;

/** Everything the transcript needs to render one message. */
const MESSAGE_INCLUDE = {
  sender: { include: { profile: true } },
  reads: true,
  deliveries: true,
  reactions: true,
  replyTo: true,
  attachments: { include: { file: true } },
  polls: {
    include: {
      options: true,
      votes: { include: { user: { include: { profile: true } } } },
    },
  },
  tasks: {
    include: {
      assignees: { include: { user: { include: { profile: true } } } },
    },
  },
} as const;

@Injectable()
export class ChatsService {
  constructor(
    private prisma: PrismaService,
    private realtimeGateway: RealtimeGateway,
    private presence: PresenceService,
  ) {}

  /** Posts a system event message and broadcasts it to the conversation room */
  private async postSystemMessage(
    conversationId: string,
    actorUserId: string,
    messageType: string,
    content: string,
  ) {
    try {
      const msg = await this.prisma.message.create({
        data: {
          conversationId,
          senderId: actorUserId,
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
      this.realtimeGateway.broadcastToRoom(
        `conversation:${conversationId}`,
        'message.sent',
        msg,
      );
      void this.realtimeGateway.emitMessageNotifyToParticipants(
        conversationId,
        actorUserId,
        msg,
      );
    } catch {
      // Non-critical: swallow errors so the main action still succeeds
    }
  }

  private async getActiveWorkspaceId(userId: string) {
    const workspaceUser = await this.prisma.workspaceUser.findFirst({
      where: { userId, isActive: true },
    });
    if (!workspaceUser) {
      throw new BadRequestException('User is not part of any active workspace');
    }

    return workspaceUser.workspaceId;
  }

  private async ensureUsersInWorkspace(
    workspaceId: string,
    userIds: string[],
    errorMessage: string,
  ) {
    const uniqueIds = Array.from(new Set(userIds));
    const membersCount = await this.prisma.workspaceUser.count({
      where: {
        workspaceId,
        userId: { in: uniqueIds },
        isActive: true,
      },
    });

    if (membersCount !== uniqueIds.length) {
      throw new BadRequestException(errorMessage);
    }
  }

  async createDirectChat(userId: string, targetUserId: string) {
    if (userId === targetUserId) {
      throw new BadRequestException('Cannot create a chat with yourself');
    }

    // Ensure target user exists
    const targetUser = await this.prisma.user.findUnique({
      where: { id: targetUserId },
    });
    if (!targetUser) {
      throw new NotFoundException('Target user not found');
    }

    const workspaceId = await this.getActiveWorkspaceId(userId);
    await this.ensureUsersInWorkspace(
      workspaceId,
      [targetUserId],
      'Target user is not in your workspace',
    );

    // Check if direct conversation already exists between these two users in this workspace
    const existing = await this.prisma.conversation.findFirst({
      where: {
        workspaceId,
        type: 'DIRECT',
        participants: {
          every: {
            userId: { in: [userId, targetUserId] },
          },
        },
      },
      include: {
        participants: {
          include: {
            user: {
              include: { profile: true },
            },
          },
        },
      },
    });

    if (existing && existing.participants.length === 2) {
      return existing;
    }

    // Create new direct conversation
    return await this.prisma.conversation.create({
      data: {
        workspaceId,
        type: 'DIRECT',
        participants: {
          create: [{ userId }, { userId: targetUserId }],
        },
      },
      include: {
        participants: {
          include: {
            user: {
              include: { profile: true },
            },
          },
        },
      },
    });
  }

  async createGroupChat(
    userId: string,
    body: {
      name: string;
      description?: string;
      participantIds: string[];
      teamName?: string;
      channelSlug?: string;
      spaceType?: string;
      isReadOnly?: boolean;
    },
  ) {
    if (!body.name?.trim()) {
      throw new BadRequestException('Group name is required');
    }

    const workspaceId = await this.getActiveWorkspaceId(userId);
    const spaceType = body.spaceType || 'TEAM_CHANNEL';
    const conversationType =
      spaceType === 'TEAM_CHANNEL' ? 'GROUP' : 'BROADCAST';

    // Filter unique participant IDs and ensure the creator is included
    const uniqueIds = Array.from(new Set([userId, ...body.participantIds]));
    await this.ensureUsersInWorkspace(
      workspaceId,
      uniqueIds,
      'All group participants must belong to your workspace',
    );

    return await this.prisma.$transaction(async (tx) => {
      // 1. Create conversation
      const conversation = await tx.conversation.create({
        data: {
          workspaceId,
          type: conversationType,
        },
      });

      // 2. Create conversation participants
      await tx.conversationParticipant.createMany({
        data: uniqueIds.map((id) => ({
          conversationId: conversation.id,
          userId: id,
        })),
      });

      // 3. Create Group Profile
      await tx.group.create({
        data: {
          conversationId: conversation.id,
          name: body.name.trim(),
          description: body.description || null,
          teamName: body.teamName?.trim() || null,
          channelSlug: body.channelSlug?.trim() || null,
          spaceType,
          isReadOnly: body.isReadOnly || false,
          createdBy: userId,
        },
      });

      // 4. Create Group Member details with roles
      await tx.groupMember.createMany({
        data: uniqueIds.map((id) => ({
          conversationId: conversation.id,
          userId: id,
          role: id === userId ? 'OWNER' : 'MEMBER',
        })),
      });

      return await tx.conversation.findUnique({
        where: { id: conversation.id },
        include: {
          group: true,
          participants: {
            include: {
              user: {
                include: { profile: true },
              },
            },
          },
        },
      });
    });
  }

  async joinGroupChat(userId: string, conversationId: string) {
    const workspaceId = await this.getActiveWorkspaceId(userId);
    const conversation = await this.prisma.conversation.findFirst({
      where: {
        id: conversationId,
        workspaceId,
        group: { isNot: null },
      },
      include: { group: true },
    });

    if (!conversation?.group) {
      throw new NotFoundException('Conversation not found');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.conversationParticipant.upsert({
        where: { conversationId_userId: { conversationId, userId } },
        update: {},
        create: { conversationId, userId },
      });

      await tx.groupMember.upsert({
        where: { conversationId_userId: { conversationId, userId } },
        update: {},
        create: { conversationId, userId, role: 'MEMBER' },
      });
    });

    // Post join system message
    const userProfile = await this.prisma.userProfile.findFirst({
      where: { userId },
      select: { displayName: true },
    });
    const name = userProfile?.displayName || 'Someone';
    await this.postSystemMessage(
      conversationId,
      userId,
      'SYSTEM_JOIN',
      `${name} joined the channel`,
    );

    return { success: true, conversationId };
  }

  async leaveGroupChat(
    userId: string,
    conversationId: string,
    transferOwnerTo?: string,
  ) {
    const workspaceId = await this.getActiveWorkspaceId(userId);
    const group = await this.prisma.group.findFirst({
      where: {
        conversationId,
        conversation: { workspaceId },
      },
      include: {
        members: {
          include: { user: { include: { profile: true } } },
        },
      },
    });

    if (!group) {
      throw new NotFoundException('Conversation not found');
    }

    const actorMember = group.members.find((m) => m.userId === userId);
    const isOwner = actorMember?.role === 'OWNER' || group.createdBy === userId;

    if (!actorMember) {
      throw new ForbiddenException('You are not a member of this channel');
    }

    if (isOwner) {
      if (!transferOwnerTo) {
        throw new BadRequestException(
          'Channel owner must transfer ownership before leaving',
        );
      }
      if (transferOwnerTo === userId) {
        throw new BadRequestException('Cannot transfer ownership to yourself');
      }

      const otherMembers = group.members.filter((m) => m.userId !== userId);
      if (otherMembers.length === 0) {
        throw new BadRequestException(
          'Cannot leave as the only channel member',
        );
      }

      const targetMember = group.members.find(
        (m) => m.userId === transferOwnerTo,
      );
      if (!targetMember) {
        throw new BadRequestException(
          'Transfer target is not a channel member',
        );
      }

      const otherAdmins = otherMembers.filter((m) => m.role === 'ADMIN');
      if (otherAdmins.length > 0 && targetMember.role !== 'ADMIN') {
        throw new BadRequestException('New owner must be a channel admin');
      }

      await this.prisma.$transaction(async (tx) => {
        await tx.groupMember.update({
          where: {
            conversationId_userId: {
              conversationId,
              userId: transferOwnerTo,
            },
          },
          data: { role: 'OWNER' },
        });
        await tx.group.update({
          where: { conversationId },
          data: { createdBy: transferOwnerTo },
        });
        await tx.groupMember.deleteMany({ where: { conversationId, userId } });
        await tx.conversationParticipant.deleteMany({
          where: { conversationId, userId },
        });
      });

      const actorProfile = await this.prisma.userProfile.findFirst({
        where: { userId },
        select: { displayName: true },
      });
      const newOwnerProfile = await this.prisma.userProfile.findFirst({
        where: { userId: transferOwnerTo },
        select: { displayName: true },
      });
      const actorName = actorProfile?.displayName || 'Someone';
      const newOwnerName = newOwnerProfile?.displayName || 'Someone';
      await this.postSystemMessage(
        conversationId,
        userId,
        'SYSTEM_LEAVE',
        `${actorName} transferred ownership to ${newOwnerName} and left the channel`,
      );

      return { success: true, conversationId, transferredTo: transferOwnerTo };
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.groupMember.deleteMany({ where: { conversationId, userId } });
      await tx.conversationParticipant.deleteMany({
        where: { conversationId, userId },
      });
    });

    const userProfile = await this.prisma.userProfile.findFirst({
      where: { userId },
      select: { displayName: true },
    });
    const name = userProfile?.displayName || 'Someone';
    await this.postSystemMessage(
      conversationId,
      userId,
      'SYSTEM_LEAVE',
      `${name} left the channel`,
    );

    return { success: true, conversationId };
  }

  private canManageMembers(role: string | undefined) {
    return role === 'OWNER' || role === 'ADMIN';
  }

  async getGroupChatDetails(userId: string, conversationId: string) {
    const workspaceId = await this.getActiveWorkspaceId(userId);

    const group = await this.prisma.group.findFirst({
      where: {
        conversationId,
        conversation: { workspaceId },
      },
      include: {
        members: {
          include: {
            user: { include: { profile: true } },
          },
          orderBy: { joinedAt: 'asc' },
        },
      },
    });

    if (!group) {
      throw new NotFoundException('Conversation not found');
    }

    const myMembership = group.members.find((m) => m.userId === userId);
    const isMember = !!myMembership;
    const myRole = myMembership?.role || 'GUEST';
    const canManageMembers = isMember && this.canManageMembers(myRole);
    const isOwner =
      isMember && (myRole === 'OWNER' || group.createdBy === userId);
    const transferCandidates = group.members
      .filter((m) => m.userId !== userId)
      .map((m) => ({
        userId: m.userId,
        displayName: m.user.profile?.displayName || m.user.email || 'User',
        role: m.role,
      }))
      .sort((a, b) => {
        if (a.role === 'ADMIN' && b.role !== 'ADMIN') return -1;
        if (b.role === 'ADMIN' && a.role !== 'ADMIN') return 1;
        return a.displayName.localeCompare(b.displayName);
      });

    return {
      conversationId,
      group: {
        name: group.name,
        description: group.description,
        teamName: group.teamName,
        channelSlug: group.channelSlug,
        spaceType: group.spaceType,
        isReadOnly: group.isReadOnly,
        createdBy: group.createdBy,
      },
      members: group.members.map((m) => ({
        userId: m.userId,
        displayName: m.user.profile?.displayName || m.user.email || 'User',
        email: m.user.email,
        avatarUrl: m.user.profile?.avatarUrl,
        role: m.role,
        joinedAt: m.joinedAt,
      })),
      isMember,
      myRole,
      canManageMembers,
      isOwner,
      transferCandidates,
      memberCount: group.members.length,
    };
  }

  async addGroupMembers(
    userId: string,
    conversationId: string,
    userIds: string[],
  ) {
    if (!Array.isArray(userIds) || userIds.length === 0) {
      throw new BadRequestException('userIds is required');
    }

    const workspaceId = await this.getActiveWorkspaceId(userId);
    const group = await this.prisma.group.findFirst({
      where: {
        conversationId,
        conversation: { workspaceId },
      },
    });

    if (!group) {
      throw new NotFoundException('Conversation not found');
    }

    const actorMember = await this.prisma.groupMember.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
    });
    if (!actorMember || !this.canManageMembers(actorMember.role)) {
      throw new ForbiddenException(
        'You do not have permission to manage members',
      );
    }

    const uniqueIds = Array.from(new Set(userIds));
    await this.ensureUsersInWorkspace(
      workspaceId,
      uniqueIds,
      'All users must belong to your workspace',
    );

    const existing = await this.prisma.groupMember.findMany({
      where: { conversationId, userId: { in: uniqueIds } },
      select: { userId: true },
    });
    const existingSet = new Set(existing.map((e) => e.userId));
    const toAdd = uniqueIds.filter((id) => !existingSet.has(id));

    if (toAdd.length === 0) {
      return { success: true, added: [] as string[] };
    }

    await this.prisma.$transaction(async (tx) => {
      for (const id of toAdd) {
        await tx.conversationParticipant.upsert({
          where: { conversationId_userId: { conversationId, userId: id } },
          update: {},
          create: { conversationId, userId: id },
        });
        await tx.groupMember.upsert({
          where: { conversationId_userId: { conversationId, userId: id } },
          update: {},
          create: { conversationId, userId: id, role: 'MEMBER' },
        });
      }
    });

    for (const id of toAdd) {
      const userProfile = await this.prisma.userProfile.findFirst({
        where: { userId: id },
        select: { displayName: true },
      });
      const name = userProfile?.displayName || 'Someone';
      await this.postSystemMessage(
        conversationId,
        userId,
        'SYSTEM_JOIN',
        `${name} was added to the channel`,
      );
    }

    return { success: true, added: toAdd };
  }

  async removeGroupMember(
    actorId: string,
    conversationId: string,
    targetUserId: string,
  ) {
    if (actorId === targetUserId) {
      return this.leaveGroupChat(actorId, conversationId);
    }

    const workspaceId = await this.getActiveWorkspaceId(actorId);
    const group = await this.prisma.group.findFirst({
      where: {
        conversationId,
        conversation: { workspaceId },
      },
    });

    if (!group) {
      throw new NotFoundException('Conversation not found');
    }

    const actorMember = await this.prisma.groupMember.findUnique({
      where: { conversationId_userId: { conversationId, userId: actorId } },
    });
    if (!actorMember || !this.canManageMembers(actorMember.role)) {
      throw new ForbiddenException(
        'You do not have permission to manage members',
      );
    }

    const targetMember = await this.prisma.groupMember.findUnique({
      where: {
        conversationId_userId: { conversationId, userId: targetUserId },
      },
    });
    if (!targetMember) {
      throw new NotFoundException('Member not found in this channel');
    }
    if (targetMember.role === 'OWNER') {
      throw new BadRequestException('Cannot remove the channel owner');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.groupMember.deleteMany({
        where: { conversationId, userId: targetUserId },
      });
      await tx.conversationParticipant.deleteMany({
        where: { conversationId, userId: targetUserId },
      });
    });

    const userProfile = await this.prisma.userProfile.findFirst({
      where: { userId: targetUserId },
      select: { displayName: true },
    });
    const name = userProfile?.displayName || 'Someone';
    await this.postSystemMessage(
      conversationId,
      actorId,
      'SYSTEM_LEAVE',
      `${name} was removed from the channel`,
    );

    return { success: true, conversationId, removedUserId: targetUserId };
  }

  async updateGroupChat(
    userId: string,
    conversationId: string,
    body: {
      name?: string;
      description?: string;
      teamName?: string;
      spaceType?: string;
      isReadOnly?: boolean;
    },
  ) {
    const workspaceId = await this.getActiveWorkspaceId(userId);
    const group = await this.prisma.group.findFirst({
      where: { conversationId, conversation: { workspaceId } },
      include: { members: true },
    });
    if (!group) {
      throw new NotFoundException('Group conversation not found');
    }

    const member = group.members.find((m) => m.userId === userId);
    if (!member || !this.canManageMembers(member.role)) {
      throw new ForbiddenException(
        'Only channel admins or owners can update channel details',
      );
    }

    const updated = await this.prisma.group.update({
      where: { conversationId },
      data: {
        ...(body.name?.trim() ? { name: body.name.trim() } : {}),
        ...(body.description !== undefined
          ? { description: body.description.trim() || null }
          : {}),
        ...(body.teamName !== undefined
          ? { teamName: body.teamName.trim() || null }
          : {}),
        ...(body.spaceType ? { spaceType: body.spaceType } : {}),
        ...(body.isReadOnly !== undefined
          ? { isReadOnly: body.isReadOnly }
          : {}),
      },
    });

    const actorProfile = await this.prisma.userProfile.findFirst({
      where: { userId },
      select: { displayName: true },
    });
    const actorName = actorProfile?.displayName || 'Someone';
    await this.postSystemMessage(
      conversationId,
      userId,
      'SYSTEM_UPDATE',
      `${actorName} updated channel details`,
    );

    return updated;
  }

  async deleteGroupChat(userId: string, conversationId: string) {
    const workspaceId = await this.getActiveWorkspaceId(userId);
    const group = await this.prisma.group.findFirst({
      where: { conversationId, conversation: { workspaceId } },
      include: { members: true },
    });
    if (!group) {
      throw new NotFoundException('Group conversation not found');
    }

    const member = group.members.find((m) => m.userId === userId);
    const isOwner = member?.role === 'OWNER' || group.createdBy === userId;
    if (!isOwner) {
      throw new ForbiddenException(
        'Only the channel owner can delete this channel',
      );
    }

    await this.prisma.conversation.delete({
      where: { id: conversationId },
    });

    this.realtimeGateway.broadcastToRoom(
      `conversation:${conversationId}`,
      'conversation.deleted',
      { conversationId },
    );

    return { success: true, conversationId };
  }

  async toggleMuteGroupChat(
    userId: string,
    conversationId: string,
    mute: boolean,
  ) {
    const workspaceId = await this.getActiveWorkspaceId(userId);
    const participant = await this.prisma.conversationParticipant.findFirst({
      where: { conversationId, userId, conversation: { workspaceId } },
    });
    if (!participant) {
      throw new NotFoundException('Conversation not found');
    }

    if (mute) {
      await this.prisma.mutedChat.upsert({
        where: { userId_conversationId: { userId, conversationId } },
        update: {},
        create: { userId, conversationId },
      });
    } else {
      await this.prisma.mutedChat.deleteMany({
        where: { userId, conversationId },
      });
    }

    return { success: true, isMuted: mute };
  }

  async updateMemberRole(
    actorId: string,
    conversationId: string,
    targetUserId: string,
    newRole: string,
  ) {
    if (!['ADMIN', 'MEMBER'].includes(newRole)) {
      throw new BadRequestException('Role must be ADMIN or MEMBER');
    }

    const workspaceId = await this.getActiveWorkspaceId(actorId);
    const group = await this.prisma.group.findFirst({
      where: { conversationId, conversation: { workspaceId } },
      include: { members: true },
    });
    if (!group) {
      throw new NotFoundException('Group conversation not found');
    }

    const actorMember = group.members.find((m) => m.userId === actorId);
    const isOwner =
      actorMember?.role === 'OWNER' || group.createdBy === actorId;
    if (!isOwner) {
      throw new ForbiddenException(
        'Only the channel owner can change member roles',
      );
    }

    const targetMember = group.members.find((m) => m.userId === targetUserId);
    if (!targetMember) {
      throw new NotFoundException(
        'Target user is not a member of this channel',
      );
    }

    if (targetMember.role === 'OWNER') {
      throw new BadRequestException(
        'Cannot change the role of the channel owner',
      );
    }

    await this.prisma.groupMember.update({
      where: {
        conversationId_userId: { conversationId, userId: targetUserId },
      },
      data: { role: newRole },
    });

    const targetProfile = await this.prisma.userProfile.findFirst({
      where: { userId: targetUserId },
      select: { displayName: true },
    });
    const targetName = targetProfile?.displayName || 'User';
    await this.postSystemMessage(
      conversationId,
      actorId,
      'SYSTEM_UPDATE',
      `${targetName}'s role was changed to ${newRole}`,
    );

    return { success: true, userId: targetUserId, role: newRole };
  }

  async getChatsFeed(userId: string) {
    await this.getActiveWorkspaceId(userId);
    // Fetch all conversations where user is a participant
    const participants = await this.prisma.conversationParticipant.findMany({
      where: { userId },
      include: {
        conversation: {
          include: {
            group: true,
            participants: {
              where: {
                userId: { not: userId },
              },
              include: {
                user: {
                  include: { profile: true },
                },
              },
            },
            messages: {
              orderBy: { createdAt: 'desc' },
              take: 1,
            },
            mutedBy: {
              where: { userId },
            },
            pinnedMessages: {
              where: { pinnedBy: userId },
            },
            archivedBy: {
              where: { userId },
            },
          },
        },
      },
    });

    const feed = await Promise.all(
      participants.map(async (p) => {
        const c = p.conversation;

        // Calculate unread counts
        const unreadCount = await this.prisma.message.count({
          where: {
            conversationId: c.id,
            senderId: { not: userId },
            reads: {
              none: { userId },
            },
          },
        });

        // Determine recipient info for DIRECT chats
        let recipient = null;
        if (c.type === 'DIRECT' && c.participants.length > 0) {
          const directUser = c.participants[0].user;
          recipient = {
            id: directUser.id,
            email: directUser.email ?? null,
            displayName: directUser.profile?.displayName || 'User',
            avatarUrl: directUser.profile?.avatarUrl,
            aboutText: directUser.profile?.aboutText ?? null,
            availability: directUser.profile?.statusAvailability ?? null,
            presence: this.presence.isOnline(directUser.id)
              ? 'ONLINE'
              : 'OFFLINE',
          };
        }

        return {
          conversationId: c.id,
          type: c.type,
          group: c.group
            ? {
                name: c.group.name,
                description: c.group.description,
                teamName: c.group.teamName,
                channelSlug: c.group.channelSlug,
                spaceType: c.group.spaceType,
                isReadOnly: c.group.isReadOnly,
              }
            : null,
          name:
            c.type === 'GROUP' || c.type === 'BROADCAST'
              ? c.group?.name
              : recipient?.displayName || 'Direct Chat',
          avatarUrl:
            c.type === 'GROUP' || c.type === 'BROADCAST'
              ? c.group?.avatarUrl
              : recipient?.avatarUrl,
          unreadCount,
          isMuted: c.mutedBy.length > 0,
          isPinned: c.pinnedMessages.length > 0,
          isArchived: c.archivedBy.length > 0,
          isMember: true,
          lastMessage: c.messages[0]
            ? {
                id: c.messages[0].id,
                content: c.messages[0].content,
                senderId: c.messages[0].senderId,
                messageType: c.messages[0].messageType,
                createdAt: c.messages[0].createdAt,
              }
            : null,
          recipient,
        };
      }),
    );

    // Member-only: only conversations the user participates in (no workspace-wide discoverable list).

    // Sort by pinned first, then last message timestamp
    return [...feed].sort((a, b) => {
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;
      const timeA = a.lastMessage
        ? new Date(a.lastMessage.createdAt).getTime()
        : 0;
      const timeB = b.lastMessage
        ? new Date(b.lastMessage.createdAt).getTime()
        : 0;
      return timeB - timeA;
    });
  }

  /**
   * Loads a window centred on `messageId`, used when opening a search result.
   * Splits the budget either side so the hit lands mid-transcript with context
   * above and below.
   */
  private async getMessagesAround(
    conversationId: string,
    userId: string,
    messageId: string,
    limit: number,
  ) {
    const anchor = await this.prisma.message.findFirst({
      where: { id: messageId, conversationId },
      select: { id: true, createdAt: true },
    });
    // Unknown or foreign id: null tells the caller to serve the newest page.
    if (!anchor) return null;

    const half = Math.max(Math.floor(limit / 2), 1);
    const notDeletedForUser = {
      conversationId,
      NOT: { deletions: { some: { deletedBy: userId } } },
    };

    const [olderDesc, newerAsc] = await Promise.all([
      this.prisma.message.findMany({
        where: {
          ...notDeletedForUser,
          OR: [
            { createdAt: { lt: anchor.createdAt } },
            { createdAt: anchor.createdAt, id: { lt: anchor.id } },
          ],
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: half + 1, // extra row signals more history above
        include: MESSAGE_INCLUDE,
      }),
      this.prisma.message.findMany({
        where: {
          ...notDeletedForUser,
          OR: [
            { createdAt: { gt: anchor.createdAt } },
            { createdAt: anchor.createdAt, id: { gte: anchor.id } },
          ],
        },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take: half,
        include: MESSAGE_INCLUDE,
      }),
    ]);

    const hasMore = olderDesc.length > half;
    const older = (hasMore ? olderDesc.slice(0, half) : olderDesc).reverse();
    const messages = [...older, ...newerAsc];

    return {
      messages,
      hasMore,
      nextCursor: messages.length > 0 ? messages[0].id : null,
    };
  }

  /**
   * Returns one page of history, newest-first from the cursor, then reversed so
   * callers still render oldest -> newest.
   *
   * Paging is by `createdAt` with the message id as a tiebreaker, so messages
   * created within the same millisecond cannot be skipped or repeated.
   */
  async getMessagesHistory(
    conversationId: string,
    userId: string,
    options?: { limit?: number; before?: string; around?: string },
  ) {
    // Verify user is in conversation
    const participant = await this.prisma.conversationParticipant.findFirst({
      where: { conversationId, userId },
    });
    if (!participant) {
      throw new NotFoundException('Conversation not found or access denied');
    }

    const limit = Math.min(
      Math.max(options?.limit ?? DEFAULT_MESSAGE_PAGE_SIZE, 1),
      MAX_MESSAGE_PAGE_SIZE,
    );

    // Mark everything unread in one statement. The previous implementation
    // fetched every unread id and issued one upsert per message inside a single
    // transaction, which does not survive a channel with a large backlog.
    await this.prisma.$executeRaw`
      INSERT OR IGNORE INTO "MessageRead" ("id", "messageId", "userId", "readAt")
      SELECT lower(hex(randomblob(16))), m."id", ${userId}, CURRENT_TIMESTAMP
      FROM "Message" m
      WHERE m."conversationId" = ${conversationId}
        AND m."senderId" <> ${userId}
    `;

    // Jumping to a search hit: centre the page on that message so the reader
    // gets the surrounding conversation rather than an isolated line. A missing
    // anchor falls through to the normal newest-first page below.
    if (options?.around) {
      const window = await this.getMessagesAround(
        conversationId,
        userId,
        options.around,
        limit,
      );
      if (window) return window;
    }

    let cursor: { createdAt: Date; id: string } | null = null;
    if (options?.before) {
      const anchor = await this.prisma.message.findUnique({
        where: { id: options.before },
        select: { id: true, createdAt: true },
      });
      if (anchor) cursor = anchor;
    }

    const rows = await this.prisma.message.findMany({
      where: {
        conversationId,
        // Exclude messages the requesting user deleted for themselves
        NOT: { deletions: { some: { deletedBy: userId } } },
        ...(cursor
          ? {
              OR: [
                { createdAt: { lt: cursor.createdAt } },
                { createdAt: cursor.createdAt, id: { lt: cursor.id } },
              ],
            }
          : {}),
      },
      // Newest-first so the cursor walks backwards through history.
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      // One extra row tells us whether another page exists without a count().
      take: limit + 1,
      include: MESSAGE_INCLUDE,
    });

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;

    return {
      // Oldest -> newest, matching how the transcript is rendered.
      messages: page.reverse(),
      hasMore,
      // Feed this back as `before` to fetch the next page of older messages.
      nextCursor: hasMore && page.length > 0 ? page[0].id : null,
    };
  }
}
