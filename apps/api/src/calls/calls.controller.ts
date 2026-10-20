import { Controller, Get, Post, Param, Query, UseGuards } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';

@Controller('calls')
@UseGuards(JwtAuthGuard)
export class CallsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '20',
    @Query('status') status?: string,
    @Query('direction') direction?: string,
  ) {
    const tenantId = null; // TODO tenant
    const where: Record<string, unknown> = tenantId ? { tenantId } : {};
    if (status) (where as any).status = status;
    if (direction) (where as any).direction = direction;
    const skip = (Number(page) - 1) * Number(pageSize);
    const [items, total] = await Promise.all([
      this.prisma.call.findMany({ where, orderBy: { startedAt: 'desc' }, skip, take: Number(pageSize), include: { events: { orderBy: { createdAt: 'asc' } } } }),
      this.prisma.call.count({ where }),
    ]);
    return { items, total, page: Number(page), pageSize: Number(pageSize) };
  }

  @Get('active/all')
  async active() {
    return this.prisma.call.findMany({
      where: { status: { in: ['ringing', 'in_ivr', 'in_queue', 'talking'] } },
      orderBy: { startedAt: 'desc' },
    });
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    return this.prisma.call.findUniqueOrThrow({ where: { id }, include: { events: { orderBy: { createdAt: 'asc' } }, recording: true } });
  }

  @Post(':id/hangup')
  async hangup(@Param('id') id: string) {
    await this.prisma.call.update({ where: { id }, data: { status: 'completed', endedAt: new Date() } });
    return { ok: true };
  }
}

@Controller('reports')
@UseGuards(JwtAuthGuard)
export class ReportsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('overview')
  async overview() {
    return { totalCalls: 0, answered: 0, abandoned: 0, avgWaitSec: 0, avgTalkSec: 0, slaPct: 0, byHour: [], byDay: [], byIntent: [], byQueue: [] };
  }

  @Get('agents')
  async agents() {
    return [];
  }

  @Get('ivr')
  async ivr() {
    return { totalIvrCalls: 0, selfServiceRate: 0, boletosSent: 0, newCustomers: 0, transfersToQueue: 0, byIntent: [] };
  }
}
