import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
  tenantId: string | null;
  iat?: number;
  exp?: number;
}

export const CurrentUser = createParamDecorator((data: keyof JwtPayload | undefined, ctx: ExecutionContext) => {
  const req = ctx.switchToHttp().getRequest<Request & { user?: JwtPayload }>();
  const user = req.user;
  if (!user) return null;
  return data ? user[data] : user;
});
