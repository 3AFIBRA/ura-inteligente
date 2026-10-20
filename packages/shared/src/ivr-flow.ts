import { z } from 'zod';
import { INTENTS } from './enums.js';

/**
 * Esquema do fluxo de URA. O fluxo e um grafo de nos; cada no aponta para
 * o proximo via `next` ou por saidas nomeadas (ex.: opcoes de menu, intents).
 * Variaveis sao interpoladas com {{nome}} nas mensagens.
 */

export const promptSchema = z.object({
  /** Texto para TTS (interpolavel). */
  text: z.string().optional(),
  /** Arquivo de audio (sem extensao) em sounds/custom/tenant-<id>/ */
  audio: z.string().optional(),
});
export type Prompt = z.infer<typeof promptSchema>;

const baseNode = z.object({
  id: z.string().min(1),
  label: z.string().optional(),
  position: z.object({ x: z.number(), y: z.number() }).optional(),
});

export const startNode = baseNode.extend({
  type: z.literal('start'),
  next: z.string(),
});

export const playbackNode = baseNode.extend({
  type: z.literal('playback'),
  prompt: promptSchema,
  next: z.string().optional(),
});

export const menuNode = baseNode.extend({
  type: z.literal('menu'),
  prompt: promptSchema,
  /** mapa digito -> id do proximo no */
  options: z.record(z.string().regex(/^[0-9*#]$/), z.string()),
  timeoutSec: z.number().int().min(1).max(30).default(5),
  retries: z.number().int().min(0).max(5).default(2),
  invalidPrompt: promptSchema.optional(),
  /** destino se esgotar tentativas */
  fallback: z.string().optional(),
  /** permitir fala livre em paralelo ao DTMF (ASR) */
  allowSpeech: z.boolean().default(true),
  /** intents -> no (quando allowSpeech) */
  intents: z.record(z.enum(INTENTS), z.string()).optional(),
});

export const collectDigitsNode = baseNode.extend({
  type: z.literal('collect_digits'),
  prompt: promptSchema,
  variable: z.string().min(1),
  minDigits: z.number().int().min(1).default(1),
  maxDigits: z.number().int().min(1).max(32).default(20),
  terminator: z.string().default('#'),
  timeoutSec: z.number().int().min(1).max(60).default(10),
  retries: z.number().int().min(0).max(5).default(2),
  /** validar como cpf_cnpj, phone, numeric */
  validate: z.enum(['none', 'cpf_cnpj', 'phone', 'numeric']).default('none'),
  invalidPrompt: promptSchema.optional(),
  allowSpeech: z.boolean().default(true),
  next: z.string(),
  fallback: z.string().optional(),
});

export const askNode = baseNode.extend({
  type: z.literal('ask'),
  prompt: promptSchema,
  /** variavel que recebe a transcricao */
  variable: z.string().min(1),
  /** entidade a extrair pela NLU (opcional) */
  entity: z.enum(['cpf_cnpj', 'phone', 'name', 'address', 'email', 'date', 'free_text']).default('free_text'),
  /** se definido, roteia por intent detectada */
  intents: z.record(z.enum(INTENTS), z.string()).optional(),
  maxSilenceSec: z.number().int().min(1).max(10).default(2),
  maxDurationSec: z.number().int().min(2).max(60).default(15),
  retries: z.number().int().min(0).max(5).default(2),
  noInputPrompt: promptSchema.optional(),
  next: z.string().optional(),
  fallback: z.string().optional(),
});

export const erpActionNode = baseNode.extend({
  type: z.literal('erp_action'),
  action: z.enum([
    'find_customer',
    'list_open_invoices',
    'get_invoice_pdf',
    'get_invoice_line',
    'create_customer',
    'get_connection_status',
    'unlock_connection',
    'open_ticket',
  ]),
  /** parametros interpolaveis */
  params: z.record(z.string()).default({}),
  /** variavel de saida */
  output: z.string().min(1),
  onSuccess: z.string(),
  onNotFound: z.string().optional(),
  onError: z.string().optional(),
});

export const whatsappSendNode = baseNode.extend({
  type: z.literal('whatsapp_send'),
  to: z.string().min(1),
  message: z.string().optional(),
  /** variavel contendo { url | base64, filename } */
  documentVar: z.string().optional(),
  templateName: z.string().optional(),
  templateParams: z.array(z.string()).optional(),
  onSuccess: z.string(),
  onError: z.string().optional(),
});

export const conditionNode = baseNode.extend({
  type: z.literal('condition'),
  /** expressao simples: var op valor  (op: == != > < >= <= contains exists) */
  rules: z
    .array(
      z.object({
        variable: z.string(),
        op: z.enum(['==', '!=', '>', '<', '>=', '<=', 'contains', 'exists', 'empty']),
        value: z.string().optional(),
        next: z.string(),
      }),
    )
    .min(1),
  else: z.string(),
});

export const setVariableNode = baseNode.extend({
  type: z.literal('set_variable'),
  assignments: z.record(z.string()),
  next: z.string(),
});

export const transferNode = baseNode.extend({
  type: z.literal('transfer'),
  /** ramal interno ou numero externo */
  destination: z.string().min(1),
  timeoutSec: z.number().int().min(5).max(120).default(30),
  announcement: promptSchema.optional(),
  onBusy: z.string().optional(),
  onNoAnswer: z.string().optional(),
});

export const queueNode = baseNode.extend({
  type: z.literal('queue'),
  queueName: z.string().min(1),
  announcement: promptSchema.optional(),
  /** segundos maximos em espera; 0 = sem limite */
  maxWaitSec: z.number().int().min(0).default(0),
  onTimeout: z.string().optional(),
});

export const scheduleNode = baseNode.extend({
  type: z.literal('schedule'),
  timezone: z.string().default('America/Sao_Paulo'),
  /** lista de janelas: dias 0-6 (dom-sab), hh:mm-hh:mm */
  windows: z
    .array(
      z.object({
        days: z.array(z.number().int().min(0).max(6)).min(1),
        start: z.string().regex(/^\d{2}:\d{2}$/),
        end: z.string().regex(/^\d{2}:\d{2}$/),
      }),
    )
    .min(1),
  open: z.string(),
  closed: z.string(),
});

export const voicemailNode = baseNode.extend({
  type: z.literal('voicemail'),
  prompt: promptSchema.optional(),
  maxDurationSec: z.number().int().min(10).max(600).default(120),
  notifyEmail: z.string().email().optional(),
  next: z.string().optional(),
});

export const hangupNode = baseNode.extend({
  type: z.literal('hangup'),
  prompt: promptSchema.optional(),
});

export const flowNodeSchema = z.discriminatedUnion('type', [
  startNode,
  playbackNode,
  menuNode,
  collectDigitsNode,
  askNode,
  erpActionNode,
  whatsappSendNode,
  conditionNode,
  setVariableNode,
  transferNode,
  queueNode,
  scheduleNode,
  voicemailNode,
  hangupNode,
]);
export type FlowNode = z.infer<typeof flowNodeSchema>;
export type FlowNodeType = FlowNode['type'];

export const ivrFlowDefinitionSchema = z
  .object({
    version: z.literal(1).default(1),
    language: z.enum(['pt-BR', 'en', 'es']).default('pt-BR'),
    voice: z.string().optional(),
    nodes: z.array(flowNodeSchema).min(2),
  })
  .superRefine((flow, ctx) => {
    const ids = new Set<string>();
    for (const n of flow.nodes) {
      if (ids.has(n.id)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `No duplicado: ${n.id}` });
      }
      ids.add(n.id);
    }
    const starts = flow.nodes.filter((n) => n.type === 'start');
    if (starts.length !== 1) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'O fluxo deve ter exatamente um no "start"' });
    }
    for (const n of flow.nodes) {
      for (const target of collectTargets(n)) {
        if (!ids.has(target)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `No "${n.id}" aponta para destino inexistente "${target}"`,
          });
        }
      }
    }
  });
export type IvrFlowDefinition = z.infer<typeof ivrFlowDefinitionSchema>;

/** Retorna todos os ids de destino referenciados por um no. */
export function collectTargets(node: FlowNode): string[] {
  const out: string[] = [];
  const push = (v?: string) => {
    if (v) out.push(v);
  };
  switch (node.type) {
    case 'start':
      push(node.next);
      break;
    case 'playback':
      push(node.next);
      break;
    case 'menu':
      Object.values(node.options).forEach(push);
      Object.values(node.intents ?? {}).forEach(push);
      push(node.fallback);
      break;
    case 'collect_digits':
      push(node.next);
      push(node.fallback);
      break;
    case 'ask':
      Object.values(node.intents ?? {}).forEach(push);
      push(node.next);
      push(node.fallback);
      break;
    case 'erp_action':
      push(node.onSuccess);
      push(node.onNotFound);
      push(node.onError);
      break;
    case 'whatsapp_send':
      push(node.onSuccess);
      push(node.onError);
      break;
    case 'condition':
      node.rules.forEach((r) => push(r.next));
      push(node.else);
      break;
    case 'set_variable':
      push(node.next);
      break;
    case 'transfer':
      push(node.onBusy);
      push(node.onNoAnswer);
      break;
    case 'queue':
      push(node.onTimeout);
      break;
    case 'schedule':
      push(node.open);
      push(node.closed);
      break;
    case 'voicemail':
      push(node.next);
      break;
    case 'hangup':
      break;
  }
  return out;
}

/** Interpola {{var}} e {{obj.campo}} usando o contexto. */
export function interpolate(template: string, vars: Record<string, unknown>): string {
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, path: string) => {
    const value = path.split('.').reduce<unknown>((acc, key) => {
      if (acc && typeof acc === 'object' && key in (acc as Record<string, unknown>)) {
        return (acc as Record<string, unknown>)[key];
      }
      return undefined;
    }, vars);
    return value === undefined || value === null ? '' : String(value);
  });
}
