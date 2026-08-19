import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  Query,
} from '@nestjs/common';
import { MessagesService } from './messages.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUserId } from '../../common/decorators/current-user.decorator';

@UseGuards(JwtAuthGuard)
@Controller('api/v1/messages')
export class MessagesController {
  constructor(private messagesService: MessagesService) {}

  // Declared before any ':id' route so 'search' and 'call-history' are not captured as an id.
  @Get('search')
  async searchMessages(
    @CurrentUserId() userId: string,
    @Query('q') q: string,
    @Query('conversationId') conversationId?: string,
    @Query('limit') limit?: string,
    @Query('before') before?: string,
  ) {
    const parsedLimit = Number(limit);
    return await this.messagesService.searchMessages(userId, {
      query: q ?? '',
      conversationId,
      limit: Number.isFinite(parsedLimit) ? parsedLimit : undefined,
      before,
    });
  }

  @Get('call-history')
  async getCallHistory(
    @CurrentUserId() userId: string,
    @Query('conversationId') conversationId?: string,
    @Query('limit') limit?: string,
    @Query('before') before?: string,
  ) {
    const parsedLimit = Number(limit);
    return await this.messagesService.getCallHistory(userId, {
      conversationId,
      limit: Number.isFinite(parsedLimit) ? parsedLimit : undefined,
      before,
    });
  }

  @Post()
  async sendMessage(
    @CurrentUserId() userId: string,
    @Body()
    body: {
      conversationId: string;
      content?: string;
      replyToMessageId?: string;
      messageType?: string;
      priority?: string;
    },
  ) {
    return await this.messagesService.sendMessage(userId, body);
  }

  @Put(':id')
  async editMessage(
    @CurrentUserId() userId: string,
    @Param('id') messageId: string,
    @Body() body: { content: string },
  ) {
    return await this.messagesService.editMessage(
      userId,
      messageId,
      body.content,
    );
  }

  @Delete(':id')
  async deleteMessage(
    @CurrentUserId() userId: string,
    @Param('id') messageId: string,
    @Query('everyone') everyone?: string,
  ) {
    const deleteForEveryone = everyone === 'true';
    return await this.messagesService.deleteMessage(
      userId,
      messageId,
      deleteForEveryone,
    );
  }

  @Post(':id/react')
  async addReaction(
    @CurrentUserId() userId: string,
    @Param('id') messageId: string,
    @Body() body: { emoji: string },
  ) {
    return await this.messagesService.addReaction(
      userId,
      messageId,
      body.emoji,
    );
  }

  @Delete(':id/react')
  async removeReaction(
    @CurrentUserId() userId: string,
    @Param('id') messageId: string,
    @Body() body: { emoji: string },
  ) {
    return await this.messagesService.removeReaction(
      userId,
      messageId,
      body.emoji,
    );
  }

  @Post('task')
  async createTask(
    @CurrentUserId() userId: string,
    @Body()
    body: {
      messageId: string;
      title: string;
      assigneeIds: string[];
      dueDate?: string;
      priority?: string;
    },
  ) {
    return await this.messagesService.createTaskFromMessage(userId, body);
  }

  @Post('poll')
  async createPoll(
    @CurrentUserId() userId: string,
    @Body()
    body: {
      conversationId: string;
      question: string;
      options: string[];
      expiresAt?: string;
      isMultiSelect?: boolean;
    },
  ) {
    return await this.messagesService.createPoll(userId, body);
  }

  @Post('poll/:id/vote')
  async votePoll(
    @CurrentUserId() userId: string,
    @Param('id') pollId: string,
    @Body() body: { optionId: string },
  ) {
    return await this.messagesService.votePoll(userId, pollId, body.optionId);
  }
  @Post(':id/star')
  async starMessage(
    @CurrentUserId() userId: string,
    @Param('id') messageId: string,
  ) {
    return await this.messagesService.starMessage(userId, messageId);
  }

  @Delete(':id/star')
  async unstarMessage(
    @CurrentUserId() userId: string,
    @Param('id') messageId: string,
  ) {
    return await this.messagesService.unstarMessage(userId, messageId);
  }

  @Post(':id/pin')
  async pinMessage(
    @CurrentUserId() userId: string,
    @Param('id') messageId: string,
    @Body() body: { conversationId: string },
  ) {
    return await this.messagesService.pinMessage(
      userId,
      messageId,
      body.conversationId,
    );
  }

  @Delete(':id/pin')
  async unpinMessage(
    @CurrentUserId() userId: string,
    @Param('id') messageId: string,
    @Body() body: { conversationId: string },
  ) {
    return await this.messagesService.unpinMessage(
      userId,
      messageId,
      body.conversationId,
    );
  }

  @Post(':id/forward')
  async forwardMessage(
    @CurrentUserId() userId: string,
    @Param('id') messageId: string,
    @Body() body: { targetConversationId: string },
  ) {
    return await this.messagesService.forwardMessage(
      userId,
      messageId,
      body.targetConversationId,
    );
  }
}
