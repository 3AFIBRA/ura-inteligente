import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { Roles } from '../common/decorators.js';
import { TenantContext } from '../prisma/tenant-context.js';
import { z } from 'zod';
import { ZodValidationPipe } from '../common/zod.pipe.js';

const tenantSchema = z.object({
  slug: z.string().regex(/^[a-z0-9]{2,12}$/),
  name: z.string().min(1),
  locale: z.string().optional(),
  timezone: z.string().optional(),
  active: z.boolean().optional(),
  settings: z.record(z.unknown()).optional(),
});

@Controller('tenants')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TenantsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @Roles('superadmin')
  async list(@Query('search') search?: string) {
    const where: Record<string, unknown> = {};
    if (search) {
      (where as any).OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { slug: { contains: search, mode: 'insensitive' } },
      ];
    }
    return this.prisma.tenant.findMany({ where, orderBy: { name: 'asc' } });
  }

  @Post()
  @Roles('superadmin')
  async create(@Body(new ZodValidationPipe(tenantSchema)) dto: z.infer<typeof tenantSchema>) {
    return this.prisma.tenant.create({
      data: {
        slug: dto.slug,
        name: dto.name,
        locale: dto.locale,
        timezone: dto.timezone,
        active: dto.active,
        settings: dto.settings as any,
      },
    });
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    return this.prisma.tenant.findUniqueOrThrow({ where: { id } });
  }

  @Patch(':id')
  @Roles('superadmin')
  async patch(@Param('id') id: string, @Body() dto: Partial<z.infer<typeof tenantSchema>>) {
    const data: Record<string, unknown> = {};
    if (dto.name) data.name = dto.name;
    if (dto.locale) data.locale = dto.locale;
    if (dto.timezone) data.timezone = dto.timezone;
    if (dto.active !== undefined) data.active = dto.active;
    if (dto.settings) data.settings = dto.settings as any;
    return this.prisma.tenant.update({ where: { id }, data });
  }

  @Delete(':id')
  @Roles('superadmin')
  async remove(@Param('id') id: string) {
    await this.prisma.tenant.delete({ where: { id } });
    return { ok: true };
  }

  @Get(':id/stats')
  async stats(@Param('id') id: string) {
    const [extensions, trunks, queues, callsToday, activeCalls] = await Promise.all([
      this.prisma.extension.count({ where: { tenantId: id } }),
      this.prisma.trunk.count({ where: { tenantId: id } }),
      this.prisma.queue.count({ where: { tenantId: id } }),
      this.prisma.call.count({
        where: {
          tenantId: id,
          startedAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        },
      }),
      this.prisma.call.count({ where: { tenantId: id, status: { in: ['ringing', 'in_ivr', 'in_queue', 'talking'] } } }),
    ]);
    return { extensions, trunks, queues, callsToday, activeCalls };
  }

  @Post(':id/apply')
  @Roles('superadmin', 'tenant_admin')
  async apply(@Param('id') id: string) {
    return { ok: true, message: 'Asterisk reload sera implementado' };
  }
}
