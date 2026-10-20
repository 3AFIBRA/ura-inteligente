import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { TenantContext } from './tenant-context.js';

/**
 * PrismaService with multi-tenant support.
 *
 * `forTenant(tenantId)` returns an extended client where every operation runs
 * inside a transaction that first executes `SET LOCAL app.tenant_id = '<id>'`
 * (via set_config with is_local=true), enabling the PostgreSQL Row Level
 * Security policies created in migration 0002_rls.
 *
 * `db` returns the client scoped to the tenant of the current request context
 * (AsyncLocalStorage) or the unscoped client for superadmin without tenant.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);
  private readonly tenantClients = new Map<string, PrismaClient>();

  constructor() {
    super({ log: process.env.PRISMA_LOG === 'true' ? ['query', 'warn', 'error'] : ['warn', 'error'] });
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.$connect();
    } catch (err) {
      this.logger.error(`Falha ao conectar no banco: ${(err as Error).message}`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  /** Client scoped to the given tenant (RLS via SET LOCAL app.tenant_id). */
  forTenant(tenantId: string): PrismaClient {
    const cached = this.tenantClients.get(tenantId);
    if (cached) return cached;
    const base = this;
    const extended = this.$extends({
      name: `tenant:${tenantId}`,
      query: {
        $allModels: {
          async $allOperations({ args, query }) {
            const [, result] = await base.$transaction([
              base.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, TRUE)`,
              query(args),
            ]);
            return result;
          },
        },
      },
    }) as unknown as PrismaClient;
    this.tenantClients.set(tenantId, extended);
    return extended;
  }

  /** Client for the tenant in the current request context (or unscoped). */
  get db(): PrismaClient {
    const tenantId = TenantContext.tenantId();
    return tenantId ? this.forTenant(tenantId) : this;
  }

  async ping(): Promise<boolean> {
    try {
      await this.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }
}
