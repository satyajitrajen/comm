import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
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
}
