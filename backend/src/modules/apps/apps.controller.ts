import { Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUserId } from '../../common/decorators/current-user.decorator';
import { AppsService } from './apps.service';

@UseGuards(JwtAuthGuard)
@Controller('api/v1/apps')
export class AppsController {
  constructor(private appsService: AppsService) {}

  @Get()
  async getApps(@CurrentUserId() userId: string) {
    return await this.appsService.getApps(userId);
  }

  @Patch(':id/toggle')
  async toggleApp(@CurrentUserId() userId: string, @Param('id') id: string) {
    return await this.appsService.toggleApp(userId, id);
  }
}
