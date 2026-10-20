import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { Roles } from '../common/decorators.js';
import { TenantContext } from '../prisma/tenant-context.js';
import { z } from 'zod';
import { ZodValidationPipe } from '../common/zod.pipe.js';
import type { Codec } from '@ura/shared';

const trunkSelect = { id: true, tenantId: true, name: true, description: true, authMode: true, host: true, port: true, transport: true, username: true, fromDomain: true, fromUser: true, outboundCallerId: true, codecs: true, maxChannels: true, stripDigits: true, prependDigits: true, dids: true, allowedIps: true, qualify: true, active: true, createdAt: true, lastStatus: true } as const;

const trunkSchema = z.object({
  name: z.string().regex(/^[a-z0-9_]{2,20}$/),
  description: z.string().optional(),
  authMode: z.enum(['register', 'ip']),
  host: z.string().min(1),
  port: z.number().int().default(5060),
  transport: z.enum(['udp', 'tcp', 'tls']).default('udp'),
  username: z.string().optional(),
  password: z.string().optional(),
  fromDomain: z.string().optional(),
  fromUser: z.string().optional(),
  outboundCallerId: z.string().optional(),
  codecs: z.array(z.enum(['ulaw', 'alaw', 'g729', 'g722', 'opus', 'gsm'])).default(['ulaw', 'alaw']),
  maxChannels: z.number().int().default(0),
  stripDigits: z.number().int().default(0),
  prependDigits: z.string().default(''),
  dids: z.array(z.string()).default([]),
  allowedIps: z.array(z.string()).default([]),
  qualify: z.boolean().default(true),
  active: z.boolean().default(true),
});

@Controller('trunks')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TrunksController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(@Query('search') search?: string) {
    const tenantId = TenantContext.tenantId();
    if (!tenantId) throw new BadRequestException('Selecione uma empresa');
    const where: Record<string, unknown> = { tenantId };
    if (search) (where as any).name = { contains: search };
    return this.prisma.trunk.findMany({ where, select: trunkSelect, orderBy: { name: 'asc' } });
  }

  @Post()
  @Roles('superadmin', 'tenant_admin')
  async create(@Body(new ZodValidationPipe(trunkSchema)) dto: z.infer<typeof trunkSchema>) {
    const tenantId = TenantContext.tenantId();
    if (!tenantId) throw new BadRequestException('Tenant obrigatorio');
    return this.prisma.trunk.create({ data: { ...dto, tenantId }, select: trunkSelect });
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    const tenantId = TenantContext.tenantId();
    if (!tenantId) throw new BadRequestException('Selecione uma empresa');
    return this.prisma.trunk.findFirstOrThrow({ where: { id, tenantId }, select: trunkSelect });
  }

  @Patch(':id')
  @Roles('superadmin', 'tenant_admin')
  async patch(@Param('id') id: string, @Body(new ZodValidationPipe(trunkSchema.partial())) dto: Partial<z.infer<typeof trunkSchema>>) {
    const tenantId = TenantContext.tenantId();
    if (!tenantId) throw new BadRequestException('Selecione uma empresa');
    const { password, ...data } = dto;
    return this.prisma.trunk.update({ where: { id, tenantId }, data: { ...data, ...(password && { password }) }, select: trunkSelect });
  }

  @Delete(':id')
  @Roles('superadmin', 'tenant_admin')
  async remove(@Param('id') id: string) {
    const tenantId = TenantContext.tenantId();
    if (!tenantId) throw new BadRequestException('Selecione uma empresa');
    await this.prisma.trunk.delete({ where: { id, tenantId } });
    return { ok: true };
  }

  @Get(':id/status')
  async status(@Param('id') id: string) {
    const tenantId = TenantContext.tenantId();
    if (!tenantId) throw new BadRequestException('Selecione uma empresa');
    const trunk = await this.prisma.trunk.findFirstOrThrow({ where: { id, tenantId }, select: { lastStatus: true, lastStatusAt: true } });
    return { status: trunk.lastStatus ?? 'unknown', detail: trunk.lastStatusAt?.toISOString() };
  }
}
