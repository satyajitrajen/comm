import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUserId } from '../../common/decorators/current-user.decorator';
import { CalendarService } from './calendar.service';

@UseGuards(JwtAuthGuard)
@Controller('api/v1/calendar')
export class CalendarController {
  constructor(private calendarService: CalendarService) {}

  @Get()
  async getEvents(
    @CurrentUserId() userId: string,
    @Query('start') start?: string,
    @Query('end') end?: string,
  ) {
    return await this.calendarService.getEvents(userId, start, end);
  }

  @Post()
  async createEvent(
    @CurrentUserId() userId: string,
    @Body()
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
    return await this.calendarService.createEvent(userId, body);
  }

  @Patch(':id')
  async updateEvent(
    @CurrentUserId() userId: string,
    @Param('id') eventId: string,
    @Body()
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
    return await this.calendarService.updateEvent(userId, eventId, body);
  }

  @Delete(':id')
  async deleteEvent(
    @CurrentUserId() userId: string,
    @Param('id') eventId: string,
  ) {
    return await this.calendarService.deleteEvent(userId, eventId);
  }

  @Post(':id/invites')
  async sendInvites(
    @CurrentUserId() userId: string,
    @Param('id') eventId: string,
    @Body()
    body?: {
      attendeeIds?: string[];
    },
  ) {
    return await this.calendarService.sendInvites(userId, eventId, body?.attendeeIds);
  }

  @Get(':id/ics')
  async downloadIcs(
    @CurrentUserId() userId: string,
    @Param('id') eventId: string,
    @Res() res: Response,
  ) {
    const icsContent = await this.calendarService.getEventIcs(userId, eventId);
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="event-${eventId}.ics"`,
    );
    res.send(icsContent);
  }
}
