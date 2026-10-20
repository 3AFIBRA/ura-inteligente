import { Controller, Get, UseGuards } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async check() {
    let db = false;
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      db = true;
    } catch {
      db = false;
    }
    return { status: 'ok', db, redis: false, asterisk: { ami: false, ari: false } };
  }
}

@Controller('asterisk')
@UseGuards(JwtAuthGuard)
export class AsteriskController {
  @Get('status')
  status() {
    return { version: '20.x', uptime: '0:00:00', ami: false, ari: false, channels: 0, endpoints: 0 };
  }
}
