import { BadRequestException, Controller, Get, NotFoundException, Param, Query } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { TenantContext } from '../prisma/tenant-context.js';
import type { Prisma } from '@prisma/client';

const activeStatuses = ['ringing', 'in_ivr', 'in_queue', 'talking'];

function tenantId(): string {
  const id = TenantContext.tenantId();
  if (!id) throw new BadRequestException('Selecione uma empresa para consultar as chamadas');
  return id;
}

function dateFilter(from?: string, to?: string): Prisma.DateTimeFilter | undefined {
  const range: Prisma.DateTimeFilter = {};
  if (from) {
    const date = new Date(`${from}T00:00:00Z`);
    if (Number.isNaN(date.getTime())) throw new BadRequestException('Data inicial inválida');
    range.gte = date;
  }
  if (to) {
    const date = new Date(`${to}T23:59:59.999Z`);
    if (Number.isNaN(date.getTime())) throw new BadRequestException('Data final inválida');
    range.lte = date;
  }
  return Object.keys(range).length ? range : undefined;
}

@Controller('calls')
export class CallsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '20',
    @Query('status') status?: string,
    @Query('direction') direction?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const currentPage = Math.max(1, Number(page) || 1);
    const size = Math.min(100, Math.max(1, Number(pageSize) || 20));
    const where: Prisma.CallWhereInput = { tenantId: tenantId(), ...(status && { status }), ...(direction && { direction }), ...(dateFilter(from, to) && { startedAt: dateFilter(from, to) }) };
    const [items, total] = await Promise.all([
      this.prisma.call.findMany({ where, orderBy: { startedAt: 'desc' }, skip: (currentPage - 1) * size, take: size }),
      this.prisma.call.count({ where }),
    ]);
    return { items, total, page: currentPage, pageSize: size };
  }

  @Get('active/all')
  async active() {
    return this.prisma.call.findMany({
      where: { tenantId: tenantId(), status: { in: activeStatuses } },
      orderBy: { startedAt: 'desc' },
    });
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    const call = await this.prisma.call.findFirst({ where: { id, tenantId: tenantId() }, include: { events: { orderBy: { createdAt: 'asc' } }, recording: true } });
    if (!call) throw new NotFoundException('Chamada não encontrada');
    return call;
  }
}

@Controller('reports')
export class ReportsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('overview')
  async overview(@Query('from') from?: string, @Query('to') to?: string) {
    const calls = await this.prisma.call.findMany({
      where: { tenantId: tenantId(), ...(dateFilter(from, to) && { startedAt: dateFilter(from, to) }) },
      select: { status: true, answeredAt: true, waitSec: true, billSec: true, startedAt: true, queueName: true, intents: true },
    });
    const answered = calls.filter((call) => !!call.answeredAt).length;
    const abandoned = calls.filter((call) => call.status === 'abandoned').length;
    const waits = calls.filter((call) => call.waitSec !== null).map((call) => call.waitSec!);
    const talks = calls.filter((call) => call.billSec !== null).map((call) => call.billSec!);
    const byDay = new Map<string, { date: string; calls: number; answered: number; abandoned: number }>();
    const byHour = new Map<number, number>();
    const byIntent = new Map<string, number>();
    const byQueue = new Map<string, { queueName: string; calls: number; answered: number; abandoned: number; waits: number[] }>();
    for (const call of calls) {
      const date = call.startedAt.toISOString().slice(0, 10);
      const day = byDay.get(date) ?? { date, calls: 0, answered: 0, abandoned: 0 };
      day.calls++;
      if (call.answeredAt) day.answered++;
      if (call.status === 'abandoned') day.abandoned++;
      byDay.set(date, day);
      const hour = call.startedAt.getUTCHours();
      byHour.set(hour, (byHour.get(hour) ?? 0) + 1);
      for (const intent of call.intents) byIntent.set(intent, (byIntent.get(intent) ?? 0) + 1);
      if (call.queueName) {
        const queue = byQueue.get(call.queueName) ?? { queueName: call.queueName, calls: 0, answered: 0, abandoned: 0, waits: [] };
        queue.calls++;
        if (call.answeredAt) queue.answered++;
        if (call.status === 'abandoned') queue.abandoned++;
        if (call.waitSec !== null) queue.waits.push(call.waitSec);
        byQueue.set(call.queueName, queue);
      }
    }
    return {
      totalCalls: calls.length, answered, abandoned,
      avgWaitSec: waits.length ? Math.round(waits.reduce((a, b) => a + b, 0) / waits.length) : 0,
      avgTalkSec: talks.length ? Math.round(talks.reduce((a, b) => a + b, 0) / talks.length) : 0,
      slaPct: waits.length ? Math.round(waits.filter((wait) => wait <= 60).length / waits.length * 100) : 0,
      byHour: [...byHour].sort(([a], [b]) => a - b).map(([hour, count]) => ({ hour, calls: count })),
      byDay: [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date)),
      byIntent: [...byIntent].map(([intent, count]) => ({ intent, count })),
      byQueue: [...byQueue.values()].map(({ queueName, calls: total, answered: handled, abandoned: dropped, waits: queueWaits }) => ({ queueName, calls: total, answered: handled, abandoned: dropped, avgWaitSec: queueWaits.length ? Math.round(queueWaits.reduce((a, b) => a + b, 0) / queueWaits.length) : 0, slaPct: queueWaits.length ? Math.round(queueWaits.filter((wait) => wait <= 60).length / queueWaits.length * 100) : 0 })),
    };
  }
}
