import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';

@Injectable()
export class CalendarService implements OnModuleInit {
  private readonly logger = new Logger(CalendarService.name);

  constructor(
    private prisma: PrismaService,
    private realtimeGateway: RealtimeGateway,
  ) {}

  onModuleInit() {
    // Run reminder check every 60 seconds
    setInterval(() => {
      this.checkUpcomingEventReminders().catch((err) => {
        this.logger.error(
          '[CalendarService] Error checking reminders',
          err instanceof Error ? err.stack : String(err),
        );
      });
    }, 60000);
  }

  private async getWorkspaceId(userId: string) {
    const workspaceUser = await this.prisma.workspaceUser.findFirst({
      where: { userId, isActive: true },
    });

    if (!workspaceUser) {
      throw new ForbiddenException('User is not part of an active workspace');
    }

    return workspaceUser.workspaceId;
  }

  private generateMeetingRoomLink(): string {
    const base = (
      process.env.MEETING_ROOM_BASE_URL || 'https://teamtime.live'
    ).replace(/\/$/, '');
    const code = randomBytes(9)
      .toString('base64')
      .replace(/[+/=]/g, '')
      .slice(0, 12);
    return `${base}/room/${code}`;
  }

  async getEvents(userId: string, start?: string, end?: string) {
    const workspaceId = await this.getWorkspaceId(userId);

    return await this.prisma.calendarEvent.findMany({
      where: {
        workspaceId,
        startsAt: start ? { gte: new Date(start) } : undefined,
        endsAt: end ? { lte: new Date(end) } : undefined,
      },
      include: {
        attendees: {
          include: {
            user: {
              include: {
                profile: true,
              },
            },
          },
        },
      },
      orderBy: { startsAt: 'asc' },
    });
  }

  async createEvent(
    userId: string,
    body: {
      title: string;
      description?: string;
      startsAt: string;
      endsAt: string;
      teamName?: string;
      meetingLink?: string;
      attendeeIds?: string[];
    },
  ) {
    if (!body.title?.trim()) {
      throw new BadRequestException('Title is required');
    }

    const startsAt = new Date(body.startsAt);
    const endsAt = new Date(body.endsAt);

    if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
      throw new BadRequestException('Valid start and end times are required');
    }

    if (endsAt <= startsAt) {
      throw new BadRequestException('End time must be after start time');
    }

    const workspaceId = await this.getWorkspaceId(userId);

    // Validate attendees are members of this workspace
    const attendeeIds = Array.from(new Set(body.attendeeIds ?? []));
    if (attendeeIds.length > 0) {
      const memberCount = await this.prisma.workspaceUser.count({
        where: {
          workspaceId,
          userId: { in: attendeeIds },
          isActive: true,
        },
      });
      if (memberCount !== attendeeIds.length) {
        throw new BadRequestException(
          'One or more attendees are not members of this workspace',
        );
      }
    }

    const meetingLink = this.generateMeetingRoomLink();

    const event = await this.prisma.calendarEvent.create({
      data: {
        workspaceId,
        title: body.title,
        description: body.description,
        startsAt,
        endsAt,
        teamName: body.teamName,
        meetingLink,
        createdBy: userId,
        attendees: {
          create: attendeeIds.map((id) => ({ userId: id })),
        },
      },
      include: {
        attendees: {
          include: {
            user: {
              include: {
                profile: true,
              },
            },
          },
        },
      },
    });

    // Notify attendees immediately about the new event creation
    if (attendeeIds.length > 0) {
      const creatorProfile = await this.prisma.userProfile.findFirst({
        where: { userId },
        select: { displayName: true },
      });
      const creatorName = creatorProfile?.displayName || 'Someone';

      for (const targetUserId of attendeeIds) {
        // Skip notifying the creator themselves
        if (targetUserId === userId) continue;

        try {
          await this.prisma.notification.create({
            data: {
              userId: targetUserId,
              title: `New Event Invitation`,
              body: `${creatorName} invited you to "${body.title}" scheduled for ${startsAt.toLocaleString()}`,
              notificationType: 'SYSTEM_ALERT',
              resourceId: event.id,
            },
          });
        } catch (e) {
          this.logger.error(
            '[CalendarService] Failed to create database notification',
            e instanceof Error ? e.stack : String(e),
          );
        }
      }

      // Broadcast realtime notification to connected users (excluding creator)
      const recipientIds = attendeeIds.filter((id) => id !== userId);
      if (recipientIds.length > 0) {
        this.realtimeGateway.sendNotificationToUsers(
          recipientIds,
          'event.created',
          {
            id: event.id,
            title: event.title,
            startsAt: event.startsAt.toISOString(),
            meetingLink: event.meetingLink,
            creatorName,
          },
        );
      }
    }

    return event;
  }

  async checkUpcomingEventReminders() {
    const now = new Date();
    const tenMinutesFromNow = new Date(now.getTime() + 10 * 60000);

    const upcomingEvents = await this.prisma.calendarEvent.findMany({
      where: {
        startsAt: {
          gte: now,
          lte: tenMinutesFromNow,
        },
        reminderSent: false,
        meetingLink: { not: null },
      },
      include: {
        attendees: {
          include: {
            user: {
              include: {
                profile: true,
              },
            },
          },
        },
      },
    });

    for (const event of upcomingEvents) {
      // Mark reminder as sent
      await this.prisma.calendarEvent.update({
        where: { id: event.id },
        data: { reminderSent: true },
      });

      const attendeeIds = event.attendees.map((a) => a.userId);
      const recipientIds = [
        ...new Set(
          [...attendeeIds, event.createdBy].filter((id): id is string =>
            Boolean(id),
          ),
        ),
      ];
      if (recipientIds.length === 0) continue;

      for (const uid of recipientIds) {
        try {
          await this.prisma.notification.create({
            data: {
              userId: uid,
              title: `Upcoming Event Reminder`,
              body: `"${event.title}" starts soon (at ${event.startsAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})`,
              notificationType: 'SYSTEM_ALERT',
              resourceId: event.id,
            },
          });
        } catch (e) {
          this.logger.error(
            '[CalendarService] Failed to create database reminder notification',
            e instanceof Error ? e.stack : String(e),
          );
        }
      }

      // Broadcast realtime reminder notification
      this.realtimeGateway.sendNotificationToUsers(
        recipientIds,
        'event.reminder',
        {
          id: event.id,
          title: event.title,
          startsAt: event.startsAt.toISOString(),
          meetingLink: event.meetingLink,
        },
      );
    }
  }
}
