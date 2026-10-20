import { Controller, Get, Post, Put, Patch, Delete, Body, Param, Query, UseGuards, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { Roles } from '../common/decorators.js';
import { TenantContext } from '../prisma/tenant-context.js';
import { ivrFlowDefinitionSchema, DEFAULT_ISP_FLOW } from '@ura/shared';
import { z } from 'zod';
import { ZodValidationPipe } from '../common/zod.pipe.js';

const flowSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  draft: z.record(z.unknown()),
});

@Controller('flows')
@UseGuards(JwtAuthGuard, RolesGuard)
export class FlowsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list() {
    const tenantId = TenantContext.tenantId();
    if (!tenantId) throw new BadRequestException('Selecione uma empresa');
    const items = await this.prisma.ivrFlow.findMany({
      where: { tenantId },
      orderBy: { name: 'asc' },
      select: {
        id: true, name: true, description: true, version: true, publishedAt: true, active: true, updatedAt: true, createdAt: true,
        published: true,
      },
    });
    return items.map((f) => ({ ...f, hasPublished: !!f.published }));
  }

  @Post()
  @Roles('superadmin', 'tenant_admin')
  async create(@Body(new ZodValidationPipe(flowSchema)) dto: z.infer<typeof flowSchema>) {
    const tenantId = TenantContext.tenantId();
    if (!tenantId) throw new BadRequestException('Tenant obrigatorio');
    const parsed = ivrFlowDefinitionSchema.safeParse(dto.draft);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
    return this.prisma.ivrFlow.create({
      data: {
        name: dto.name,
        description: dto.description,
        draft: parsed.data as any,
        tenantId,
      },
    });
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    const tenantId = TenantContext.tenantId();
    if (!tenantId) throw new BadRequestException('Selecione uma empresa');
    return this.prisma.ivrFlow.findFirstOrThrow({ where: { id, tenantId } });
  }

  @Put(':id/draft')
  @Roles('superadmin', 'tenant_admin')
  async putDraft(@Param('id') id: string, @Body() dto: { draft: Record<string, unknown> }) {
    const parsed = ivrFlowDefinitionSchema.safeParse(dto.draft);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
    const tenantId = TenantContext.tenantId();
    if (!tenantId) throw new BadRequestException('Selecione uma empresa');
    return this.prisma.ivrFlow.update({ where: { id, tenantId }, data: { draft: parsed.data as any } });
  }

  @Post(':id/publish')
  @Roles('superadmin', 'tenant_admin')
  async publish(@Param('id') id: string) {
    const tenantId = TenantContext.tenantId();
    if (!tenantId) throw new BadRequestException('Selecione uma empresa');
    const flow = await this.prisma.ivrFlow.findFirstOrThrow({ where: { id, tenantId } });
    return this.prisma.ivrFlow.update({
      where: { id, tenantId },
      data: { published: flow.draft as any, publishedAt: new Date(), version: { increment: 1 } },
    });
  }

  @Post('validate')
  async validate(@Body() dto: { draft: Record<string, unknown> }) {
    const parsed = ivrFlowDefinitionSchema.safeParse(dto.draft);
    if (parsed.success) return { ok: true, issues: [] };
    return { ok: false, issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) };
  }

  @Get('templates/all')
  async templates() {
    return [{ key: 'isp_default', name: 'URA Padrao de ISP', description: 'Segunda via, cadastro, financeiro e suporte', definition: DEFAULT_ISP_FLOW }];
  }

  @Delete(':id')
  @Roles('superadmin', 'tenant_admin')
  async remove(@Param('id') id: string) {
    const tenantId = TenantContext.tenantId();
    if (!tenantId) throw new BadRequestException('Selecione uma empresa');
    await this.prisma.ivrFlow.delete({ where: { id, tenantId } });
    return { ok: true };
  }
}
