import { Controller, Get, Post, Patch, Delete, Put, Param, Body, UseGuards, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { Roles } from '../common/decorators.js';
import { TenantContext } from '../prisma/tenant-context.js';
import { encryptSecrets, decryptSecrets } from '@ura/shared/crypto';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { ZodValidationPipe } from '../common/zod.pipe.js';

const erpSchema = z.object({ name: z.string().min(1), type: z.enum(['sql_generic', 'ixcsoft', 'sgp', 'hubsoft', 'ispfy', 'atlaz', 'receitanet']), mode: z.enum(['api', 'database']), config: z.record(z.unknown()).default({}), secrets: z.record(z.string()).optional(), active: z.boolean().default(true), isDefault: z.boolean().default(false) });
const whatsappSchema = z.object({ name: z.string().min(1), provider: z.enum(['meta', 'evolution', 'zapi']), config: z.record(z.unknown()).default({}), secrets: z.record(z.string()).optional(), active: z.boolean().default(true), isDefault: z.boolean().default(false) });
const speechSchema = z.object({ asrProvider: z.string().optional(), ttsProvider: z.string().optional(), nluProvider: z.string().optional(), ttsVoice: z.string().optional(), language: z.string().optional(), config: z.record(z.unknown()).optional(), secrets: z.record(z.string()).optional() });
const erpSelect = { id: true, name: true, type: true, mode: true, config: true, active: true, isDefault: true, lastTestAt: true, lastTestOk: true, lastTestMsg: true } as const;
const whatsappSelect = { id: true, name: true, provider: true, config: true, active: true, isDefault: true, lastTestAt: true, lastTestOk: true, lastTestMsg: true } as const;
const speechSelect = { asrProvider: true, ttsProvider: true, nluProvider: true, ttsVoice: true, language: true, config: true } as const;
function tenant(): string { const id = TenantContext.tenantId(); if (!id) throw new BadRequestException('Selecione uma empresa'); return id; }
function mergeSecrets(existing: string | null, incoming?: Record<string, string>): string | undefined {
  if (!incoming || Object.keys(incoming).length === 0) return undefined;
  return encryptSecrets({ ...decryptSecrets<Record<string, string>>(existing), ...incoming });
}

@Controller('erp-connections')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ErpConnectionsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list() { return this.prisma.erpConnection.findMany({ where: { tenantId: tenant() }, select: erpSelect, orderBy: { name: 'asc' } }); }

  @Get('catalog')
  catalog() {
    return [
      { type: 'sql_generic', name: 'SQL Genérico', modes: ['database'] },
      { type: 'ixcsoft', name: 'IXC Soft', modes: ['api', 'database'] },
      { type: 'sgp', name: 'SGP', modes: ['api', 'database'] },
      { type: 'hubsoft', name: 'HubSoft', modes: ['api'] },
      { type: 'ispfy', name: 'ISPFY', modes: ['api', 'database'] },
      { type: 'atlaz', name: 'Atlaz', modes: ['api', 'database'] },
      { type: 'receitanet', name: 'ReceitaNet', modes: ['api', 'database'] },
    ];
  }

  @Post()
  @Roles('superadmin', 'tenant_admin')
  async create(@Body(new ZodValidationPipe(erpSchema)) dto: z.infer<typeof erpSchema>) {
    const { secrets, ...data } = dto;
    const input = { ...data, config: data.config as Prisma.InputJsonValue };
    return this.prisma.erpConnection.create({ data: { ...input, tenantId: tenant(), secretsEnc: secrets ? encryptSecrets(secrets) : null }, select: erpSelect });
  }

  @Patch(':id')
  @Roles('superadmin', 'tenant_admin')
  async patch(@Param('id') id: string, @Body(new ZodValidationPipe(erpSchema.partial())) dto: Partial<z.infer<typeof erpSchema>>) {
    const current = await this.prisma.erpConnection.findFirstOrThrow({ where: { id, tenantId: tenant() } });
    const { secrets, config, ...data } = dto;
    const input = { ...data, ...(config !== undefined && { config: config as Prisma.InputJsonValue }) };
    const secretsEnc = mergeSecrets(current.secretsEnc, secrets);
    return this.prisma.erpConnection.update({ where: { id, tenantId: tenant() }, data: { ...input, ...(secretsEnc && { secretsEnc }) }, select: erpSelect });
  }

  @Delete(':id')
  @Roles('superadmin', 'tenant_admin')
  async remove(@Param('id') id: string) { await this.prisma.erpConnection.findFirstOrThrow({ where: { id, tenantId: tenant() }, select: { id: true } }); await this.prisma.erpConnection.delete({ where: { id, tenantId: tenant() } }); return { ok: true }; }
}

@Controller('whatsapp-connections')
@UseGuards(JwtAuthGuard, RolesGuard)
export class WhatsappConnectionsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list() { return this.prisma.whatsappConnection.findMany({ where: { tenantId: tenant() }, select: whatsappSelect, orderBy: { name: 'asc' } }); }

  @Get('catalog')
  catalog() { return [{ provider: 'meta', name: 'WhatsApp Business API (Meta)' }, { provider: 'evolution', name: 'Evolution API' }, { provider: 'zapi', name: 'Z-API' }]; }

  @Post()
  @Roles('superadmin', 'tenant_admin')
  async create(@Body(new ZodValidationPipe(whatsappSchema)) dto: z.infer<typeof whatsappSchema>) {
    const { secrets, ...data } = dto;
    const input = { ...data, config: data.config as Prisma.InputJsonValue };
    return this.prisma.whatsappConnection.create({ data: { ...input, tenantId: tenant(), secretsEnc: secrets ? encryptSecrets(secrets) : null }, select: whatsappSelect });
  }

  @Patch(':id')
  @Roles('superadmin', 'tenant_admin')
  async patch(@Param('id') id: string, @Body(new ZodValidationPipe(whatsappSchema.partial())) dto: Partial<z.infer<typeof whatsappSchema>>) {
    const current = await this.prisma.whatsappConnection.findFirstOrThrow({ where: { id, tenantId: tenant() } });
    const { secrets, config, ...data } = dto;
    const input = { ...data, ...(config !== undefined && { config: config as Prisma.InputJsonValue }) };
    const secretsEnc = mergeSecrets(current.secretsEnc, secrets);
    return this.prisma.whatsappConnection.update({ where: { id, tenantId: tenant() }, data: { ...input, ...(secretsEnc && { secretsEnc }) }, select: whatsappSelect });
  }

  @Delete(':id')
  @Roles('superadmin', 'tenant_admin')
  async remove(@Param('id') id: string) { await this.prisma.whatsappConnection.findFirstOrThrow({ where: { id, tenantId: tenant() }, select: { id: true } }); await this.prisma.whatsappConnection.delete({ where: { id, tenantId: tenant() } }); return { ok: true }; }
}

@Controller('speech-config')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SpeechConfigController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async get() { return this.prisma.speechConfig.findUnique({ where: { tenantId: tenant() }, select: speechSelect }); }

  @Put()
  @Roles('superadmin', 'tenant_admin')
  async put(@Body(new ZodValidationPipe(speechSchema)) dto: z.infer<typeof speechSchema>) {
    const tenantId = tenant();
    const current = await this.prisma.speechConfig.findUnique({ where: { tenantId } });
    const { secrets, config, ...data } = dto;
    const input = { ...data, ...(config !== undefined && { config: config as Prisma.InputJsonValue }) };
    const secretsEnc = mergeSecrets(current?.secretsEnc ?? null, secrets);
    return this.prisma.speechConfig.upsert({ where: { tenantId }, create: { ...input, tenantId, ...(secretsEnc && { secretsEnc }) }, update: { ...input, ...(secretsEnc && { secretsEnc }) }, select: speechSelect });
  }
}
