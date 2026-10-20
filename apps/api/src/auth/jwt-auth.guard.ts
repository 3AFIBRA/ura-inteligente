import {
  Injectable,
  CanActivate,
  type ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { env } from '../config/env.js';
import { IS_PUBLIC_KEY } from '../common/decorators.js';
import type { JwtPayload } from '../common/current-user.decorator.js';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const req = context.switchToHttp().getRequest<Request & { user?: JwtPayload }>();
    if (isPublic) return true;

    const auth = req.headers.authorization;
    if (!auth?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Token nao fornecido');
    }
    const token = auth.slice(7);
    try {
      const payload = this.jwt.verify<JwtPayload>(token, { secret: env.jwtSecret });
      req.user = payload;
      return true;
    } catch {
      throw new UnauthorizedException('Token invalido ou expirado');
    }
  }
}
