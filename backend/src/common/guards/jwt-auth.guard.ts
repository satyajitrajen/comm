import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
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

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private jwtService: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<CustomRequest>();
    const token = this.extractTokenFromHeader(request);

    if (!token) {
      throw new UnauthorizedException('Authentication token not found');
    }

    try {
      const verified: unknown = await this.jwtService.verifyAsync(token, {
        secret: getJwtSecret(),
      });
      const payload = verified as {
        sub?: string;
        userId?: string;
        email?: string;
      };
      // Attach the payload to the request object so that controllers can access it
      request.user = payload;
    } catch {
      throw new UnauthorizedException(
        'Authentication token is invalid or expired',
      );
    }

    return true;
  }

  private extractTokenFromHeader(request: CustomRequest): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}
