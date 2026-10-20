import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { CallSummary, QueueSnapshot, RealtimeEvent } from '@ura/shared';
import { ensureSocket, onRealtime, onSocketStatus } from '../lib/socket';
import { useAuthStore } from '../store/auth';
import { useEffectiveTenantId } from './useTenantQuery';
import type { ExtensionStatus } from '../types/api';

/**
 * Mantem o socket vivo enquanto autenticado e aplica eventos realtime ao
 * cache do TanStack Query (chamadas ativas, filas, status de ramais/troncos).
 * Deve ser montado uma vez no layout.
 */
export function useRealtimeSync(): { connected: boolean } {
  const qc = useQueryClient();
  const token = useAuthStore((s) => s.accessToken);
  const tenantId = useEffectiveTenantId();
  const [connected, setConnected] = useState(false);
  const tenantRef = useRef(tenantId);
  tenantRef.current = tenantId;

  useEffect(() => {
    if (!token) return;
    ensureSocket();
    const offStatus = onSocketStatus(setConnected);
    const off = onRealtime((ev) => {
      const tKey = ['tenant', tenantRef.current ?? 'none'];
      switch (ev.type) {
        case 'call.started':
        case 'call.updated':
        case 'call.ended': {
          qc.setQueryData<CallSummary[]>([...tKey, 'calls', 'active'], (prev) => {
            const list = prev ?? [];
            if (ev.type === 'call.ended') return list.filter((c) => c.id !== ev.call.id);
            const idx = list.findIndex((c) => c.id === ev.call.id);
            if (idx === -1) return [ev.call, ...list];
            const next = [...list];
            next[idx] = { ...next[idx], ...ev.call };
            return next;
          });
          if (ev.type === 'call.ended') {
            void qc.invalidateQueries({ queryKey: [...tKey, 'calls', 'list'] });
            void qc.invalidateQueries({ queryKey: [...tKey, 'reports'] });
          }
          break;
        }
        case 'queue.updated': {
          qc.setQueryData<QueueSnapshot[]>([...tKey, 'queues', 'status'], (prev) => {
            const list = prev ?? [];
            const idx = list.findIndex((q) => q.name === ev.queue.name);
            if (idx === -1) return [...list, ev.queue];
            const next = [...list];
            next[idx] = ev.queue;
            return next;
          });
          break;
        }
        case 'endpoint.status': {
          qc.setQueryData<ExtensionStatus[]>([...tKey, 'extensions', 'status'], (prev) => {
            if (!prev) return prev;
            // endpoint pode vir como "t<slug>-<number>" ou apenas o numero
            const number = ev.endpoint.includes('-') ? ev.endpoint.split('-').pop() ?? ev.endpoint : ev.endpoint;
            return prev.map((e) =>
              e.number === number || e.id === ev.endpoint ? { ...e, status: ev.status as ExtensionStatus['status'] } : e,
            );
          });
          break;
        }
        case 'trunk.status': {
          void qc.invalidateQueries({ queryKey: [...tKey, 'trunks', 'status'] });
          break;
        }
      }
    });
    return () => {
      off();
      offStatus();
    };
  }, [qc, token]);

  return { connected };
}

/** Assina eventos realtime brutos (para componentes que precisam reagir diretamente). */
export function useRealtimeEvent(handler: (ev: RealtimeEvent) => void): void {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => onRealtime((ev) => ref.current(ev)), []);
}
