import { Injectable, CanActivate, type ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Role } from '@ura/shared';
import { ROLES_KEY } from '../common/decorators.js';
import type { JwtPayload } from '../common/current-user.decorator.js';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [context.getHandler(), context.getClass()]);
    if (!roles || roles.length === 0) return true;
    const req = context.switchToHttp().getRequest<{ user?: JwtPayload }>();
    const user = req.user;
    if (!user) return false;
    if (!roles.includes(user.role as Role)) {
      throw new ForbiddenException('Permissao insuficiente');
    }
    return true;
  }
}
