import {
  Controller,
  Post,
  Patch,
  Delete,
  Get,
  Body,
  Param,
  UseGuards,
  Query,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { ChatsService } from './chats.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUserId } from '../../common/decorators/current-user.decorator';

@SkipThrottle()
@UseGuards(JwtAuthGuard)
@Controller('api/v1/chats')
export class ChatsController {
  constructor(private chatsService: ChatsService) {}

  @Get()
  async getChatsFeed(@CurrentUserId() userId: string) {
    return await this.chatsService.getChatsFeed(userId);
  }

  @Post('direct')
  async createDirectChat(
    @CurrentUserId() userId: string,
    @Body() body: { targetUserId: string },
  ) {
    return await this.chatsService.createDirectChat(userId, body.targetUserId);
  }

  @Post('group')
  async createGroupChat(
    @CurrentUserId() userId: string,
    @Body()
    body: {
      name: string;
      description?: string;
      participantIds: string[];
      teamName?: string;
      channelSlug?: string;
      spaceType?: string;
      isReadOnly?: boolean;
    },
  ) {
    return await this.chatsService.createGroupChat(userId, body);
  }

  @Patch(':id')
  async updateGroup(
    @CurrentUserId() userId: string,
    @Param('id') conversationId: string,
    @Body()
    body: {
      name?: string;
      description?: string;
      teamName?: string;
      spaceType?: string;
      isReadOnly?: boolean;
    },
  ) {
    return await this.chatsService.updateGroupChat(
      userId,
      conversationId,
      body,
    );
  }

  @Delete(':id')
  async deleteGroup(
    @CurrentUserId() userId: string,
    @Param('id') conversationId: string,
  ) {
    return await this.chatsService.deleteGroupChat(userId, conversationId);
  }

  @Post(':id/mute')
  async muteChat(
    @CurrentUserId() userId: string,
    @Param('id') conversationId: string,
  ) {
    return await this.chatsService.toggleMuteGroupChat(
      userId,
      conversationId,
      true,
    );
  }

  @Delete(':id/mute')
  async unmuteChat(
    @CurrentUserId() userId: string,
    @Param('id') conversationId: string,
  ) {
    return await this.chatsService.toggleMuteGroupChat(
      userId,
      conversationId,
      false,
    );
  }

  @Post(':id/join')
  async joinChat(
    @CurrentUserId() userId: string,
    @Param('id') conversationId: string,
  ) {
    return await this.chatsService.joinGroupChat(userId, conversationId);
  }

  @Delete(':id/leave')
  async leaveChat(
    @CurrentUserId() userId: string,
    @Param('id') conversationId: string,
    @Query('transferOwnerTo') transferOwnerTo?: string,
  ) {
    return await this.chatsService.leaveGroupChat(
      userId,
      conversationId,
      transferOwnerTo,
    );
  }

  @Get(':id/details')
  async getChatDetails(
    @CurrentUserId() userId: string,
    @Param('id') conversationId: string,
  ) {
    return await this.chatsService.getGroupChatDetails(userId, conversationId);
  }

  @Post(':id/members')
  async addMembers(
    @CurrentUserId() userId: string,
    @Param('id') conversationId: string,
    @Body() body: { userIds: string[] },
  ) {
    return await this.chatsService.addGroupMembers(
      userId,
      conversationId,
      body.userIds,
    );
  }

  @Delete(':id/members/:userId')
  async removeMember(
    @CurrentUserId() actorId: string,
    @Param('id') conversationId: string,
    @Param('userId') targetUserId: string,
  ) {
    return await this.chatsService.removeGroupMember(
      actorId,
      conversationId,
      targetUserId,
    );
  }

  @Patch(':id/members/:userId/role')
  async updateMemberRole(
    @CurrentUserId() actorId: string,
    @Param('id') conversationId: string,
    @Param('userId') targetUserId: string,
    @Body() body: { role: string },
  ) {
    return await this.chatsService.updateMemberRole(
      actorId,
      conversationId,
      targetUserId,
      body.role,
    );
  }

  @Get(':id/messages')
  async getMessagesHistory(
    @Param('id') conversationId: string,
    @CurrentUserId() userId: string,
    @Query('limit') limit?: string,
    @Query('before') before?: string,
    @Query('around') around?: string,
  ) {
    const parsedLimit = Number(limit);
    return await this.chatsService.getMessagesHistory(conversationId, userId, {
      limit: Number.isFinite(parsedLimit) ? parsedLimit : undefined,
      before,
      around,
    });
  }
}
