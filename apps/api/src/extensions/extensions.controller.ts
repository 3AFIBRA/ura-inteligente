import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { Roles } from '../common/decorators.js';
import { TenantContext } from '../prisma/tenant-context.js';
import { z } from 'zod';
import { ZodValidationPipe } from '../common/zod.pipe.js';
import * as bcrypt from 'bcryptjs';
import { env } from '../config/env.js';
import type { Codec } from '@ura/shared';

const extensionSchema = z.object({
  number: z.string().min(3).max(10),
  name: z.string().min(1),
  type: z.enum(['sip', 'webrtc']),
  secret: z.string().min(6).optional(),
  codecs: z.array(z.enum(['ulaw', 'alaw', 'g729', 'g722', 'opus', 'gsm'])).default(['ulaw', 'alaw', 'opus']),
  callerId: z.string().optional(),
  record: z.boolean().default(false),
  voicemail: z.boolean().default(false),
  voicemailEmail: z.string().email().optional(),
  maxContacts: z.number().int().min(1).max(10).default(3),
  active: z.boolean().default(true),
});

function generateSecret(): string {
  return Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10);
}

@Controller('extensions')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ExtensionsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(@Query('search') search?: string) {
    const tenantId = TenantContext.tenantId();
    const where: Record<string, unknown> = tenantId ? { tenantId } : {};
    if (search) {
      (where as any).OR = [
        { number: { contains: search } },
        { name: { contains: search, mode: 'insensitive' } },
      ];
    }
    return this.prisma.extension.findMany({ where, orderBy: { number: 'asc' } });
  }

  @Post()
  @Roles('superadmin', 'tenant_admin')
  async create(@Body(new ZodValidationPipe(extensionSchema)) dto: z.infer<typeof extensionSchema>) {
    const tenantId = TenantContext.tenantId();
    if (!tenantId) throw new BadRequestException('Tenant obrigatorio');
    const secret = dto.secret ?? generateSecret();
    return this.prisma.extension.create({
      data: {
        ...dto,
        secret: await bcrypt.hash(secret, 10),
        tenantId,
      },
    });
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    return this.prisma.extension.findUniqueOrThrow({ where: { id } });
  }

  @Patch(':id')
  @Roles('superadmin', 'tenant_admin')
  async patch(@Param('id') id: string, @Body() dto: Partial<z.infer<typeof extensionSchema>>) {
    const data: Record<string, unknown> = { ...dto };
    if (dto.secret) data.secret = await bcrypt.hash(dto.secret, 10);
    return this.prisma.extension.update({ where: { id }, data });
  }

  @Delete(':id')
  @Roles('superadmin', 'tenant_admin')
  async remove(@Param('id') id: string) {
    await this.prisma.extension.delete({ where: { id } });
    return { ok: true };
  }

  @Post(':id/reset-secret')
  @Roles('superadmin', 'tenant_admin')
  async resetSecret(@Param('id') id: string) {
    const secret = generateSecret();
    await this.prisma.extension.update({ where: { id }, data: { secret: await bcrypt.hash(secret, 10) } });
    return { secret };
  }

  @Get(':id/credentials')
  async credentials(@Param('id') id: string) {
    const ext = await this.prisma.extension.findUniqueOrThrow({ where: { id }, include: { tenant: true } });
    return {
      username: `t${ext.tenant.slug}-${ext.number}`,
      secret: '********',
      domain: env.appDomain,
      wssUrl: `wss://${env.appDomain}/ws`,
      sipPort: 5060,
      tlsPort: 5061,
      turn: {
        urls: [`turn:${env.publicIp}:3478`],
        username: env.turnUser,
        credential: env.turnPassword,
      },
    };
  }

  @Get('status/all')
  async status() {
    return this.prisma.extension.findMany({
      select: { id: true, number: true, lastStatus: true },
    });
  }
}
