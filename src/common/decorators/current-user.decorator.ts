import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): unknown =>
    ctx.switchToHttp().getRequest<Request & { user?: unknown }>().user,
);
