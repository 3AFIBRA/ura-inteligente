import { Controller, Get, Post, Body, Patch, Param, Delete, Query, UseGuards } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { Roles } from '../common/decorators.js';
import { TenantContext } from '../prisma/tenant-context.js';
import * as bcrypt from 'bcryptjs';
import { z } from 'zod';
import { ZodValidationPipe } from '../common/zod.pipe.js';

const createUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  password: z.string().min(6),
  role: z.enum(['superadmin', 'tenant_admin', 'supervisor', 'agent']),
  locale: z.string().optional(),
  extensionId: z.string().optional(),
  active: z.boolean().optional(),
});

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '20',
    @Query('search') search?: string,
  ) {
    const tenantId = TenantContext.tenantId();
    const where: Record<string, unknown> = tenantId ? { tenantId } : {};
    if (search) {
      (where as any).OR = [
        { email: { contains: search, mode: 'insensitive' } },
        { name: { contains: search, mode: 'insensitive' } },
      ];
    }
    const skip = (Number(page) - 1) * Number(pageSize);
    const [items, total] = await Promise.all([
      this.prisma.user.findMany({ where, include: { extension: true }, skip, take: Number(pageSize), orderBy: { name: 'asc' } }),
      this.prisma.user.count({ where }),
    ]);
    return { items, total, page: Number(page), pageSize: Number(pageSize) };
  }

  @Post()
  @Roles('superadmin', 'tenant_admin')
  async create(@Body(new ZodValidationPipe(createUserSchema)) dto: z.infer<typeof createUserSchema>) {
    const tenantId = TenantContext.tenantId();
    const hash = await bcrypt.hash(dto.password, 10);
    return this.prisma.user.create({
      data: { ...dto, passwordHash: hash, tenantId: tenantId! },
      include: { extension: true },
    });
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    return this.prisma.user.findUniqueOrThrow({ where: { id }, include: { extension: true } });
  }

  @Patch(':id')
  @Roles('superadmin', 'tenant_admin')
  async patch(@Param('id') id: string, @Body() dto: Partial<z.infer<typeof createUserSchema>>) {
    const data: Record<string, unknown> = {};
    if (dto.email) data.email = dto.email;
    if (dto.name) data.name = dto.name;
    if (dto.password) data.passwordHash = await bcrypt.hash(dto.password, 10);
    if (dto.role) data.role = dto.role;
    if (dto.locale) data.locale = dto.locale;
    if (dto.extensionId !== undefined) data.extensionId = dto.extensionId || null;
    if (dto.active !== undefined) data.active = dto.active;
    return this.prisma.user.update({ where: { id }, data, include: { extension: true } });
  }

  @Delete(':id')
  @Roles('superadmin', 'tenant_admin')
  async remove(@Param('id') id: string) {
    await this.prisma.user.delete({ where: { id } });
    return { ok: true };
  }
}
