import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Tenant, Trunk } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { AmiService } from './ami.service.js';
import { env } from '../config/env.js';

export type TrunkStatus = {
  id: string;
  name: string;
  status: 'registered' | 'unregistered' | 'rejected' | 'unreachable' | 'inactive' | 'unknown';
  registered: boolean;
  detail: string;
};

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** Nome do endpoint PJSIP de um tronco (usado no Asterisk). */
export function trunkEndpointName(tenantSlug: string, trunk: Pick<Trunk, 'name'>): string {
  return `t${slugify(tenantSlug)}-${trunk.name}`;
}

function esc(value: string): string {
  // remove quebras de linha para não quebrar o arquivo .conf
  return value.replace(/[\r\n]/g, '');
}

@Injectable()
export class AsteriskConfigService implements OnModuleInit {
  private readonly logger = new Logger(AsteriskConfigService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ami: AmiService,
  ) {}

  /** Ao subir a API, regenera a configuração de todos os tenants (idempotente). */
  async onModuleInit() {
    void this.applyAll().catch((err) => this.logger.warn(`Falha ao aplicar configuração inicial: ${String(err)}`));
  }

  // ============ Geração de configuração ============

  private renderPjsip(tenant: Tenant, trunks: Trunk[]): string {
    const slug = slugify(tenant.slug);
    const blocks: string[] = [
      `; Gerado automaticamente pela API — não edite manualmente.`,
      `; Tenant: ${tenant.name} (${tenant.slug})`,
    ];
    const active = trunks.filter((t) => t.active);
    for (const trunk of active) {
      const ep = trunkEndpointName(slug, trunk);
      const host = esc(trunk.host);
      const port = trunk.port || 5060;
      const transport = ['udp', 'tcp', 'tls'].includes(trunk.transport) ? trunk.transport : 'udp';
      blocks.push(``, `;; Tronco: ${trunk.name} (${host}:${port}, auth=${trunk.authMode})`);

      // Endpoint
      blocks.push(
        `[${ep}](tpl-trunk-endpoint)`,
        `transport = transport-${transport}`,
        `context = from-${slug}`,
        `disallow = all`,
        `allow = ${(trunk.codecs.length ? trunk.codecs : ['ulaw', 'alaw']).join(',')}`,
        `aors = ${ep}`,
      );
      if (trunk.authMode === 'register' && trunk.username) blocks.push(`outbound_auth = ${ep}-auth`);
      if (trunk.fromUser) blocks.push(`from_user = ${esc(trunk.fromUser)}`);
      if (trunk.fromDomain) blocks.push(`from_domain = ${esc(trunk.fromDomain)}`);
      if (trunk.outboundCallerId) blocks.push(`callerid = ${esc(trunk.outboundCallerId)}`);

      // Auth (register)
      if (trunk.authMode === 'register' && trunk.username) {
        blocks.push(
          ``,
          `[${ep}-auth](tpl-auth)`,
          `username = ${esc(trunk.username)}`,
          `password = ${esc(trunk.password ?? '')}`,
        );
        // Registro de saída
        blocks.push(
          ``,
          `[${ep}-reg]`,
          `type = registration`,
          `transport = transport-${transport}`,
          `outbound_auth = ${ep}-auth`,
          `server_uri = sip:${host}:${port}`,
          `client_uri = sip:${esc(trunk.username)}@${host}:${port}`,
          `retry_interval = 60`,
          `max_retries = 20`,
          `forbidden_retry_interval = 300`,
          `fatal_retry_interval = 5`,
          `expiration = 3600`,
        );
      }

      // AOR
      blocks.push(
        ``,
        `[${ep}](tpl-aor)`,
        `max_contacts = 1`,
        `remove_existing = yes`,
        `qualify_frequency = ${trunk.qualify ? 60 : 0}`,
      );
      if (trunk.authMode === 'ip') blocks.push(`contact = sip:${host}:${port}`);

      // Identify: mapeia IPs de origem para o endpoint (entrada de chamadas)
      const matches = [host, ...trunk.allowedIps].map(esc).filter(Boolean);
      blocks.push(
        ``,
        `[${ep}-identify]`,
        `type = identify`,
        `endpoint = ${ep}`,
        `match = ${matches.join(',')}`,
      );
    }
    if (active.length === 0) blocks.push(``, `; Nenhum tronco ativo neste tenant.`);
    return blocks.join('\n') + '\n';
  }

  private renderDialplan(tenant: Tenant, trunks: Trunk[]): string {
    const slug = slugify(tenant.slug);
    const firstTrunk = trunks.find((t) => t.active);
    const lines: string[] = [
      `; Gerado automaticamente pela API — não edite manualmente.`,
      `; Tenant: ${tenant.name} (${tenant.slug})`,
      ``,
      `; Entrada de chamadas dos troncos -> URA (Stasis via sub-ura)`,
      `[from-${slug}]`,
      `exten => _X.,1,NoOp(Entrada tenant=${tenant.id} did=\${EXTEN} de=\${CALLERID(num)})`,
      ` same => n,Gosub(sub-ura,s,1(${tenant.id},\${EXTEN}))`,
      ` same => n,Hangup()`,
      ``,
      `; Saída pelo primeiro tronco ativo`,
      `[to-${slug}]`,
      `exten => _[0-9*#+].,1,NoOp(Saida tenant=${tenant.id} para \${EXTEN})`,
    ];
    if (firstTrunk) {
      const ep = trunkEndpointName(slug, firstTrunk);
      lines.push(` same => n,Dial(PJSIP/\${EXTEN}@${ep},60)`);
    } else {
      lines.push(` same => n,Playback(im-sorry)`);
    }
    lines.push(` same => n,Hangup()`);
    return lines.join('\n') + '\n';
  }

  /** Reescreve os arquivos agregadores com um include por tenant. */
  private async refreshAggregates(): Promise<void> {
    const dir = env.asteriskConfigDir;
    const tenants = await this.prisma.tenant.findMany({ select: { id: true }, orderBy: { slug: 'asc' } });
    await writeFile(
      join(dir, 'pjsip-all.conf'),
      tenants.map((t) => `#include pjsip-${t.id}.conf`).join('\n') + '\n',
    );
    await writeFile(
      join(dir, 'extensions-all.conf'),
      tenants.map((t) => `#include extensions-${t.id}.conf`).join('\n') + '\n',
    );
  }

  /** Gera (ou regenera) a configuração de um tenant e recarrega o Asterisk. */
  async applyTenant(tenantId: string, opts: { reload?: boolean } = {}): Promise<void> {
    const tenant = await this.prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
    const trunks = await this.prisma.trunk.findMany({ where: { tenantId } });
    const dir = env.asteriskConfigDir;
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, `pjsip-${tenantId}.conf`), this.renderPjsip(tenant, trunks));
    await writeFile(join(dir, `extensions-${tenantId}.conf`), this.renderDialplan(tenant, trunks));
    await this.refreshAggregates();
    if (opts.reload !== false) await this.reload();
    this.logger.log(`Configuração do tenant ${tenant.slug} aplicada (${trunks.length} tronco(s))`);
  }

  async applyAll(): Promise<void> {
    const tenants = await this.prisma.tenant.findMany({ select: { id: true } });
    for (const tenant of tenants) {
      await this.applyTenant(tenant.id, { reload: false });
    }
    await this.reload();
  }

  private async reload(): Promise<void> {
    try {
      await this.ami.reloadPjsip();
      await this.ami.reloadDialplan();
    } catch (err) {
      this.logger.warn(`Config gravada, mas o reload via AMI falhou: ${String(err)}`);
    }
  }

  // ============ Status dos troncos ============

  async trunksStatus(tenant: Tenant, trunks: Trunk[]): Promise<TrunkStatus[]> {
    const slug = slugify(tenant.slug);
    let registrations = new Map<string, string>();
    let amiError = '';
    try {
      registrations = await this.ami.outboundRegistrations();
    } catch (err) {
      amiError = String(err);
    }

    const result: TrunkStatus[] = [];
    for (const trunk of trunks) {
      const ep = trunkEndpointName(slug, trunk);
      if (!trunk.active) {
        result.push({ id: trunk.id, name: trunk.name, status: 'inactive', registered: false, detail: 'Tronco inativo' });
        continue;
      }
      if (amiError) {
        result.push({ id: trunk.id, name: trunk.name, status: 'unknown', registered: false, detail: 'AMI indisponível' });
        continue;
      }
      try {
        if (trunk.authMode === 'register') {
          const status = registrations.get(`${ep}-reg`) ?? '';
          const normalized = status.toLowerCase();
          const mapped = normalized.includes('registered') && !normalized.includes('unregistered')
            ? 'registered'
            : normalized.includes('rejected')
              ? 'rejected'
              : 'unregistered';
          result.push({ id: trunk.id, name: trunk.name, status: mapped, registered: mapped === 'registered', detail: status || 'Sem registro' });
        } else {
          const contacts = await this.ami.endpointContactStatuses(ep);
          const avail = contacts.some((c) => c.toLowerCase() === 'avail');
          result.push({ id: trunk.id, name: trunk.name, status: avail ? 'registered' : 'unreachable', registered: avail, detail: contacts.join(', ') || 'Sem contato' });
        }
      } catch (err) {
        result.push({ id: trunk.id, name: trunk.name, status: 'unknown', registered: false, detail: String(err) });
      }
    }

    // Persiste o último status conhecido
    await this.prisma.$transaction(
      result
        .filter((r) => r.status !== 'unknown')
        .map((r) =>
          this.prisma.trunk.update({
            where: { id: r.id },
            data: { lastStatus: r.status, lastStatusAt: new Date() },
          }),
        ),
    ).catch(() => undefined);

    return result;
  }
}
