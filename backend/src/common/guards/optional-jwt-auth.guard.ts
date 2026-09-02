import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { getJwtSecret } from '../../config/jwt';

interface CustomRequest extends Request {
  user?: {
    sub?: string;
    userId?: string;
    email?: string;
    [key: string]: unknown;
  };
}

/**
 * Like JwtAuthGuard, but anonymous requests are allowed through without a
 * `user` attached. Use only on endpoints where being unauthenticated is
 * meaningful (e.g. public image streaming) — never as a substitute for
 * proper authorization checks.
 */
@Injectable()
export class OptionalJwtAuthGuard implements CanActivate {
  constructor(private jwtService: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<CustomRequest>();
    const token = this.extractTokenFromHeader(request);

    if (!token) return true;

    try {
      const verified: unknown = await this.jwtService.verifyAsync(token, {
        secret: getJwtSecret(),
      });
      request.user = verified as CustomRequest['user'];
    } catch {
      // Invalid or expired tokens are treated as anonymous here; route logic
      // decides what anonymous access is allowed to do.
    }

    return true;
  }

  private extractTokenFromHeader(request: CustomRequest): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}
