import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';

interface CustomRequest extends Request {
  user?: {
    sub?: string;
    [key: string]: unknown;
  };
}

export const CurrentUserId = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): string | undefined => {
    const request = ctx.switchToHttp().getRequest<CustomRequest>();
    return request.user?.sub;
  },
);
