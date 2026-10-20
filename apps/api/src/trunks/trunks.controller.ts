import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { Roles } from '../common/decorators.js';
import { TenantContext } from '../prisma/tenant-context.js';
import { z } from 'zod';
import { ZodValidationPipe } from '../common/zod.pipe.js';
import type { Codec } from '@ura/shared';

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
    const where: Record<string, unknown> = tenantId ? { tenantId } : {};
    if (search) (where as any).name = { contains: search };
    return this.prisma.trunk.findMany({ where, orderBy: { name: 'asc' } });
  }

  @Post()
  @Roles('superadmin', 'tenant_admin')
  async create(@Body(new ZodValidationPipe(trunkSchema)) dto: z.infer<typeof trunkSchema>) {
    const tenantId = TenantContext.tenantId();
    if (!tenantId) throw new BadRequestException('Tenant obrigatorio');
    return this.prisma.trunk.create({ data: { ...dto, tenantId } });
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    return this.prisma.trunk.findUniqueOrThrow({ where: { id } });
  }

  @Patch(':id')
  @Roles('superadmin', 'tenant_admin')
  async patch(@Param('id') id: string, @Body() dto: Partial<z.infer<typeof trunkSchema>>) {
    return this.prisma.trunk.update({ where: { id }, data: dto });
  }

  @Delete(':id')
  @Roles('superadmin', 'tenant_admin')
  async remove(@Param('id') id: string) {
    await this.prisma.trunk.delete({ where: { id } });
    return { ok: true };
  }

  @Get(':id/status')
  async status(@Param('id') id: string) {
    const trunk = await this.prisma.trunk.findUniqueOrThrow({ where: { id } });
    return { status: trunk.lastStatus ?? 'unknown', detail: trunk.lastStatusAt?.toISOString() };
  }
}
