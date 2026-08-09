import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { FilesService } from './files.service';
import { FILE_UPLOAD_MAX_BYTES } from './files.constants';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUserId } from '../../common/decorators/current-user.decorator';

@Controller('api/v1/files')
export class FilesController {
  constructor(private filesService: FilesService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  async getFiles(
    @CurrentUserId() userId: string,
    @Query('search') search?: string,
    @Query('scope') scope?: string, // 'workspace' | 'mine'
    @Query('conversationId') conversationId?: string,
  ) {
    if (scope === 'mine') {
      return await this.filesService.getMyFiles(userId);
    }
    return await this.filesService.getWorkspaceFiles(
      userId,
      search,
      conversationId,
    );
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: FILE_UPLOAD_MAX_BYTES },
    }),
  )
  async uploadFile(
    @CurrentUserId() userId: string,
    @UploadedFile()
    file: {
      originalname: string;
      mimetype: string;
      size: number;
      buffer: Buffer;
    },
    @Body() body: { conversationId?: string },
  ) {
    return await this.filesService.uploadFile(
      userId,
      file,
      body.conversationId,
    );
  }

  @Get(':id/view')
  async viewFile(
    @Param('id') fileId: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const download = await this.filesService.getFileForView(fileId);
    response.set({
      'Content-Type': download.mimeType,
      'Content-Length': download.fileSizeBytes.toString(),
      'Content-Disposition': `inline; filename="${download.filename.replace(/"/g, '')}"`,
    });
    return new StreamableFile(download.stream);
  }

  @Get(':id/download')
  @UseGuards(JwtAuthGuard)
  async downloadFile(
    @CurrentUserId() userId: string,
    @Param('id') fileId: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const download = await this.filesService.getDownload(userId, fileId);
    response.set({
      'Content-Type': download.mimeType,
      'Content-Length': download.fileSizeBytes.toString(),
      'Content-Disposition': `attachment; filename="${download.filename.replace(/"/g, '')}"`,
    });
    return new StreamableFile(download.stream);
  }
}
