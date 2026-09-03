import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { createReadStream } from 'fs';
import { access, mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { randomUUID } from 'crypto';
import type { IncomingMessage } from 'http';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { v2 as cloudinary } from 'cloudinary';
import * as https from 'https';
import {
  FILE_UPLOAD_MAX_BYTES,
  FILE_UPLOAD_MAX_LABEL,
} from './files.constants';

cloudinary.config();

/**
 * Returns true only when CLOUDINARY_URL is present AND looks like a valid
 * cloudinary:// URI (cloud_name is the host segment).
 */
function isCloudinaryConfigured(): boolean {
  const url = process.env.CLOUDINARY_URL ?? '';
  if (!url.startsWith('cloudinary://')) return false;
  // cloudinary://api_key:api_secret@cloud_name  — cloud_name must be non-empty
  try {
    const parsed = new URL(url.replace('cloudinary://', 'https://'));
    return (
      parsed.hostname.length > 0 &&
      parsed.username.length > 0 &&
      parsed.password.length > 0
    );
  } catch {
    return false;
  }
}

function formatStorageError(err: unknown): string {
  if (err instanceof Error) {
    return err.stack ?? err.message;
  }
  if (typeof err === 'object' && err !== null) {
    const record = err as { message?: string; http_code?: number };
    if (record.message) {
      const code =
        typeof record.http_code === 'number'
          ? ` (http ${record.http_code})`
          : '';
      return `${record.message}${code}`;
    }
    try {
      return JSON.stringify(err);
    } catch {
      return 'Unknown storage error (unserializable error object)';
    }
  }
  return String(err);
}

@Injectable()
export class FilesService {
  private readonly logger = new Logger(FilesService.name);

  constructor(
    private prisma: PrismaService,
    private realtimeGateway: RealtimeGateway,
  ) {}

  private uploadRoot() {
    return join(process.cwd(), 'uploads');
  }

  /** Saves raw bytes to local disk and returns the relative storage key. */
  private async saveLocally(
    workspaceId: string,
    filename: string,
    buffer: Buffer,
  ): Promise<string> {
    const localKey = join(workspaceId, `${randomUUID()}-${filename}`);
    const directory = join(this.uploadRoot(), workspaceId);
    const absolutePath = join(this.uploadRoot(), localKey);
    await mkdir(directory, { recursive: true });
    await writeFile(absolutePath, buffer);
    return localKey;
  }

  private sanitizeFilename(filename: string) {
    // Strip path separators, reserved characters, and control characters.
    // eslint-disable-next-line no-control-regex -- control chars are intentionally matched
    return filename.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').slice(0, 160);
  }

  private serializeFile<
    T extends { fileSizeBytes: bigint; storageKey?: string },
  >(file: T) {
    const { storageKey: _storageKey, ...rest } = file;
    return {
      ...rest,
      fileSizeBytes: file.fileSizeBytes.toString(),
    };
  }

  private fileAccessFilter(userId: string): Prisma.FileWhereInput {
    return {
      OR: [
        { uploadedBy: userId },
        {
          messageAttachments: {
            some: {
              message: {
                conversation: {
                  participants: { some: { userId } },
                },
              },
            },
          },
        },
      ],
    };
  }

  private async assertFileAccess(
    userId: string,
    workspaceId: string,
    fileId: string,
  ) {
    const file = await this.prisma.file.findFirst({
      where: {
        id: fileId,
        workspaceId,
        isDeleted: false,
        AND: [this.fileAccessFilter(userId)],
      },
      select: { id: true },
    });

    if (!file) {
      throw new ForbiddenException('You do not have access to this file');
    }
  }

  private async getActiveWorkspace(userId: string) {
    const workspaceUser = await this.prisma.workspaceUser.findFirst({
      where: { userId, isActive: true },
    });

    if (!workspaceUser) {
      throw new ForbiddenException('User is not part of an active workspace');
    }

    return workspaceUser;
  }

  private async assertConversationAccess(
    userId: string,
    workspaceId: string,
    conversationId: string,
  ) {
    const conversation = await this.prisma.conversation.findFirst({
      where: {
        id: conversationId,
        workspaceId,
        participants: { some: { userId } },
      },
      select: { id: true },
    });

    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }
  }

  async getWorkspaceFiles(
    userId: string,
    search?: string,
    conversationId?: string,
  ) {
    const workspaceUser = await this.getActiveWorkspace(userId);

    if (conversationId) {
      await this.assertConversationAccess(
        userId,
        workspaceUser.workspaceId,
        conversationId,
      );
    }

    const where: Prisma.FileWhereInput = {
      workspaceId: workspaceUser.workspaceId,
      isDeleted: false,
      AND: [this.fileAccessFilter(userId)],
    };

    if (search) {
      where.filename = { contains: search };
    }

    if (conversationId) {
      where.messageAttachments = {
        some: {
          message: {
            conversationId,
          },
        },
      };
    }

    const [rawItems, total] = await Promise.all([
      this.prisma.file.findMany({
        where,
        include: {
          uploader: {
            include: { profile: true },
          },
          messageAttachments: {
            include: {
              message: {
                select: {
                  conversationId: true,
                  createdAt: true,
                },
              },
            },
            take: 1,
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
      this.prisma.file.count({ where }),
    ]);

    const items = rawItems.map((file) => this.serializeFile(file));

    return { items, total };
  }

  async getMyFiles(userId: string) {
    const workspaceUser = await this.getActiveWorkspace(userId);
    const files = await this.prisma.file.findMany({
      where: {
        uploadedBy: userId,
        workspaceId: workspaceUser.workspaceId,
        isDeleted: false,
      },
      include: {
        uploader: { include: { profile: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    return files.map((file) => this.serializeFile(file));
  }

  async uploadFile(
    userId: string,
    file: {
      originalname: string;
      mimetype: string;
      size: number;
      buffer: Buffer;
    },
    conversationId?: string,
  ) {
    if (!file?.buffer || !file.originalname) {
      throw new BadRequestException('File is required');
    }

    if (file.size > FILE_UPLOAD_MAX_BYTES) {
      throw new BadRequestException(
        `File exceeds the maximum upload size of ${FILE_UPLOAD_MAX_LABEL}`,
      );
    }

    const workspaceUser = await this.getActiveWorkspace(userId);
    if (conversationId) {
      await this.assertConversationAccess(
        userId,
        workspaceUser.workspaceId,
        conversationId,
      );
    }

    const filename = this.sanitizeFilename(file.originalname);
    let storageKey = '';
    let storageProvider = 'LOCAL';

    if (isCloudinaryConfigured()) {
      try {
        // Wrap upload_stream in a timeout so a broken Cloudinary config fails
        // quickly and we immediately fall back to local storage.
        const CLOUDINARY_TIMEOUT_MS = 8_000;
        type CloudinaryUploadResult = { secure_url?: string };
        const result = await new Promise<CloudinaryUploadResult>(
          (resolve, reject) => {
            const timer = setTimeout(() => {
              uploadStream.destroy();
              reject(
                new Error(
                  `Cloudinary upload timed out after ${CLOUDINARY_TIMEOUT_MS}ms`,
                ),
              );
            }, CLOUDINARY_TIMEOUT_MS);
            const finish = <T>(value: T, failure: unknown) => {
              clearTimeout(timer);
              if (failure) {
                reject(
                  failure instanceof Error
                    ? failure
                    : new Error(formatStorageError(failure)),
                );
                return;
              }
              resolve(value as CloudinaryUploadResult);
            };
            const uploadStream = cloudinary.uploader.upload_stream(
              {
                resource_type: 'auto',
                folder: workspaceUser.workspaceId,
                public_id: randomUUID(),
              },
              (error, result) => finish(result, error),
            );
            uploadStream.end(file.buffer);
          },
        );
        const secureUrl = result.secure_url;
        if (!secureUrl) {
          throw new Error('Cloudinary upload returned no secure_url');
        }
        storageKey = secureUrl;
        storageProvider = 'CLOUDINARY';
      } catch (err) {
        this.logger.warn(
          `[CLOUDINARY] Upload failed — using local storage. Reason: ${formatStorageError(err)}`,
        );
        storageKey = await this.saveLocally(
          workspaceUser.workspaceId,
          filename,
          file.buffer,
        );
        storageProvider = 'LOCAL';
      }
    } else {
      this.logger.debug(
        '[CLOUDINARY] Not configured — saving to local storage.',
      );
      storageKey = await this.saveLocally(
        workspaceUser.workspaceId,
        filename,
        file.buffer,
      );
      storageProvider = 'LOCAL';
    }

    const createdFile = await this.prisma.$transaction(async (tx) => {
      const storedFile = await tx.file.create({
        data: {
          workspaceId: workspaceUser.workspaceId,
          uploadedBy: userId,
          filename,
          mimeType: file.mimetype || 'application/octet-stream',
          fileSizeBytes: BigInt(file.size),
          storageProvider,
          storageKey,
          isMalwareScanned: false,
          malwareScanResult: 'PENDING',
        },
        include: {
          uploader: { include: { profile: true } },
        },
      });

      let createdMessageId: string | null = null;
      if (conversationId) {
        const message = await tx.message.create({
          data: {
            conversationId,
            senderId: userId,
            content: null,
            messageType: 'FILE',
          },
        });
        createdMessageId = message.id;

        await tx.messageAttachment.create({
          data: {
            messageId: message.id,
            fileId: storedFile.id,
          },
        });
      }

      return { storedFile, createdMessageId };
    });

    if (conversationId && createdFile.createdMessageId) {
      const fullMessage = await this.prisma.message.findUnique({
        where: { id: createdFile.createdMessageId },
        include: {
          sender: { include: { profile: true } },
          attachments: { include: { file: true } },
        },
      });
      if (fullMessage) {
        const room = `conversation:${conversationId}`;
        this.realtimeGateway.broadcastToRoom(room, 'message.sent', fullMessage);
        void this.realtimeGateway.emitMessageNotifyToParticipants(
          conversationId,
          userId,
          fullMessage,
        );
      }
    }

    return this.serializeFile(createdFile.storedFile);
  }

  /** Opens an HTTPS stream for a remotely stored (Cloudinary) file object. */
  private openRemoteStream(url: string): Promise<IncomingMessage> {
    return new Promise<IncomingMessage>((resolve, reject) => {
      https
        .get(url, (res) => {
          if (res.statusCode !== 200) {
            res.resume();
            reject(
              new Error(
                `Failed to download from Cloudinary: ${res.statusCode}`,
              ),
            );
          } else {
            resolve(res);
          }
        })
        .on('error', reject);
    });
  }

  async getDownload(userId: string, fileId: string) {
    const workspaceUser = await this.getActiveWorkspace(userId);
    await this.assertFileAccess(userId, workspaceUser.workspaceId, fileId);

    const file = await this.prisma.file.findFirst({
      where: {
        id: fileId,
        workspaceId: workspaceUser.workspaceId,
        isDeleted: false,
      },
    });

    if (!file) {
      throw new NotFoundException('File not found');
    }

    if (file.storageProvider === 'CLOUDINARY') {
      try {
        const stream = await this.openRemoteStream(file.storageKey);
        return {
          stream,
          filename: file.filename,
          mimeType: file.mimeType,
          fileSizeBytes: file.fileSizeBytes,
        };
      } catch (err) {
        this.logger.error(
          '[CLOUDINARY DOWNLOAD ERROR]',
          formatStorageError(err),
        );
        throw new NotFoundException(
          'Could not download file from remote storage',
        );
      }
    }

    const absolutePath = join(this.uploadRoot(), file.storageKey);
    try {
      await access(absolutePath);
    } catch {
      throw new NotFoundException('Stored file object not found');
    }

    return {
      stream: createReadStream(absolutePath),
      filename: file.filename,
      mimeType: file.mimeType,
      fileSizeBytes: file.fileSizeBytes,
    };
  }

  /**
   * Streams a file for inline viewing.
   *
   * - Authenticated users may view any non-deleted file inside their active
   *   workspace (inline previews and avatars).
   * - Anonymous requests are limited to image files only; this keeps
   *   `<img>`-based avatar URLs working while preventing unauthenticated
   *   streaming of documents and other private file types.
   */
  async getFileForView(fileId: string, userId?: string) {
    let workspaceId: string | undefined;
    if (userId) {
      const workspaceUser = await this.getActiveWorkspace(userId);
      workspaceId = workspaceUser.workspaceId;
    }

    const file = await this.prisma.file.findFirst({
      where: {
        id: fileId,
        isDeleted: false,
        ...(workspaceId ? { workspaceId } : {}),
      },
    });

    if (!file) {
      throw new NotFoundException('File not found');
    }

    if (!userId && !file.mimeType.startsWith('image/')) {
      throw new NotFoundException('File not found');
    }

    if (file.storageProvider === 'CLOUDINARY') {
      try {
        const stream = await this.openRemoteStream(file.storageKey);
        return {
          stream,
          filename: file.filename,
          mimeType: file.mimeType,
          fileSizeBytes: file.fileSizeBytes,
        };
      } catch (err) {
        this.logger.error('[CLOUDINARY VIEW ERROR]', formatStorageError(err));
        throw new NotFoundException(
          'Could not stream file from remote storage',
        );
      }
    }

    const absolutePath = join(this.uploadRoot(), file.storageKey);
    try {
      await access(absolutePath);
    } catch {
      throw new NotFoundException('File not found on disk');
    }

    return {
      stream: createReadStream(absolutePath),
      filename: file.filename,
      mimeType: file.mimeType,
      fileSizeBytes: file.fileSizeBytes,
    };
  }
}
