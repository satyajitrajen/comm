import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { PushService } from '../../common/push.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUserId } from '../../common/decorators/current-user.decorator';

@UseGuards(JwtAuthGuard)
@Controller('api/v1/notifications')
export class NotificationsController {
  constructor(
    private notificationsService: NotificationsService,
    private pushService: PushService,
  ) {}

  /** Null when VAPID is unconfigured, which the client treats as "no push". */
  @Get('push/public-key')
  pushPublicKey() {
    return { publicKey: this.pushService.publicKey };
  }

  @Post('push/subscribe')
  async subscribePush(
    @CurrentUserId() userId: string,
    @Body()
    body: { subscription?: unknown; token?: string; deviceType?: string },
  ) {
    return await this.pushService.subscribe(userId, body);
  }

  @Delete('push/subscribe')
  async unsubscribePush(
    @CurrentUserId() userId: string,
    @Body()
    body: { subscription?: unknown; token?: string; deviceType?: string },
  ) {
    return await this.pushService.unsubscribe(userId, body);
  }

  @Get()
  async getNotifications(
    @CurrentUserId() userId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return await this.notificationsService.getNotifications(
      userId,
      page ? parseInt(page) : 1,
      limit ? parseInt(limit) : 30,
    );
  }

  @Patch('read-all')
  async markAllRead(@CurrentUserId() userId: string) {
    return await this.notificationsService.markAllRead(userId);
  }

  @Patch(':id/read')
  async markRead(
    @CurrentUserId() userId: string,
    @Param('id') notificationId: string,
  ) {
    return await this.notificationsService.markRead(userId, notificationId);
  }
}
