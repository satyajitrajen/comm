import { Controller, Get, Patch, Body, UseGuards } from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUserId } from '../../common/decorators/current-user.decorator';

@UseGuards(JwtAuthGuard)
@Controller('api/v1/users')
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Get('directory')
  async getDirectory(@CurrentUserId() userId: string) {
    return await this.usersService.getWorkspaceDirectory(userId);
  }

  @Patch('profile')
  async updateProfile(
    @CurrentUserId() userId: string,
    @Body()
    body: {
      displayName?: string;
      aboutText?: string;
      avatarUrl?: string;
      statusAvailability?: string;
    },
  ) {
    return await this.usersService.updateProfile(userId, body);
  }
}
