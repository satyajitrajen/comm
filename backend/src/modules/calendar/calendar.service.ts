import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { MailService } from '../../common/mail.service';

@Injectable()
export class CalendarService implements OnModuleInit {
  private readonly logger = new Logger(CalendarService.name);

  constructor(
    private prisma: PrismaService,
    private realtimeGateway: RealtimeGateway,
    private mailService: MailService,
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

  private async dispatchEventInvites(
    event: any,
    targetUserIds: string[],
    organizerId?: string,
    isUpdate = false,
  ) {
    if (!targetUserIds || targetUserIds.length === 0) return;

    const uniqueTargetIds = Array.from(new Set(targetUserIds));

    // Fetch organizer info
    let organizerName = 'Someone';
    let organizerEmail: string | undefined = undefined;
    if (organizerId) {
      const creator = await this.prisma.user.findUnique({
        where: { id: organizerId },
        include: { profile: true },
      });
      if (creator) {
        organizerName = creator.profile?.displayName || creator.email || 'Someone';
        organizerEmail = creator.email || undefined;
      }
    }

    // Fetch attendee users with profile and email
    const users = await this.prisma.user.findMany({
      where: { id: { in: uniqueTargetIds } },
      include: { profile: true },
    });

    const allAttendeesFormatted = event.attendees?.map((a: any) => ({
      name: a.user?.profile?.displayName || a.user?.email || 'Attendee',
      email: a.user?.email || '',
    })) || [];

    const startsAt = new Date(event.startsAt);
    const endsAt = new Date(event.endsAt);

    for (const attendeeUser of users) {
      // Don't send notification to organizer if they added themselves
      if (attendeeUser.id === organizerId) continue;

      const title = isUpdate
        ? `Event Updated: ${event.title}`
        : `New Event Invitation: ${event.title}`;
      const body = isUpdate
        ? `${organizerName} updated the event "${event.title}" scheduled for ${startsAt.toLocaleString()}`
        : `${organizerName} invited you to "${event.title}" scheduled for ${startsAt.toLocaleString()}`;

      // 1. Create In-App Notification
      try {
        await this.prisma.notification.create({
          data: {
            userId: attendeeUser.id,
            title,
            body,
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

      // 2. Send Calendar Email Invite with .ics attachment
      if (attendeeUser.email) {
        this.mailService
          .sendCalendarInvite({
            to: attendeeUser.email,
            recipientName: attendeeUser.profile?.displayName || attendeeUser.email,
            event: {
              id: event.id,
              title: event.title,
              description: event.description,
              startsAt,
              endsAt,
              meetingLink: event.meetingLink,
              teamName: event.teamName,
              organizerName,
              organizerEmail,
              attendees: allAttendeesFormatted,
            },
          })
          .catch((err) => {
            this.logger.error(
              `[CalendarService] Error sending email invite to ${attendeeUser.email}`,
              err instanceof Error ? err.stack : String(err),
            );
          });
      }
    }

    // 3. Broadcast Realtime socket notification
    const recipientIds = uniqueTargetIds.filter((id) => id !== organizerId);
    if (recipientIds.length > 0) {
      this.realtimeGateway.sendNotificationToUsers(
        recipientIds,
        isUpdate ? 'event.updated' : 'event.created',
        {
          id: event.id,
          title: event.title,
          startsAt: startsAt.toISOString(),
          endsAt: endsAt.toISOString(),
          meetingLink: event.meetingLink,
          creatorName: organizerName,
        },
      );
    }
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

    const meetingLink = body.meetingLink || this.generateMeetingRoomLink();

    const event = await this.prisma.calendarEvent.create({
      data: {
        workspaceId,
        title: body.title.trim(),
        description: body.description?.trim() || null,
        startsAt,
        endsAt,
        teamName: body.teamName?.trim() || null,
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

    // Notify & invite attendees immediately
    if (attendeeIds.length > 0) {
      await this.dispatchEventInvites(event, attendeeIds, userId, false);
    }

    return event;
  }

  async updateEvent(
    userId: string,
    eventId: string,
    body: {
      title?: string;
      description?: string;
      startsAt?: string;
      endsAt?: string;
      teamName?: string;
      meetingLink?: string;
      attendeeIds?: string[];
      notifyAttendees?: boolean;
    },
  ) {
    const workspaceId = await this.getWorkspaceId(userId);

    const existing = await this.prisma.calendarEvent.findFirst({
      where: { id: eventId, workspaceId },
      include: { attendees: true },
    });

    if (!existing) {
      throw new NotFoundException('Calendar event not found');
    }

    let startsAt = existing.startsAt;
    let endsAt = existing.endsAt;

    if (body.startsAt) {
      startsAt = new Date(body.startsAt);
      if (Number.isNaN(startsAt.getTime())) {
        throw new BadRequestException('Invalid start time');
      }
    }

    if (body.endsAt) {
      endsAt = new Date(body.endsAt);
      if (Number.isNaN(endsAt.getTime())) {
        throw new BadRequestException('Invalid end time');
      }
    }

    if (endsAt <= startsAt) {
      throw new BadRequestException('End time must be after start time');
    }

    const prevAttendeeIds = existing.attendees.map((a) => a.userId);
    let newAttendeeIds = prevAttendeeIds;

    // If attendeeIds array was provided, sync them
    if (body.attendeeIds !== undefined) {
      newAttendeeIds = Array.from(new Set(body.attendeeIds));
      if (newAttendeeIds.length > 0) {
        const memberCount = await this.prisma.workspaceUser.count({
          where: {
            workspaceId,
            userId: { in: newAttendeeIds },
            isActive: true,
          },
        });
        if (memberCount !== newAttendeeIds.length) {
          throw new BadRequestException(
            'One or more attendees are not members of this workspace',
          );
        }
      }

      const toAdd = newAttendeeIds.filter((id) => !prevAttendeeIds.includes(id));
      const toRemove = prevAttendeeIds.filter((id) => !newAttendeeIds.includes(id));

      if (toRemove.length > 0) {
        await this.prisma.eventAttendee.deleteMany({
          where: {
            eventId,
            userId: { in: toRemove },
          },
        });
      }

      if (toAdd.length > 0) {
        await this.prisma.eventAttendee.createMany({
          data: toAdd.map((uid) => ({
            eventId,
            userId: uid,
          })),
        });
      }
    }

    const updated = await this.prisma.calendarEvent.update({
      where: { id: eventId },
      data: {
        title: body.title !== undefined ? body.title.trim() : undefined,
        description:
          body.description !== undefined ? body.description.trim() || null : undefined,
        startsAt,
        endsAt,
        teamName:
          body.teamName !== undefined ? body.teamName.trim() || null : undefined,
        meetingLink:
          body.meetingLink !== undefined ? body.meetingLink.trim() || null : undefined,
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

    // Determine who to notify
    const newlyAddedAttendees = newAttendeeIds.filter(
      (id) => !prevAttendeeIds.includes(id),
    );
    const existingAttendees = newAttendeeIds.filter((id) =>
      prevAttendeeIds.includes(id),
    );

    // Send new invitation to newly added attendees
    if (newlyAddedAttendees.length > 0) {
      await this.dispatchEventInvites(updated, newlyAddedAttendees, userId, false);
    }

    // If notifyAttendees is true or event time changed significantly, notify existing attendees
    if (
      body.notifyAttendees ||
      startsAt.getTime() !== existing.startsAt.getTime() ||
      endsAt.getTime() !== existing.endsAt.getTime()
    ) {
      if (existingAttendees.length > 0) {
        await this.dispatchEventInvites(updated, existingAttendees, userId, true);
      }
    }

    return updated;
  }

  async deleteEvent(userId: string, eventId: string) {
    const workspaceId = await this.getWorkspaceId(userId);

    const existing = await this.prisma.calendarEvent.findFirst({
      where: { id: eventId, workspaceId },
      include: { attendees: true },
    });

    if (!existing) {
      throw new NotFoundException('Calendar event not found');
    }

    // Delete attendees and event
    await this.prisma.eventAttendee.deleteMany({
      where: { eventId },
    });

    await this.prisma.calendarEvent.delete({
      where: { id: eventId },
    });

    // Broadcast realtime event deletion
    const attendeeIds = existing.attendees.map((a) => a.userId);
    const recipientIds = attendeeIds.filter((id) => id !== userId);
    if (recipientIds.length > 0) {
      this.realtimeGateway.sendNotificationToUsers(
        recipientIds,
        'event.deleted',
        { id: eventId, title: existing.title },
      );
    }

    return { success: true, id: eventId };
  }

  async sendInvites(userId: string, eventId: string, attendeeIds?: string[]) {
    const workspaceId = await this.getWorkspaceId(userId);

    const event = await this.prisma.calendarEvent.findFirst({
      where: { id: eventId, workspaceId },
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

    if (!event) {
      throw new NotFoundException('Calendar event not found');
    }

    const targetIds =
      attendeeIds && attendeeIds.length > 0
        ? attendeeIds
        : event.attendees.map((a) => a.userId);

    await this.dispatchEventInvites(event, targetIds, userId, false);

    return {
      success: true,
      message: `Calendar invites sent to ${targetIds.length} attendee(s)`,
      count: targetIds.length,
    };
  }

  async getEventIcs(userId: string, eventId: string): Promise<string> {
    const workspaceId = await this.getWorkspaceId(userId);

    const event = await this.prisma.calendarEvent.findFirst({
      where: { id: eventId, workspaceId },
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

    if (!event) {
      throw new NotFoundException('Calendar event not found');
    }

    let organizerName = 'Organizer';
    let organizerEmail: string | undefined = undefined;
    if (event.createdBy) {
      const creator = await this.prisma.user.findUnique({
        where: { id: event.createdBy },
        include: { profile: true },
      });
      if (creator) {
        organizerName = creator.profile?.displayName || creator.email || 'Organizer';
        organizerEmail = creator.email || undefined;
      }
    }

    const attendees = event.attendees.map((a) => ({
      name: a.user.profile?.displayName || a.user.email || 'Attendee',
      email: a.user.email || '',
    }));

    return this.mailService.generateIcsString({
      id: event.id,
      title: event.title,
      description: event.description,
      startsAt: event.startsAt,
      endsAt: event.endsAt,
      meetingLink: event.meetingLink,
      teamName: event.teamName,
      organizerName,
      organizerEmail,
      attendees,
    });
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
