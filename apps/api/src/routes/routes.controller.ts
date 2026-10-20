import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { Roles } from '../common/decorators.js';
import { TenantContext } from '../prisma/tenant-context.js';
import { z } from 'zod';
import { ZodValidationPipe } from '../common/zod.pipe.js';

const inboundSchema = z.object({
  name: z.string().min(1),
  trunkId: z.string().optional().nullable(),
  did: z.string().default('_X.'),
  destinationType: z.enum(['ivr', 'extension', 'queue']),
  flowId: z.string().optional().nullable(),
  extensionNumber: z.string().optional().nullable(),
  queueName: z.string().optional().nullable(),
  record: z.boolean().default(true),
  priority: z.number().int().default(100),
  active: z.boolean().default(true),
});

const outboundSchema = z.object({
  name: z.string().min(1),
  pattern: z.string().min(1),
  trunkId: z.string(),
  stripDigits: z.number().int().default(0),
  prependDigits: z.string().default(''),
  callerId: z.string().optional().nullable(),
  priority: z.number().int().default(100),
  record: z.boolean().default(false),
  active: z.boolean().default(true),
});

@Controller('inbound-routes')
@UseGuards(JwtAuthGuard, RolesGuard)
export class InboundRoutesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list() {
    const tenantId = TenantContext.tenantId();
    if (!tenantId) throw new BadRequestException('Selecione uma empresa');
    return this.prisma.inboundRoute.findMany({ where: { tenantId }, orderBy: { priority: 'asc' } });
  }

  private async checkDestination(tenantId: string, dto: Partial<z.infer<typeof inboundSchema>>) {
    if (dto.trunkId) await this.prisma.trunk.findFirstOrThrow({ where: { id: dto.trunkId, tenantId } });
    if (dto.flowId) await this.prisma.ivrFlow.findFirstOrThrow({ where: { id: dto.flowId, tenantId } });
    if (dto.extensionNumber) await this.prisma.extension.findFirstOrThrow({ where: { number: dto.extensionNumber, tenantId } });
    if (dto.queueName) await this.prisma.queue.findFirstOrThrow({ where: { name: dto.queueName, tenantId } });
  }

  @Post()
  @Roles('superadmin', 'tenant_admin')
  async create(@Body(new ZodValidationPipe(inboundSchema)) dto: z.infer<typeof inboundSchema>) {
    const tenantId = TenantContext.tenantId();
    if (!tenantId) throw new BadRequestException('Tenant obrigatorio');
    await this.checkDestination(tenantId, dto);
    return this.prisma.inboundRoute.create({ data: { ...dto, tenantId } });
  }

  @Patch(':id')
  @Roles('superadmin', 'tenant_admin')
  async patch(@Param('id') id: string, @Body(new ZodValidationPipe(inboundSchema.partial())) dto: Partial<z.infer<typeof inboundSchema>>) {
    const tenantId = TenantContext.tenantId();
    if (!tenantId) throw new BadRequestException('Selecione uma empresa');
    await this.checkDestination(tenantId, dto);
    return this.prisma.inboundRoute.update({ where: { id, tenantId }, data: dto });
  }

  @Delete(':id')
  @Roles('superadmin', 'tenant_admin')
  async remove(@Param('id') id: string) {
    const tenantId = TenantContext.tenantId();
    if (!tenantId) throw new BadRequestException('Selecione uma empresa');
    await this.prisma.inboundRoute.delete({ where: { id, tenantId } });
    return { ok: true };
  }
}

@Controller('outbound-routes')
@UseGuards(JwtAuthGuard, RolesGuard)
export class OutboundRoutesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list() {
    const tenantId = TenantContext.tenantId();
    if (!tenantId) throw new BadRequestException('Selecione uma empresa');
    return this.prisma.outboundRoute.findMany({ where: { tenantId }, orderBy: { priority: 'asc' } });
  }

  @Post()
  @Roles('superadmin', 'tenant_admin')
  async create(@Body(new ZodValidationPipe(outboundSchema)) dto: z.infer<typeof outboundSchema>) {
    const tenantId = TenantContext.tenantId();
    if (!tenantId) throw new BadRequestException('Tenant obrigatorio');
    await this.prisma.trunk.findFirstOrThrow({ where: { id: dto.trunkId, tenantId } });
    return this.prisma.outboundRoute.create({ data: { ...dto, tenantId } });
  }

  @Patch(':id')
  @Roles('superadmin', 'tenant_admin')
  async patch(@Param('id') id: string, @Body(new ZodValidationPipe(outboundSchema.partial())) dto: Partial<z.infer<typeof outboundSchema>>) {
    const tenantId = TenantContext.tenantId();
    if (!tenantId) throw new BadRequestException('Selecione uma empresa');
    if (dto.trunkId) await this.prisma.trunk.findFirstOrThrow({ where: { id: dto.trunkId, tenantId } });
    return this.prisma.outboundRoute.update({ where: { id, tenantId }, data: dto });
  }

  @Delete(':id')
  @Roles('superadmin', 'tenant_admin')
  async remove(@Param('id') id: string) {
    const tenantId = TenantContext.tenantId();
    if (!tenantId) throw new BadRequestException('Selecione uma empresa');
    await this.prisma.outboundRoute.delete({ where: { id, tenantId } });
    return { ok: true };
  }
}
