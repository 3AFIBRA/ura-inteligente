import { Controller, Get, Post, Body, Patch, Param, Delete, Query, UseGuards, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { Roles } from '../common/decorators.js';
import { TenantContext } from '../prisma/tenant-context.js';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { ZodValidationPipe } from '../common/zod.pipe.js';

const userSelect = { id: true, tenantId: true, email: true, name: true, role: true, locale: true, extensionId: true, active: true, extension: { select: { id: true, number: true, name: true, type: true } } } as const;

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
    if (!tenantId) throw new BadRequestException('Selecione uma empresa');
    const where: Record<string, unknown> = { tenantId };
    if (search) {
      (where as any).OR = [
        { email: { contains: search, mode: 'insensitive' } },
        { name: { contains: search, mode: 'insensitive' } },
      ];
    }
    const skip = (Number(page) - 1) * Number(pageSize);
    const [items, total] = await Promise.all([
      this.prisma.user.findMany({ where, select: userSelect, skip, take: Number(pageSize), orderBy: { name: 'asc' } }),
      this.prisma.user.count({ where }),
    ]);
    return { items, total, page: Number(page), pageSize: Number(pageSize) };
  }

  @Post()
  @Roles('superadmin', 'tenant_admin')
  async create(@Body(new ZodValidationPipe(createUserSchema)) dto: z.infer<typeof createUserSchema>) {
    const tenantId = TenantContext.tenantId();
    if (!tenantId) throw new BadRequestException('Selecione uma empresa');
    if (dto.role === 'superadmin') throw new BadRequestException('Superadmin não pode ser criado neste painel');
    if (dto.extensionId) await this.prisma.extension.findFirstOrThrow({ where: { id: dto.extensionId, tenantId } });
    const { password, ...data } = dto;
    const hash = await bcrypt.hash(password, 10);
    return this.prisma.user.create({
      data: { ...data, passwordHash: hash, tenantId },
      select: userSelect,
    });
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    const tenantId = TenantContext.tenantId();
    if (!tenantId) throw new BadRequestException('Selecione uma empresa');
    return this.prisma.user.findFirstOrThrow({ where: { id, tenantId }, select: userSelect });
  }

  @Patch(':id')
  @Roles('superadmin', 'tenant_admin')
  async patch(@Param('id') id: string, @Body(new ZodValidationPipe(createUserSchema.partial())) dto: Partial<z.infer<typeof createUserSchema>>) {
    const tenantId = TenantContext.tenantId();
    if (!tenantId) throw new BadRequestException('Selecione uma empresa');
    const target = await this.prisma.user.findFirstOrThrow({ where: { id, tenantId }, select: { role: true } });
    if (target.role === 'superadmin' || dto.role === 'superadmin') throw new BadRequestException('Perfil superadmin não pode ser alterado neste painel');
    if (dto.extensionId) await this.prisma.extension.findFirstOrThrow({ where: { id: dto.extensionId, tenantId } });
    const data: Record<string, unknown> = {};
    if (dto.email) data.email = dto.email;
    if (dto.name) data.name = dto.name;
    if (dto.password) data.passwordHash = await bcrypt.hash(dto.password, 10);
    if (dto.role) data.role = dto.role;
    if (dto.locale) data.locale = dto.locale;
    if (dto.extensionId !== undefined) data.extensionId = dto.extensionId || null;
    if (dto.active !== undefined) data.active = dto.active;
    return this.prisma.user.update({ where: { id, tenantId }, data, select: userSelect });
  }

  @Delete(':id')
  @Roles('superadmin', 'tenant_admin')
  async remove(@Param('id') id: string) {
    const tenantId = TenantContext.tenantId();
    if (!tenantId) throw new BadRequestException('Selecione uma empresa');
    await this.prisma.user.findFirstOrThrow({ where: { id, tenantId, role: { not: 'superadmin' } } });
    await this.prisma.user.delete({ where: { id, tenantId } });
    return { ok: true };
  }
}
