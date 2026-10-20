import { Controller, Get, Post, Put, Body, UseGuards, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { Roles } from '../common/decorators.js';
import { TenantContext } from '../prisma/tenant-context.js';
import type { ErpMode, ErpType } from '@ura/shared';

@Controller('erp-connections')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ErpConnectionsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list() {
    const tenantId = TenantContext.tenantId();
    return this.prisma.erpConnection.findMany({ where: tenantId ? { tenantId } : {} });
  }

  @Get('catalog')
  catalog() {
    return [
      { type: 'sql_generic', name: 'SQL Generico', modes: ['database'], configFields: [], secretFields: [], capabilities: ['find_customer', 'list_open_invoices', 'create_customer'] },
      { type: 'ixcsoft', name: 'IXC Soft', modes: ['api', 'database'], configFields: [], secretFields: [], capabilities: ['find_customer', 'list_open_invoices', 'get_invoice_pdf', 'create_customer', 'get_connection_status', 'unlock_connection'] },
      { type: 'sgp', name: 'SGP', modes: ['api', 'database'], configFields: [], secretFields: [], capabilities: ['find_customer', 'list_open_invoices', 'get_invoice_pdf'] },
      { type: 'hubsoft', name: 'HubSoft', modes: ['api'], configFields: [], secretFields: [], capabilities: ['find_customer', 'list_open_invoices', 'get_invoice_pdf', 'create_customer', 'get_connection_status', 'unlock_connection'] },
      { type: 'ispfy', name: 'ISPFY', modes: ['api', 'database'], configFields: [], secretFields: [], capabilities: ['find_customer', 'list_open_invoices'] },
      { type: 'atlaz', name: 'Atlaz', modes: ['api', 'database'], configFields: [], secretFields: [], capabilities: ['find_customer', 'list_open_invoices'] },
      { type: 'receitanet', name: 'ReceitaNet', modes: ['api', 'database'], configFields: [], secretFields: [], capabilities: ['find_customer', 'list_open_invoices'] },
    ];
  }
}

@Controller('whatsapp-connections')
@UseGuards(JwtAuthGuard, RolesGuard)
export class WhatsappConnectionsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list() {
    const tenantId = TenantContext.tenantId();
    return this.prisma.whatsappConnection.findMany({ where: tenantId ? { tenantId } : {} });
  }

  @Get('catalog')
  catalog() {
    return [
      { provider: 'meta', name: 'WhatsApp Business API (Meta)', configFields: [], secretFields: [] },
      { provider: 'evolution', name: 'Evolution API', configFields: [], secretFields: [] },
      { provider: 'zapi', name: 'Z-API', configFields: [], secretFields: [] },
    ];
  }
}

@Controller('speech-config')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SpeechConfigController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async get() {
    const tenantId = TenantContext.tenantId();
    if (!tenantId) throw new BadRequestException('Tenant obrigatorio');
    return this.prisma.speechConfig.findUnique({ where: { tenantId } });
  }

  @Put()
  async put(@Body() dto: Record<string, unknown>) {
    const tenantId = TenantContext.tenantId();
    if (!tenantId) throw new BadRequestException('Tenant obrigatorio');
    return this.prisma.speechConfig.upsert({ where: { tenantId }, create: { ...dto, tenantId } as any, update: dto as any });
  }
}
