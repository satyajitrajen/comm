import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { PresenceService } from '../../common/presence.service';
import { isValidAvailability } from '../../config/status-availability';

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private presence: PresenceService,
  ) {}

  async getWorkspaceDirectory(userId: string) {
    const workspaceUser = await this.prisma.workspaceUser.findFirst({
      where: { userId, isActive: true },
    });
    if (!workspaceUser) {
      throw new BadRequestException('User is not part of any active workspace');
    }

    const members = await this.prisma.workspaceUser.findMany({
      where: { workspaceId: workspaceUser.workspaceId, isActive: true },
      include: {
        user: {
          include: { profile: true },
        },
      },
    });

    return members.map((m) => ({
      userId: m.user.id,
      email: m.user.email,
      phoneNumber: m.user.phoneNumber,
      displayName: m.user.profile?.displayName || 'User',
      avatarUrl: m.user.profile?.avatarUrl,
      aboutText: m.user.profile?.aboutText,
      availability: m.user.profile?.statusAvailability ?? null,
      presence: this.presence.isOnline(m.user.id) ? 'ONLINE' : 'OFFLINE',
      role: m.role,
      department: m.department,
      canPostAnnouncements: m.canPostAnnouncements,
    }));
  }

  async updateProfile(
    userId: string,
    body: {
      displayName?: string;
      aboutText?: string;
      avatarUrl?: string;
      statusAvailability?: string;
    },
  ) {
    const profile = await this.prisma.userProfile.update({
      where: { userId },
      data: {
        displayName: body.displayName,
        aboutText: body.aboutText,
        avatarUrl: body.avatarUrl,
        statusAvailability: this.normalizeAvailability(body.statusAvailability),
      },
    });

    return {
      ...profile,
      availability: profile.statusAvailability,
      presence: this.presence.isOnline(userId) ? 'ONLINE' : 'OFFLINE',
    };
  }

  /**
   * Validates a self-service availability change.
   *
   * `undefined` leaves the stored value alone. An empty value - or the legacy
   * 'ACTIVE'/'OFFLINE', which described connection state rather than intent -
   * clears the override, letting live presence speak for itself.
   */
  private normalizeAvailability(
    value: string | undefined,
  ): string | null | undefined {
    if (value === undefined) return undefined;

    const normalized = value.trim().toUpperCase();
    if (!normalized || normalized === 'ACTIVE' || normalized === 'OFFLINE') {
      return null;
    }
    if (!isValidAvailability(normalized)) {
      throw new BadRequestException('Status is not supported');
    }
    return normalized;
  }
}
