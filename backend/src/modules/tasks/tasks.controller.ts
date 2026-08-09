import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { TasksService } from './tasks.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUserId } from '../../common/decorators/current-user.decorator';

@UseGuards(JwtAuthGuard)
@Controller('api/v1/tasks')
export class TasksController {
  constructor(private tasksService: TasksService) {}

  @Get()
  async getTasks(
    @CurrentUserId() userId: string,
    @Query('scope') scope?: string, // 'mine' | 'workspace'
  ) {
    if (scope === 'workspace') {
      return await this.tasksService.getAllWorkspaceTasks(userId);
    }
    return await this.tasksService.getMyTasks(userId);
  }

  @Post()
  async createTask(
    @CurrentUserId() userId: string,
    @Body()
    body: {
      conversationId: string;
      title: string;
      assigneeIds?: string[];
      dueDate?: string | null;
      priority?: string;
    },
  ) {
    return await this.tasksService.createTask(userId, body);
  }

  @Patch(':id')
  async updateTask(
    @CurrentUserId() userId: string,
    @Param('id') taskId: string,
    @Body()
    body: {
      complete?: boolean;
      status?: string;
      title?: string;
      dueDate?: string | null;
      priority?: string;
    },
  ) {
    return await this.tasksService.updateTask(userId, taskId, body);
  }
}
