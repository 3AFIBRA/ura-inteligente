import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { Roles } from '../common/decorators.js';
import { TenantContext } from '../prisma/tenant-context.js';
import { AsteriskConfigService } from '../asterisk/asterisk-config.service.js';
import { z } from 'zod';
import { ZodValidationPipe } from '../common/zod.pipe.js';

const queueSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  strategy: z.enum(['ringall', 'leastrecent', 'fewestcalls', 'random', 'rrmemory', 'linear', 'wrandom']).default('rrmemory'),
  timeoutSec: z.number().int().default(20),
  retrySec: z.number().int().default(3),
  wrapupSec: z.number().int().default(5),
  maxLen: z.number().int().default(0),
  musicClass: z.string().default('default'),
  announcePosition: z.boolean().default(true),
  announceHoldtime: z.boolean().default(true),
  announceFrequency: z.number().int().default(60),
  record: z.boolean().default(true),
  slaSec: z.number().int().default(60),
  active: z.boolean().default(true),
});

const memberSchema = z.object({
  extensionId: z.string(),
  penalty: z.number().int().default(0),
});

@Controller('queues')
@UseGuards(JwtAuthGuard, RolesGuard)
export class QueuesController {
  private readonly logger = new Logger(QueuesController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly asterisk: AsteriskConfigService,
  ) {}

  /** Regenera a config de filas do tenant (falhas nao bloqueiam a resposta). */
  private applyConfig(tenantId: string) {
    void this.asterisk.applyTenant(tenantId).catch((err) => {
      this.logger.warn(`Falha ao aplicar configuração de filas: ${String(err)}`);
    });
  }

  @Get()
  async list() {
    const tenantId = TenantContext.tenantId();
    if (!tenantId) throw new BadRequestException('Selecione uma empresa');
    return this.prisma.queue.findMany({ where: { tenantId }, include: { members: { include: { extension: { select: { id: true, number: true, name: true, type: true } } } } }, orderBy: { name: 'asc' } });
  }

  @Post()
  @Roles('superadmin', 'tenant_admin')
  async create(@Body(new ZodValidationPipe(queueSchema)) dto: z.infer<typeof queueSchema>) {
    const tenantId = TenantContext.tenantId();
    if (!tenantId) throw new BadRequestException('Tenant obrigatorio');
    const queue = await this.prisma.queue.create({ data: { ...dto, tenantId } });
    this.applyConfig(tenantId);
    return queue;
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    const tenantId = TenantContext.tenantId();
    if (!tenantId) throw new BadRequestException('Selecione uma empresa');
    return this.prisma.queue.findFirstOrThrow({ where: { id, tenantId }, include: { members: { include: { extension: { select: { id: true, number: true, name: true, type: true } } } } } });
  }

  @Patch(':id')
  @Roles('superadmin', 'tenant_admin')
  async patch(@Param('id') id: string, @Body(new ZodValidationPipe(queueSchema.partial())) dto: Partial<z.infer<typeof queueSchema>>) {
    const tenantId = TenantContext.tenantId();
    if (!tenantId) throw new BadRequestException('Selecione uma empresa');
    const queue = await this.prisma.queue.update({ where: { id, tenantId }, data: dto });
    this.applyConfig(tenantId);
    return queue;
  }

  @Delete(':id')
  @Roles('superadmin', 'tenant_admin')
  async remove(@Param('id') id: string) {
    const tenantId = TenantContext.tenantId();
    if (!tenantId) throw new BadRequestException('Selecione uma empresa');
    await this.prisma.queue.delete({ where: { id, tenantId } });
    this.applyConfig(tenantId);
    return { ok: true };
  }

  @Post(':id/members')
  @Roles('superadmin', 'tenant_admin')
  async addMember(@Param('id') id: string, @Body(new ZodValidationPipe(memberSchema)) dto: z.infer<typeof memberSchema>) {
    const tenantId = TenantContext.tenantId();
    if (!tenantId) throw new BadRequestException('Selecione uma empresa');
    await Promise.all([
      this.prisma.queue.findFirstOrThrow({ where: { id, tenantId }, select: { id: true } }),
      this.prisma.extension.findFirstOrThrow({ where: { id: dto.extensionId, tenantId }, select: { id: true } }),
    ]);
    const member = await this.prisma.queueMember.create({ data: { queueId: id, extensionId: dto.extensionId, penalty: dto.penalty } });
    this.applyConfig(tenantId);
    return member;
  }

  @Delete(':id/members/:extensionId')
  @Roles('superadmin', 'tenant_admin')
  async removeMember(@Param('id') id: string, @Param('extensionId') extensionId: string) {
    const tenantId = TenantContext.tenantId();
    if (!tenantId) throw new BadRequestException('Selecione uma empresa');
    await this.prisma.queue.findFirstOrThrow({ where: { id, tenantId }, select: { id: true } });
    await this.prisma.queueMember.deleteMany({ where: { queueId: id, extensionId } });
    this.applyConfig(tenantId);
    return { ok: true };
  }

  @Post(':id/members/:extensionId/pause')
  @Roles('superadmin', 'tenant_admin', 'supervisor')
  async pauseMember(@Param('id') id: string, @Param('extensionId') extensionId: string, @Body(new ZodValidationPipe(z.object({ paused: z.boolean() }))) dto: { paused: boolean }) {
    const tenantId = TenantContext.tenantId();
    if (!tenantId) throw new BadRequestException('Selecione uma empresa');
    await this.prisma.queue.findFirstOrThrow({ where: { id, tenantId }, select: { id: true } });
    await this.prisma.queueMember.updateMany({ where: { queueId: id, extensionId }, data: { paused: dto.paused } });
    return { ok: true };
  }

  @Get('status/all')
  async status() {
    return [];
  }
}
