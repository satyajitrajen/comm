import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

/**
 * Append-only record of administrative actions.
 *
 * The `AuditLog` table existed with no writer, so nothing recorded who changed
 * a role, removed a member, deactivated an account, or deleted a message —
 * a gap that matters for any workspace product with an admin tier.
 *
 * Writes are best-effort and never block the action being audited: losing the
 * ability to log must not make the product unusable.
 */
export const AUDIT = {
  USER_CREATED: 'USER_CREATED',
  USER_UPDATED: 'USER_UPDATED',
  USER_ROLE_CHANGED: 'USER_ROLE_CHANGED',
  USER_DEACTIVATED: 'USER_DEACTIVATED',
  USER_REACTIVATED: 'USER_REACTIVATED',
  USERS_IMPORTED: 'USERS_IMPORTED',
  SETTING_CHANGED: 'SETTING_CHANGED',
  ROLE_PERMISSIONS_CHANGED: 'ROLE_PERMISSIONS_CHANGED',
  MESSAGE_DELETED: 'MESSAGE_DELETED',
} as const;

export type AuditAction = (typeof AUDIT)[keyof typeof AUDIT];

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private prisma: PrismaService) {}

  async record(entry: {
    workspaceId?: string | null;
    performedBy?: string | null;
    action: AuditAction;
    targetResource: string;
    targetId?: string | null;
    payload?: unknown;
    ipAddress?: string | null;
  }): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          workspaceId: entry.workspaceId ?? null,
          performedBy: entry.performedBy ?? null,
          action: entry.action,
          targetResource: entry.targetResource,
          targetId: entry.targetId ?? null,
          payload:
            entry.payload === undefined ? null : JSON.stringify(entry.payload),
          ipAddress: entry.ipAddress ?? null,
        },
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'unknown error';
      this.logger.warn(`[AUDIT] Could not record ${entry.action}: ${reason}`);
    }
  }

  /** Newest-first page of a workspace's audit trail, for the admin viewer. */
  async list(
    workspaceId: string,
    options?: { limit?: number; before?: string },
  ) {
    const limit = Math.min(Math.max(options?.limit ?? 50, 1), 200);

    let cursor: { createdAt: Date; id: string } | null = null;
    if (options?.before) {
      const anchor = await this.prisma.auditLog.findUnique({
        where: { id: options.before },
        select: { id: true, createdAt: true },
      });
      if (anchor) cursor = anchor;
    }

    const rows = await this.prisma.auditLog.findMany({
      where: {
        workspaceId,
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
      include: {
        actor: {
          select: { id: true, profile: { select: { displayName: true } } },
        },
      },
    });

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    return {
      entries: page,
      hasMore,
      nextCursor: hasMore && page.length > 0 ? page[page.length - 1].id : null,
    };
  }
}
