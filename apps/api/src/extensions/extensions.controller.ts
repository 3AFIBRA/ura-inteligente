import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { Roles } from '../common/decorators.js';
import { TenantContext } from '../prisma/tenant-context.js';
import { AsteriskConfigService, encryptExtensionSecret } from '../asterisk/asterisk-config.service.js';
import { z } from 'zod';
import { ZodValidationPipe } from '../common/zod.pipe.js';
import { randomBytes } from 'node:crypto';
import { env } from '../config/env.js';

const extensionSelect = { id: true, tenantId: true, number: true, name: true, type: true, codecs: true, callerId: true, record: true, voicemail: true, voicemailEmail: true, outboundRouteId: true, maxContacts: true, active: true, lastStatus: true, lastStatusAt: true, createdAt: true } as const;

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
  return randomBytes(18).toString('base64url');
}

@Controller('extensions')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ExtensionsController {
  private readonly logger = new Logger(ExtensionsController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly asterisk: AsteriskConfigService,
  ) {}

  private tenantId(): string {
    const tenantId = TenantContext.tenantId();
    if (!tenantId) throw new BadRequestException('Selecione uma empresa');
    return tenantId;
  }

  /** Regenera a config do Asterisk para o tenant (falhas não bloqueiam a resposta). */
  private applyConfig(tenantId: string) {
    void this.asterisk.applyTenant(tenantId).catch((err) => {
      this.logger.warn(`Falha ao aplicar configuração do Asterisk: ${String(err)}`);
    });
  }

  @Get()
  async list(@Query('search') search?: string) {
    const tenantId = this.tenantId();
    const where: Record<string, unknown> = { tenantId };
    if (search) {
      (where as any).OR = [
        { number: { contains: search } },
        { name: { contains: search, mode: 'insensitive' } },
      ];
    }
    return this.prisma.extension.findMany({ where, select: extensionSelect, orderBy: { number: 'asc' } });
  }

  /** Status de registro de todos os ramais do tenant (luz verde/vermelha). */
  @Get('statuses')
  async statuses() {
    const tenantId = this.tenantId();
    const tenant = await this.prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
    const extensions = await this.prisma.extension.findMany({ where: { tenantId }, orderBy: { number: 'asc' } });
    return this.asterisk.extensionsStatus(tenant, extensions);
  }

  @Post()
  @Roles('superadmin', 'tenant_admin')
  async create(@Body(new ZodValidationPipe(extensionSchema)) dto: z.infer<typeof extensionSchema>) {
    const tenantId = this.tenantId();
    const secret = dto.secret ?? generateSecret();
    const ext = await this.prisma.extension.create({
      data: {
        ...dto,
        secret: encryptExtensionSecret(secret),
        tenantId,
      },
      select: extensionSelect,
    });
    this.applyConfig(tenantId);
    return ext;
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    const tenantId = this.tenantId();
    return this.prisma.extension.findFirstOrThrow({ where: { id, tenantId }, select: extensionSelect });
  }

  @Patch(':id')
  @Roles('superadmin', 'tenant_admin')
  async patch(@Param('id') id: string, @Body(new ZodValidationPipe(extensionSchema.partial())) dto: Partial<z.infer<typeof extensionSchema>>) {
    const tenantId = this.tenantId();
    const data: Record<string, unknown> = { ...dto };
    if (dto.secret) data.secret = encryptExtensionSecret(dto.secret);
    else delete data.secret;
    const ext = await this.prisma.extension.update({ where: { id, tenantId }, data, select: extensionSelect });
    this.applyConfig(tenantId);
    return ext;
  }

  @Delete(':id')
  @Roles('superadmin', 'tenant_admin')
  async remove(@Param('id') id: string) {
    const tenantId = this.tenantId();
    await this.prisma.extension.delete({ where: { id, tenantId } });
    this.applyConfig(tenantId);
    return { ok: true };
  }

  @Post(':id/reset-secret')
  @Roles('superadmin', 'tenant_admin')
  async resetSecret(@Param('id') id: string) {
    const secret = generateSecret();
    const tenantId = this.tenantId();
    await this.prisma.extension.update({ where: { id, tenantId }, data: { secret: encryptExtensionSecret(secret) } });
    this.applyConfig(tenantId);
    return { secret };
  }

  @Get(':id/credentials')
  async credentials(@Param('id') id: string) {
    const tenantId = this.tenantId();
    const ext = await this.prisma.extension.findFirstOrThrow({ where: { id, tenantId }, include: { tenant: true } });
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
}
