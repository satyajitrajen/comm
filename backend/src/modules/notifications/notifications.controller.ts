import {
  Body,
  Controller,
  DefaultValuePipe,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { PushService } from '../../common/push.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUserId } from '../../common/decorators/current-user.decorator';
import {
  PushSubscribeDto,
  PushUnsubscribeDto,
} from './dto/push-subscription.dto';

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
    @Body() body: PushSubscribeDto,
  ) {
    return await this.pushService.subscribe(userId, body);
  }

  @Delete('push/subscribe')
  async unsubscribePush(
    @CurrentUserId() userId: string,
    @Body() body: PushUnsubscribeDto,
  ) {
    return await this.pushService.unsubscribe(userId, body);
  }

  @Get()
  async getNotifications(
    @CurrentUserId() userId: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(30), ParseIntPipe) limit: number,
  ) {
    return await this.notificationsService.getNotifications(
      userId,
      page,
      limit,
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
