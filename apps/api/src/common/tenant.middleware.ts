import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';
import type { JwtPayload } from '../common/current-user.decorator.js';
import { TenantContext } from '../prisma/tenant-context.js';

@Injectable()
export class TenantMiddleware implements NestMiddleware {
  use(req: Request & { user?: JwtPayload }, res: Response, next: NextFunction) {
    const user = req.user;
    let tenantId: string | null = null;
    if (user) {
      if (user.role === 'superadmin') {
        const header = req.headers['x-tenant-id'];
        tenantId = typeof header === 'string' ? header : null;
      } else {
        tenantId = user.tenantId;
      }
    }
    TenantContext.run({ tenantId, userId: user?.sub ?? null, role: (user?.role as any) ?? null, ip: req.ip ?? undefined }, () => {
      next();
    });
  }
}
