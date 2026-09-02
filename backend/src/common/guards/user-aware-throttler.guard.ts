import { ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectThrottlerStorage, ThrottlerGuard } from '@nestjs/throttler';
import type {
  ThrottlerModuleOptions,
  ThrottlerStorage,
} from '@nestjs/throttler';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { getJwtSecret } from '../../config/jwt';

@Injectable()
export class UserAwareThrottlerGuard extends ThrottlerGuard {
  constructor(
    options: ThrottlerModuleOptions,
    @InjectThrottlerStorage() storageService: ThrottlerStorage,
    reflector: Reflector,
    private jwtService: JwtService,
  ) {
    super(options, storageService, reflector);
  }

  protected async getTracker(req: Record<string, unknown>): Promise<string> {
    const request = req as unknown as Request & {
      user?: { sub?: string };
    };

    if (request.user?.sub) {
      return `user:${request.user.sub}`;
    }

    const auth = request.headers.authorization;
    if (auth?.startsWith('Bearer ')) {
      try {
        const token = auth.slice(7);
        const payload = await this.jwtService.verifyAsync<{ sub?: string }>(
          token,
          { secret: getJwtSecret() },
        );
        if (payload.sub) {
          return `user:${payload.sub}`;
        }
      } catch {
        // fall through to IP
      }
    }

    return `ip:${request.ip || request.socket?.remoteAddress || 'unknown'}`;
  }

  protected getRequestResponse(context: ExecutionContext) {
    const http = context.switchToHttp();
    return {
      req: http.getRequest<Record<string, unknown>>(),
      res: http.getResponse<Record<string, any>>(),
    };
  }
}
