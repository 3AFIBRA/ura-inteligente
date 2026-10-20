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
    return this.prisma.inboundRoute.findMany({ where: tenantId ? { tenantId } : {}, include: { trunk: true, flow: true }, orderBy: { priority: 'asc' } });
  }

  @Post()
  @Roles('superadmin', 'tenant_admin')
  async create(@Body(new ZodValidationPipe(inboundSchema)) dto: z.infer<typeof inboundSchema>) {
    const tenantId = TenantContext.tenantId();
    if (!tenantId) throw new BadRequestException('Tenant obrigatorio');
    return this.prisma.inboundRoute.create({ data: { ...dto, tenantId } });
  }

  @Patch(':id')
  @Roles('superadmin', 'tenant_admin')
  async patch(@Param('id') id: string, @Body() dto: Partial<z.infer<typeof inboundSchema>>) {
    return this.prisma.inboundRoute.update({ where: { id }, data: dto });
  }

  @Delete(':id')
  @Roles('superadmin', 'tenant_admin')
  async remove(@Param('id') id: string) {
    await this.prisma.inboundRoute.delete({ where: { id } });
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
    return this.prisma.outboundRoute.findMany({ where: tenantId ? { tenantId } : {}, include: { trunk: true }, orderBy: { priority: 'asc' } });
  }

  @Post()
  @Roles('superadmin', 'tenant_admin')
  async create(@Body(new ZodValidationPipe(outboundSchema)) dto: z.infer<typeof outboundSchema>) {
    const tenantId = TenantContext.tenantId();
    if (!tenantId) throw new BadRequestException('Tenant obrigatorio');
    return this.prisma.outboundRoute.create({ data: { ...dto, tenantId } });
  }

  @Patch(':id')
  @Roles('superadmin', 'tenant_admin')
  async patch(@Param('id') id: string, @Body() dto: Partial<z.infer<typeof outboundSchema>>) {
    return this.prisma.outboundRoute.update({ where: { id }, data: dto });
  }

  @Delete(':id')
  @Roles('superadmin', 'tenant_admin')
  async remove(@Param('id') id: string) {
    await this.prisma.outboundRoute.delete({ where: { id } });
    return { ok: true };
  }
}
