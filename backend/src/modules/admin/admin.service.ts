import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma.service';
import {
  ALLOWED_NAV_KEYS,
  CapabilityKey,
  RolePermissionsMap,
} from '../../common/permissions.constants';
import { PermissionsService } from '../../common/permissions.service';
import { PresenceService } from '../../common/presence.service';
import { AuditService } from '../../common/audit.service';
import { isValidAvailability } from '../../config/status-availability';

const ADMIN_ROLES = new Set(['OWNER', 'ADMIN']);
const USER_ROLES = new Set(['OWNER', 'ADMIN', 'MANAGER', 'MEMBER', 'GUEST']);
const APPROVER_ROLES = new Set(['OWNER', 'ADMIN', 'MANAGER']);
const APPROVAL_SCOPES = new Set([
  'USER_CREATION',
  'USER_EDITS',
  'CHANNEL_CREATION',
  'FILE_DOWNLOADS',
]);

const DEFAULT_APPROVAL_SETTINGS: ApprovalSettings = {
  enabled: true,
  requiredApprovals: 1,
  approverRole: 'ADMIN',
  appliesTo: ['USER_CREATION', 'USER_EDITS'],
  autoApproveAdmins: true,
  escalationHours: 24,
};

type AdminActor = {
  workspaceId: string;
  role: string;
};

type AdminUserRecord = {
  userId: string;
  role: string;
  department: string | null;
  joinedAt: Date;
  isActive: boolean;
  canPostAnnouncements: boolean;
  allowedNavKeys?: unknown;
  user: {
    id: string;
    email: string | null;
    phoneNumber: string | null;
    createdAt: Date;
    profile: {
      displayName: string;
      avatarUrl: string | null;
      aboutText: string;
      statusAvailability: string | null;
      lastSeen: Date | null;
    } | null;
  };
};

type CreateUserBody = {
  email?: string;
  phoneNumber?: string | null;
  password?: string;
  displayName?: string;
  role?: string;
  department?: string | null;
  statusAvailability?: string;
  aboutText?: string;
  isActive?: boolean;
  canPostAnnouncements?: boolean;
  allowedNavKeys?: string[] | null;
  announcementPublisherConversationIds?: string[];
};

type UpdateUserBody = CreateUserBody & {
  avatarUrl?: string | null;
  announcementPublisherConversationIds?: string[];
};

type ApprovalSettings = {
  enabled: boolean;
  requiredApprovals: number;
  approverRole: string;
  appliesTo: string[];
  autoApproveAdmins: boolean;
  escalationHours: number;
};

@Injectable()
export class AdminService {
  constructor(
    private prisma: PrismaService,
    private permissionsService: PermissionsService,
    private presence: PresenceService,
    private auditService: AuditService,
  ) {}

  private async getWorkspaceActor(userId: string): Promise<
    AdminActor & {
      canPostAnnouncements: boolean;
      allowedNavKeys?: unknown;
    }
  > {
    const workspaceUser = await this.prisma.workspaceUser.findFirst({
      where: { userId, isActive: true },
      orderBy: { joinedAt: 'asc' },
    });

    if (!workspaceUser) {
      throw new ForbiddenException('User is not part of an active workspace');
    }

    return {
      workspaceId: workspaceUser.workspaceId,
      role: workspaceUser.role,
      canPostAnnouncements: workspaceUser.canPostAnnouncements,
      allowedNavKeys: workspaceUser.allowedNavKeys,
    };
  }

  private async assertCapability(
    userId: string,
    capability: CapabilityKey,
  ): Promise<AdminActor> {
    const actor = await this.getWorkspaceActor(userId);
    const { hasCustom } = await this.permissionsService.loadRolePermissionsMap(
      actor.workspaceId,
    );

    if (!hasCustom && ADMIN_ROLES.has(actor.role)) {
      return { workspaceId: actor.workspaceId, role: actor.role };
    }

    const effective = await this.permissionsService.resolveForWorkspaceUser(
      actor.workspaceId,
      actor,
    );

    if (this.permissionsService.hasCapability(effective, capability)) {
      return { workspaceId: actor.workspaceId, role: actor.role };
    }

    throw new ForbiddenException('Admin access is required');
  }

  private async assertAnyCapability(
    userId: string,
    capabilities: CapabilityKey[],
  ): Promise<AdminActor> {
    for (const capability of capabilities) {
      try {
        return await this.assertCapability(userId, capability);
      } catch {
        // try next capability
      }
    }
    throw new ForbiddenException('Admin access is required');
  }

  private normalizeRequiredText(value: string | undefined, label: string) {
    const normalized = value?.trim();
    if (!normalized) {
      throw new BadRequestException(`${label} is required`);
    }
    return normalized;
  }

  private normalizeDisplayName(value: string | undefined, label = 'Display name') {
    const text = this.normalizeRequiredText(value, label);
    if (/[^\p{L}\p{N}\s.'-]/u.test(text)) {
      throw new BadRequestException(
        `${label} cannot contain symbols or special characters`,
      );
    }
    return text;
  }

  private normalizeOptionalText(value: string | null | undefined) {
    if (value === undefined) return undefined;
    const normalized = value?.trim();
    return normalized || null;
  }

  private normalizeRole(role: string | undefined, fallback = 'MEMBER') {
    const normalized = (role || fallback).trim().toUpperCase();
    if (!USER_ROLES.has(normalized)) {
      throw new BadRequestException('Role is not supported');
    }
    return normalized;
  }

  /**
   * Normalises a declared availability override. An unset value means "no
   * override" (null) - it does not mean offline, which is decided purely by
   * whether the user holds a live socket.
   */
  private normalizeStatus(status: string | undefined): string | null {
    const normalized = status?.trim().toUpperCase();
    if (!normalized) return null;
    if (!isValidAvailability(normalized)) {
      throw new BadRequestException('Status is not supported');
    }
    return normalized;
  }

  private normalizeAllowedNavKeys(
    value: string[] | null,
  ): Prisma.InputJsonValue | typeof Prisma.JsonNull {
    if (value === null) {
      return Prisma.JsonNull;
    }
    const unique = [...new Set(value.map((k) => String(k).trim()))].filter(
      Boolean,
    );
    for (const k of unique) {
      if (!ALLOWED_NAV_KEYS.has(k)) {
        throw new BadRequestException(`Unknown nav key: ${k}`);
      }
    }
    return unique;
  }

  private navKeysForPrisma(
    value: string[] | null | undefined,
  ): Prisma.InputJsonValue | typeof Prisma.JsonNull | undefined {
    if (value === undefined) return undefined;
    if (value === null) return Prisma.JsonNull;
    return this.normalizeAllowedNavKeys(value);
  }

  private async assertAnnouncementChannels(
    tx: Prisma.TransactionClient,
    workspaceId: string,
    conversationIds: string[],
  ) {
    const unique = [...new Set(conversationIds)];
    if (unique.length === 0) return;
    const found = await tx.conversation.count({
      where: {
        id: { in: unique },
        workspaceId,
        group: { spaceType: 'ANNOUNCEMENT' },
      },
    });
    if (found !== unique.length) {
      throw new BadRequestException(
        'Each announcement publisher channel must be an announcement space in this workspace',
      );
    }
  }

  private mapUser(
    record: AdminUserRecord,
    options?: {
      announcementPublisherConversationIds?: string[];
      lastLoginAt?: Date | null;
    },
  ) {
    let allowedNavKeys: string[] | null = null;
    const raw = record.allowedNavKeys;
    if (Array.isArray(raw) && raw.every((x) => typeof x === 'string')) {
      allowedNavKeys = raw;
    }
    return {
      userId: record.user.id,
      email: record.user.email,
      phoneNumber: record.user.phoneNumber,
      displayName: record.user.profile?.displayName || 'User',
      avatarUrl: record.user.profile?.avatarUrl,
      aboutText: record.user.profile?.aboutText,
      // Declared override (durable) and live connection state (derived) are
      // reported separately; the client combines them for display.
      availability: record.user.profile?.statusAvailability ?? null,
      presence: this.presence.isOnline(record.user.id) ? 'ONLINE' : 'OFFLINE',
      lastSeen: record.user.profile?.lastSeen ?? null,
      lastLoginAt: options?.lastLoginAt ?? null,
      role: record.role,
      department: record.department,
      isActive: record.isActive,
      canPostAnnouncements: record.canPostAnnouncements,
      allowedNavKeys,
      announcementPublisherConversationIds:
        options?.announcementPublisherConversationIds ?? [],
      joinedAt: record.joinedAt,
      createdAt: record.user.createdAt,
    };
  }

  private async getWorkspaceUser(workspaceId: string, userId: string) {
    const record = await this.prisma.workspaceUser.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId,
          userId,
        },
      },
      include: {
        user: {
          include: { profile: true },
        },
      },
    });

    if (!record) {
      throw new NotFoundException('Workspace user not found');
    }

    const pubs = await this.prisma.announcementPublisher.findMany({
      where: { workspaceId, userId },
      select: { conversationId: true },
    });

    return this.mapUser(record, {
      announcementPublisherConversationIds: pubs.map((p) => p.conversationId),
    });
  }

  private async ensureUniqueIdentity(
    email: string | undefined,
    phoneNumber: string | null | undefined,
    excludeUserId?: string,
  ) {
    if (email) {
      const existingEmail = await this.prisma.user.findUnique({
        where: { email },
      });
      if (existingEmail && existingEmail.id !== excludeUserId) {
        throw new BadRequestException('Email already registered');
      }
    }

    if (phoneNumber) {
      const existingPhone = await this.prisma.user.findUnique({
        where: { phoneNumber },
      });
      if (existingPhone && existingPhone.id !== excludeUserId) {
        throw new BadRequestException('Phone number already registered');
      }
    }
  }

  private ensureRoleAssignmentAllowed(actorRole: string, nextRole: string) {
    if (nextRole === 'OWNER' && actorRole !== 'OWNER') {
      throw new ForbiddenException(
        'Only workspace owners can assign owner role',
      );
    }
  }

  private async ensureOwnerRemains(
    workspaceId: string,
    targetUserId: string,
    nextRole: string | undefined,
    nextIsActive: boolean | undefined,
  ) {
    const current = await this.prisma.workspaceUser.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId,
          userId: targetUserId,
        },
      },
    });

    if (!current || current.role !== 'OWNER') return;

    const removesOwner =
      (nextRole !== undefined && nextRole !== 'OWNER') ||
      nextIsActive === false;
    if (!removesOwner) return;

    const remainingOwners = await this.prisma.workspaceUser.count({
      where: {
        workspaceId,
        role: 'OWNER',
        isActive: true,
        userId: { not: targetUserId },
      },
    });

    if (remainingOwners === 0) {
      throw new BadRequestException(
        'Workspace must keep at least one active owner',
      );
    }
  }

  async listUsers(adminUserId: string) {
    const actor = await this.assertCapability(adminUserId, 'manageUsers');
    const users = await this.prisma.workspaceUser.findMany({
      where: { workspaceId: actor.workspaceId },
      include: {
        user: {
          include: { profile: true },
        },
      },
      orderBy: [{ isActive: 'desc' }, { joinedAt: 'asc' }],
    });

    const publishers = await this.prisma.announcementPublisher.findMany({
      where: { workspaceId: actor.workspaceId },
      select: { userId: true, conversationId: true },
    });
    const pubByUser = new Map<string, string[]>();
    for (const row of publishers) {
      const list = pubByUser.get(row.userId) ?? [];
      list.push(row.conversationId);
      pubByUser.set(row.userId, list);
    }

    const userIds = users.map((u) => u.userId);
    const lastLogins = await this.prisma.loginSession.findMany({
      where: { userId: { in: userIds } },
      orderBy: { createdAt: 'desc' },
      distinct: ['userId'],
      select: { userId: true, createdAt: true },
    });
    const lastLoginByUser = new Map(
      lastLogins.map((s) => [s.userId, s.createdAt]),
    );

    return users.map((user) =>
      this.mapUser(user, {
        announcementPublisherConversationIds: pubByUser.get(user.userId) ?? [],
        lastLoginAt: lastLoginByUser.get(user.userId) ?? null,
      }),
    );
  }

  /**
   * Admin-visible audit trail. Entries have been written since the admin
   * module was built but were never readable outside the database.
   */
  async listAuditLog(
    adminUserId: string,
    options?: { limit?: number; before?: string },
  ) {
    const actor = await this.assertCapability(adminUserId, 'manageUsers');
    return await this.auditService.list(actor.workspaceId, options);
  }

  async createUser(adminUserId: string, body: CreateUserBody) {
    const actor = await this.assertCapability(adminUserId, 'manageUsers');
    const email = this.normalizeRequiredText(body.email, 'Email').toLowerCase();
    const displayName = this.normalizeDisplayName(
      body.displayName,
      'Display name',
    );
    const password = this.normalizeRequiredText(body.password, 'Password');
    if (password.length < 8) {
      throw new BadRequestException('Password must be at least 8 characters');
    }

    const role = this.normalizeRole(body.role);
    this.ensureRoleAssignmentAllowed(actor.role, role);
    const statusAvailability = this.normalizeStatus(body.statusAvailability);
    const department = this.normalizeOptionalText(body.department);
    const phoneNumber = this.normalizeOptionalText(body.phoneNumber);
    const aboutText =
      this.normalizeOptionalText(body.aboutText) ||
      `${displayName} at workspace`;
    await this.ensureUniqueIdentity(email, phoneNumber);

    const passwordHash = await bcrypt.hash(password, 10);

    const created = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email,
          phoneNumber,
          passwordHash,
          profile: {
            create: {
              displayName,
              aboutText,
              statusAvailability,
            },
          },
          workspaceUsers: {
            create: {
              workspaceId: actor.workspaceId,
              role,
              department,
              isActive: body.isActive ?? true,
              canPostAnnouncements: body.canPostAnnouncements ?? false,
              allowedNavKeys: this.navKeysForPrisma(body.allowedNavKeys),
            },
          },
        },
      });

      if (
        body.announcementPublisherConversationIds &&
        body.announcementPublisherConversationIds.length > 0
      ) {
        await this.assertAnnouncementChannels(
          tx,
          actor.workspaceId,
          body.announcementPublisherConversationIds,
        );
        await tx.announcementPublisher.createMany({
          data: body.announcementPublisherConversationIds.map(
            (conversationId) => ({
              workspaceId: actor.workspaceId,
              conversationId,
              userId: user.id,
            }),
          ),
        });
      }

      await tx.auditLog.create({
        data: {
          workspaceId: actor.workspaceId,
          performedBy: adminUserId,
          action: 'ADMIN_USER_CREATED',
          targetResource: 'User',
          targetId: user.id,
          payload: JSON.stringify({
            email,
            role,
            department,
            isActive: body.isActive ?? true,
            canPostAnnouncements: body.canPostAnnouncements ?? false,
          }),
        },
      });

      return user;
    });

    return await this.getWorkspaceUser(actor.workspaceId, created.id);
  }

  async updateUser(
    adminUserId: string,
    targetUserId: string,
    body: UpdateUserBody,
  ) {
    const actor = await this.assertCapability(adminUserId, 'manageUsers');
    const existing = await this.prisma.workspaceUser.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId: actor.workspaceId,
          userId: targetUserId,
        },
      },
      include: { user: { include: { profile: true } } },
    });

    if (!existing) {
      throw new NotFoundException('Workspace user not found');
    }

    if (existing.role === 'OWNER' && actor.role !== 'OWNER') {
      throw new ForbiddenException('Only workspace owners can edit owners');
    }

    const nextRole =
      body.role === undefined ? undefined : this.normalizeRole(body.role);
    if (nextRole) {
      this.ensureRoleAssignmentAllowed(actor.role, nextRole);
    }

    if (adminUserId === targetUserId) {
      if (body.isActive === false) {
        throw new BadRequestException('You cannot deactivate your own account');
      }
      if (nextRole && !ADMIN_ROLES.has(nextRole)) {
        throw new BadRequestException(
          'You cannot remove your own admin access',
        );
      }
    }

    await this.ensureOwnerRemains(
      actor.workspaceId,
      targetUserId,
      nextRole,
      body.isActive,
    );

    const email =
      body.email === undefined
        ? undefined
        : this.normalizeRequiredText(body.email, 'Email').toLowerCase();
    const phoneNumber = this.normalizeOptionalText(body.phoneNumber);
    await this.ensureUniqueIdentity(email, phoneNumber, targetUserId);

    const password =
      body.password === undefined
        ? undefined
        : this.normalizeRequiredText(body.password, 'Password');
    if (password !== undefined && password.length < 8) {
      throw new BadRequestException('Password must be at least 8 characters');
    }
    const passwordHash = password ? await bcrypt.hash(password, 10) : undefined;

    const profileUpdate = {
      displayName:
        body.displayName === undefined
          ? undefined
          : this.normalizeDisplayName(body.displayName, 'Display name'),
      aboutText:
        body.aboutText === undefined
          ? undefined
          : body.aboutText.trim() || 'Hey there! I am using Veloce.',
      avatarUrl: this.normalizeOptionalText(body.avatarUrl),
      statusAvailability:
        body.statusAvailability === undefined
          ? undefined
          : this.normalizeStatus(body.statusAvailability),
    };

    await this.prisma.$transaction(async (tx) => {
      if (email !== undefined || phoneNumber !== undefined || passwordHash) {
        await tx.user.update({
          where: { id: targetUserId },
          data: {
            email,
            phoneNumber,
            passwordHash,
          },
        });
      }

      // Mirror the user-initiated password change: a new password must
      // invalidate any live sessions.
      if (passwordHash) {
        await tx.loginSession.updateMany({
          where: { userId: targetUserId, isRevoked: false },
          data: { isRevoked: true },
        });
      }

      if (
        profileUpdate.displayName !== undefined ||
        profileUpdate.aboutText !== undefined ||
        profileUpdate.avatarUrl !== undefined ||
        profileUpdate.statusAvailability !== undefined
      ) {
        await tx.userProfile.upsert({
          where: { userId: targetUserId },
          update: profileUpdate,
          create: {
            userId: targetUserId,
            displayName:
              profileUpdate.displayName ||
              existing.user.profile?.displayName ||
              'User',
            aboutText:
              profileUpdate.aboutText ||
              existing.user.profile?.aboutText ||
              'Hey there! I am using Veloce.',
            avatarUrl: profileUpdate.avatarUrl,
            statusAvailability:
              profileUpdate.statusAvailability ??
              existing.user.profile?.statusAvailability ??
              null,
          },
        });
      }

      const workspaceUserData: Prisma.WorkspaceUserUpdateInput = {};
      if (nextRole !== undefined) workspaceUserData.role = nextRole;
      if (body.department !== undefined) {
        workspaceUserData.department = this.normalizeOptionalText(
          body.department,
        );
      }
      if (body.isActive !== undefined)
        workspaceUserData.isActive = body.isActive;
      if (body.canPostAnnouncements !== undefined) {
        workspaceUserData.canPostAnnouncements = body.canPostAnnouncements;
      }
      if (body.allowedNavKeys !== undefined) {
        workspaceUserData.allowedNavKeys = this.navKeysForPrisma(
          body.allowedNavKeys,
        );
      }

      if (Object.keys(workspaceUserData).length > 0) {
        await tx.workspaceUser.update({
          where: {
            workspaceId_userId: {
              workspaceId: actor.workspaceId,
              userId: targetUserId,
            },
          },
          data: workspaceUserData,
        });
      }

      if (body.announcementPublisherConversationIds !== undefined) {
        await tx.announcementPublisher.deleteMany({
          where: {
            workspaceId: actor.workspaceId,
            userId: targetUserId,
          },
        });
        const ids = body.announcementPublisherConversationIds;
        if (ids.length > 0) {
          await this.assertAnnouncementChannels(tx, actor.workspaceId, ids);
          await tx.announcementPublisher.createMany({
            data: ids.map((conversationId) => ({
              workspaceId: actor.workspaceId,
              conversationId,
              userId: targetUserId,
            })),
          });
        }
      }

      await tx.auditLog.create({
        data: {
          workspaceId: actor.workspaceId,
          performedBy: adminUserId,
          action: 'ADMIN_USER_UPDATED',
          targetResource: 'User',
          targetId: targetUserId,
          payload: JSON.stringify({
            email,
            phoneNumber,
            role: nextRole,
            department:
              body.department === undefined
                ? undefined
                : this.normalizeOptionalText(body.department),
            isActive: body.isActive,
            canPostAnnouncements: body.canPostAnnouncements,
            allowedNavKeys: body.allowedNavKeys,
            announcementPublisherConversationIds:
              body.announcementPublisherConversationIds,
            passwordReset: Boolean(passwordHash),
          }),
        },
      });
    });

    return await this.getWorkspaceUser(actor.workspaceId, targetUserId);
  }

  async getApprovalCycle(adminUserId: string) {
    const actor = await this.assertCapability(adminUserId, 'manageSettings');
    const setting = await this.prisma.setting.findUnique({
      where: {
        tenantType_tenantId_key: {
          tenantType: 'WORKSPACE',
          tenantId: actor.workspaceId,
          key: 'approval_cycle',
        },
      },
    });

    if (!setting) {
      return DEFAULT_APPROVAL_SETTINGS;
    }

    try {
      return this.normalizeApprovalSettings(JSON.parse(setting.value));
    } catch {
      return DEFAULT_APPROVAL_SETTINGS;
    }
  }

  async updateApprovalCycle(
    adminUserId: string,
    body: Partial<ApprovalSettings>,
  ) {
    const actor = await this.assertCapability(adminUserId, 'manageSettings');
    const current = await this.getApprovalCycle(adminUserId);
    const next = this.normalizeApprovalSettings({
      ...current,
      ...body,
    });

    await this.prisma.$transaction(async (tx) => {
      await tx.setting.upsert({
        where: {
          tenantType_tenantId_key: {
            tenantType: 'WORKSPACE',
            tenantId: actor.workspaceId,
            key: 'approval_cycle',
          },
        },
        update: { value: JSON.stringify(next) },
        create: {
          tenantType: 'WORKSPACE',
          tenantId: actor.workspaceId,
          key: 'approval_cycle',
          value: JSON.stringify(next),
        },
      });

      await tx.auditLog.create({
        data: {
          workspaceId: actor.workspaceId,
          performedBy: adminUserId,
          action: 'APPROVAL_CYCLE_UPDATED',
          targetResource: 'Setting',
          targetId: 'approval_cycle',
          payload: JSON.stringify(next),
        },
      });
    });

    return next;
  }

  private normalizeApprovalSettings(value: unknown): ApprovalSettings {
    const input =
      value && typeof value === 'object'
        ? (value as Partial<ApprovalSettings>)
        : {};

    const enabled =
      typeof input.enabled === 'boolean'
        ? input.enabled
        : DEFAULT_APPROVAL_SETTINGS.enabled;
    const requiredApprovals = Number(input.requiredApprovals);
    if (
      !Number.isInteger(requiredApprovals) ||
      requiredApprovals < 1 ||
      requiredApprovals > 5
    ) {
      throw new BadRequestException(
        'Required approvals must be between 1 and 5',
      );
    }

    const approverRoleSource =
      typeof input.approverRole === 'string'
        ? input.approverRole
        : DEFAULT_APPROVAL_SETTINGS.approverRole;
    const approverRole = approverRoleSource.trim().toUpperCase();
    if (!APPROVER_ROLES.has(approverRole)) {
      throw new BadRequestException('Approver role is not supported');
    }

    const appliesTo = Array.isArray(input.appliesTo)
      ? input.appliesTo.map((item) =>
          typeof item === 'string' ? item.trim().toUpperCase() : '',
        )
      : DEFAULT_APPROVAL_SETTINGS.appliesTo;
    if (
      appliesTo.length === 0 ||
      appliesTo.some((item) => !APPROVAL_SCOPES.has(item))
    ) {
      throw new BadRequestException('Approval scope is not supported');
    }

    const autoApproveAdmins =
      typeof input.autoApproveAdmins === 'boolean'
        ? input.autoApproveAdmins
        : DEFAULT_APPROVAL_SETTINGS.autoApproveAdmins;
    const escalationHours = Number(input.escalationHours);
    if (
      !Number.isInteger(escalationHours) ||
      escalationHours < 1 ||
      escalationHours > 168
    ) {
      throw new BadRequestException(
        'Escalation hours must be between 1 and 168',
      );
    }

    return {
      enabled,
      requiredApprovals,
      approverRole,
      appliesTo: Array.from(new Set(appliesTo)),
      autoApproveAdmins,
      escalationHours,
    };
  }

  csvImportTemplate(): string {
    return 'email,displayName,password,phoneNumber,role,department\n';
  }

  async importUsersFromCsv(
    adminUserId: string,
    csv: string,
  ): Promise<{
    created: number;
    skipped: number;
    errors: Array<{ line: number; message: string }>;
  }> {
    await this.assertCapability(adminUserId, 'importUsers');
    const trimmed = csv.trim();
    if (!trimmed) {
      throw new BadRequestException('CSV body is empty');
    }

    const lines = trimmed
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    if (lines.length < 2) {
      throw new BadRequestException(
        'CSV must include a header row and at least one data row',
      );
    }

    const parseRow = (line: string) =>
      line.split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
    const header = parseRow(lines[0]).map((h) =>
      h.replace(/^\uFEFF/, '').toLowerCase(),
    );
    const findCol = (...names: string[]) => {
      for (const n of names) {
        const j = header.indexOf(n.toLowerCase());
        if (j >= 0) return j;
      }
      return -1;
    };

    const iEmail = findCol('email');
    const iDisplay = findCol('displayname', 'name', 'fullname');
    const iPassword = findCol('password');
    if (iEmail < 0 || iDisplay < 0 || iPassword < 0) {
      throw new BadRequestException(
        'CSV header must include: email, displayName (or name), password',
      );
    }
    const iPhone = findCol('phonenumber', 'phone');
    const iRole = findCol('role');
    const iDept = findCol('department');

    let created = 0;
    let skipped = 0;
    const errors: Array<{ line: number; message: string }> = [];

    for (let li = 1; li < lines.length; li++) {
      const cols = parseRow(lines[li]);
      const email = cols[iEmail]?.trim();
      const displayName = cols[iDisplay]?.trim();
      const password = cols[iPassword]?.trim();
      const phoneNumber = iPhone >= 0 ? cols[iPhone]?.trim() || null : null;
      const role = iRole >= 0 ? cols[iRole]?.trim() || undefined : undefined;
      const department = iDept >= 0 ? cols[iDept]?.trim() || null : null;

      if (!email || !displayName || !password) {
        errors.push({
          line: li + 1,
          message: 'Missing email, display name, or password',
        });
        continue;
      }

      try {
        await this.createUser(adminUserId, {
          email,
          displayName,
          password,
          phoneNumber: phoneNumber || null,
          role,
          department,
        });
        created++;
      } catch (e: unknown) {
        const msg =
          e instanceof BadRequestException
            ? e.message
            : e instanceof Error
              ? e.message
              : 'Unknown error';
        if (
          msg.includes('already registered') ||
          msg.includes('Phone number already')
        ) {
          skipped++;
        } else {
          errors.push({ line: li + 1, message: msg });
        }
      }
    }

    return { created, skipped, errors };
  }

  async getRolePermissions(adminUserId: string): Promise<RolePermissionsMap> {
    const actor = await this.assertAnyCapability(adminUserId, [
      'manageRoles',
      'manageSettings',
    ]);
    const { map } = await this.permissionsService.loadRolePermissionsMap(
      actor.workspaceId,
    );
    return map;
  }

  async updateRolePermissions(
    adminUserId: string,
    body: Partial<RolePermissionsMap>,
  ): Promise<RolePermissionsMap> {
    const actor = await this.assertCapability(adminUserId, 'manageRoles');
    const next = this.permissionsService.normalizeRolePermissionsMap(body);

    await this.prisma.$transaction(async (tx) => {
      await tx.setting.upsert({
        where: {
          tenantType_tenantId_key: {
            tenantType: 'WORKSPACE',
            tenantId: actor.workspaceId,
            key: 'role_permissions',
          },
        },
        update: { value: JSON.stringify(next) },
        create: {
          tenantType: 'WORKSPACE',
          tenantId: actor.workspaceId,
          key: 'role_permissions',
          value: JSON.stringify(next),
        },
      });

      await tx.auditLog.create({
        data: {
          workspaceId: actor.workspaceId,
          performedBy: adminUserId,
          action: 'ROLE_PERMISSIONS_UPDATED',
          targetResource: 'Setting',
          targetId: 'role_permissions',
          payload: JSON.stringify(next),
        },
      });
    });

    return next;
  }
}
