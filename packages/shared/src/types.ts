import type { CallDirection, CallStatus, Intent } from './enums.js';

/** Cliente normalizado retornado pelos conectores ERP. */
export interface ErpCustomer {
  id: string;
  name: string;
  document: string; // CPF/CNPJ somente digitos
  phone?: string;
  mobile?: string;
  email?: string;
  address?: string;
  status?: 'active' | 'blocked' | 'suspended' | 'cancelled' | 'unknown';
  contracts?: Array<{ id: string; plan?: string; status?: string }>;
  raw?: Record<string, unknown>;
}

export interface ErpInvoice {
  id: string;
  customerId: string;
  dueDate: string; // ISO date
  amount: number;
  status: 'open' | 'paid' | 'overdue' | 'cancelled';
  digitableLine?: string;
  barcode?: string;
  pixCode?: string;
  pdfUrl?: string;
  raw?: Record<string, unknown>;
}

export interface ErpDocument {
  filename: string;
  mimeType: string;
  /** conteudo em base64 ou URL publica */
  base64?: string;
  url?: string;
}

export interface ErpNewCustomer {
  name: string;
  document: string;
  phone: string;
  email?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  notes?: string;
}

export interface ErpConnectionStatus {
  customerId: string;
  contractId?: string;
  online: boolean;
  blocked: boolean;
  blockReason?: string;
  ip?: string;
  lastSeen?: string;
}

export interface WhatsappSendResult {
  providerMessageId?: string;
  status: 'queued' | 'sent' | 'failed';
  error?: string;
}

export interface NluResult {
  intent: Intent;
  confidence: number;
  entities: Record<string, string>;
}

export interface CallSummary {
  id: string;
  tenantId: string;
  direction: CallDirection;
  status: CallStatus;
  callerId: string;
  did?: string;
  startedAt: string;
  answeredAt?: string;
  endedAt?: string;
  durationSec?: number;
  queueName?: string;
  agentExtension?: string;
  recordingPath?: string;
  customerName?: string;
  customerDocument?: string;
}

/** Eventos em tempo real publicados no Redis e repassados via Socket.IO */
export type RealtimeEvent =
  | { type: 'call.started'; tenantId: string; call: CallSummary }
  | { type: 'call.updated'; tenantId: string; call: CallSummary }
  | { type: 'call.ended'; tenantId: string; call: CallSummary }
  | { type: 'queue.updated'; tenantId: string; queue: QueueSnapshot }
  | { type: 'endpoint.status'; tenantId: string; endpoint: string; status: string }
  | { type: 'trunk.status'; tenantId: string; trunk: string; status: string };

export interface QueueSnapshot {
  name: string;
  waiting: number;
  longestWaitSec: number;
  members: Array<{ extension: string; name?: string; status: string; paused: boolean; callsTaken: number }>;
  completed: number;
  abandoned: number;
}

export const REDIS_CHANNEL_EVENTS = 'ura:events';
export const REDIS_CHANNEL_ASTERISK_RELOAD = 'ura:asterisk:reload';

/** Nome do endpoint PJSIP de um ramal (isolamento por tenant). */
export function endpointName(tenantSlug: string, extension: string): string {
  return `t${tenantSlug}-${extension}`;
}
/** Slug simples: minusculas sem caracteres nao alfanumericos. */
export function slugifyName(value: string): string {
  return (value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** Nome da fila no Asterisk (prefixada por tenant para isolamento) */
export function queueAsteriskName(tenantSlug: string, queue: string): string {
  return `t${slugifyName(tenantSlug)}-${slugifyName(queue)}`;
}
/** Contexto do dialplan para chamadas internas de um tenant */
export function tenantContext(tenantSlug: string): string {
  return `tenant-${tenantSlug}`;
}
/** Contexto de entrada de um tronco */
export function trunkContext(tenantSlug: string, trunkName: string): string {
  return `tenant-${tenantSlug}-in-${trunkName}`;
}
/** Nome do endpoint PJSIP de um tronco */
export function trunkEndpointName(tenantSlug: string, trunkName: string): string {
  return `t${tenantSlug}-trk-${trunkName}`;
}

export function onlyDigits(v: string): string {
  return (v || '').replace(/\D+/g, '');
}

export function isValidCpf(cpf: string): boolean {
  const d = onlyDigits(cpf);
  if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false;
  const calc = (len: number) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(d[i]) * (len + 1 - i);
    const r = (sum * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return calc(9) === Number(d[9]) && calc(10) === Number(d[10]);
}

export function isValidCnpj(cnpj: string): boolean {
  const d = onlyDigits(cnpj);
  if (d.length !== 14 || /^(\d)\1+$/.test(d)) return false;
  const calc = (len: number) => {
    const weights = len === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(d[i]) * weights[i];
    const r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return calc(12) === Number(d[12]) && calc(13) === Number(d[13]);
}

export function isValidCpfCnpj(v: string): boolean {
  const d = onlyDigits(v);
  return d.length === 11 ? isValidCpf(d) : d.length === 14 ? isValidCnpj(d) : false;
}

/** Normaliza telefone BR para E.164 (55DDDNUMERO). */
export function normalizePhoneBR(v: string): string {
  let d = onlyDigits(v);
  if (d.startsWith('0')) d = d.replace(/^0+/, '');
  if (d.length === 10 || d.length === 11) d = `55${d}`;
  return d;
}
