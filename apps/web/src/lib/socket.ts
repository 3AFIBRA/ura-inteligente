import { io, type Socket } from 'socket.io-client';
import type { RealtimeEvent } from '@ura/shared';
import { selectEffectiveTenantId, useAuthStore } from '../store/auth';

type Listener = (ev: RealtimeEvent) => void;

let socket: Socket | null = null;
let currentKey = '';
const listeners = new Set<Listener>();
const statusListeners = new Set<(connected: boolean) => void>();

function key(token: string | null, tenantId: string | null): string {
  return `${token ?? ''}|${tenantId ?? ''}`;
}

/** Garante um socket conectado com o token/tenant atuais; reconecta ao trocar. */
export function ensureSocket(): Socket | null {
  const state = useAuthStore.getState();
  const token = state.accessToken;
  const tenantId = selectEffectiveTenantId(state);
  if (!token) {
    disconnectSocket();
    return null;
  }
  const k = key(token, tenantId);
  if (socket && currentKey === k) return socket;
  disconnectSocket();
  currentKey = k;
  socket = io('/', {
    path: '/socket.io',
    transports: ['websocket', 'polling'],
    auth: tenantId ? { token, tenantId } : { token },
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10000,
  });
  socket.on('connect', () => {
    if (tenantId && state.user?.role === 'superadmin') {
      socket?.emit('subscribe', { tenantId });
    }
    statusListeners.forEach((l) => l(true));
  });
  socket.on('disconnect', () => statusListeners.forEach((l) => l(false)));
  socket.on('event', (payload: RealtimeEvent) => {
    listeners.forEach((l) => {
      try {
        l(payload);
      } catch (e) {
        console.error('realtime listener error', e);
      }
    });
  });
  return socket;
}

export function disconnectSocket(): void {
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
    currentKey = '';
    statusListeners.forEach((l) => l(false));
  }
}

export function onRealtime(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function onSocketStatus(listener: (connected: boolean) => void): () => void {
  statusListeners.add(listener);
  listener(socket?.connected ?? false);
  return () => statusListeners.delete(listener);
}

export function isSocketConnected(): boolean {
  return socket?.connected ?? false;
}

// Reconecta automaticamente quando token/tenant mudarem.
useAuthStore.subscribe((s, prev) => {
  const changed = s.accessToken !== prev.accessToken || selectEffectiveTenantId(s) !== selectEffectiveTenantId(prev);
  if (changed) {
    if (s.accessToken) ensureSocket();
    else disconnectSocket();
  }
});
