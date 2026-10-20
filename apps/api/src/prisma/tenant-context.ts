import { AsyncLocalStorage } from 'node:async_hooks';
import type { Role } from '@ura/shared';

export interface RequestContext {
  /** Tenant currently in scope (null for superadmin without X-Tenant-Id). */
  tenantId: string | null;
  userId: string | null;
  role: Role | null;
  ip?: string;
}

const storage = new AsyncLocalStorage<RequestContext>();

export const TenantContext = {
  run<T>(ctx: RequestContext, fn: () => T): T {
    return storage.run(ctx, fn);
  },
  get(): RequestContext | undefined {
    return storage.getStore();
  },
  tenantId(): string | null {
    return storage.getStore()?.tenantId ?? null;
  },
  set(partial: Partial<RequestContext>): void {
    const store = storage.getStore();
    if (store) Object.assign(store, partial);
  },
};
