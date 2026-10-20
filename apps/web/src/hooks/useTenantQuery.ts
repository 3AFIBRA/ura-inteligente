import { useQuery, useQueryClient, type QueryKey, type UseQueryOptions } from '@tanstack/react-query';
import { useCallback } from 'react';
import { selectEffectiveTenantId, useAuthStore } from '../store/auth';

/** Tenant efetivo atual (reativo). */
export function useEffectiveTenantId(): string | null {
  return useAuthStore(selectEffectiveTenantId);
}

/** Prefixa a chave de query com o tenant efetivo para isolar cache por tenant. */
export function useTenantKey(key: QueryKey): QueryKey {
  const tenantId = useEffectiveTenantId();
  return ['tenant', tenantId ?? 'none', ...key];
}

/**
 * useQuery com chave prefixada por tenant. Ao trocar o tenant, as consultas
 * sao refeitas automaticamente porque a chave muda.
 */
export function useTenantQuery<TData = unknown, TError = Error>(
  key: QueryKey,
  queryFn: () => Promise<TData>,
  options?: Omit<UseQueryOptions<TData, TError, TData, QueryKey>, 'queryKey' | 'queryFn'>,
) {
  const tenantKey = useTenantKey(key);
  const tenantId = useEffectiveTenantId();
  const user = useAuthStore((s) => s.user);
  const needsTenant = user?.role === 'superadmin';
  return useQuery<TData, TError, TData, QueryKey>({
    queryKey: tenantKey,
    queryFn,
    ...options,
    enabled: (options?.enabled ?? true) && (!needsTenant || !!tenantId),
  });
}

/** Invalidador de queries do tenant atual. */
export function useInvalidateTenant() {
  const qc = useQueryClient();
  const tenantId = useEffectiveTenantId();
  return useCallback(
    (key?: QueryKey) => {
      if (key) return qc.invalidateQueries({ queryKey: ['tenant', tenantId ?? 'none', ...key] });
      return qc.invalidateQueries({ queryKey: ['tenant', tenantId ?? 'none'] });
    },
    [qc, tenantId],
  );
}
