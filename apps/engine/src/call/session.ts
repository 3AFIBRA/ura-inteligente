import type { Client as AriClient } from 'ari-client';
import type { Channel, Playback } from 'ari-client';
import { PrismaClient, Prisma } from '@prisma/client';
import { ivrFlowDefinitionSchema, interpolate, type FlowNode, type IvrFlowDefinition, type Prompt } from '@ura/shared';
import { env } from '../config/env.js';
import { logger } from '../logger.js';
import { ttsToMedia, transcribe } from '../speech/tts.js';

const prisma = new PrismaClient();

type Vars = Record<string, unknown>;

/** Resolve caminho aninhado "a.b.c" nas variaveis. */
function resolveVar(vars: Vars, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc && typeof acc === 'object' && key in (acc as Vars)) return (acc as Vars)[key];
    return undefined;
  }, vars);
}

function compare(op: string, a: unknown, b: string): boolean {
  const sa = a === undefined || a === null ? '' : String(a);
  const na = Number(sa); const nb = Number(b);
  const numeric = sa !== '' && b !== '' && !Number.isNaN(na) && !Number.isNaN(nb);
  switch (op) {
    case '==': return sa === b;
    case '!=': return sa !== b;
    case '>': return numeric ? na > nb : sa > b;
    case '<': return numeric ? na < nb : sa < b;
    case '>=': return numeric ? na >= nb : sa >= b;
    case '<=': return numeric ? na <= nb : sa <= b;
    case 'contains': return sa.includes(b);
    case 'exists': return a !== undefined && a !== null && sa !== '';
    case 'empty': return a === undefined || a === null || sa === '';
    default: return false;
  }
}

/** Avalia o no de horario de atendimento no fuso do tenant. */
export function scheduleIsOpen(node: Extract<FlowNode, { type: 'schedule' }>, now = new Date()): boolean {
  try {
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: node.timezone || 'America/Sao_Paulo',
      weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
    });
    const parts = Object.fromEntries(fmt.formatToParts(now).map((p) => [p.type, p.value]));
    const dayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    const day = dayMap[parts.weekday ?? ''] ?? now.getDay();
    const hhmm = `${parts.hour}:${parts.minute}`;
    return node.windows.some((w) => w.days.includes(day) && w.start <= hhmm && hhmm <= w.end);
  } catch {
    // fallback: America/Sao_Paulo (UTC-3, sem DST desde 2019)
    const utc = now.getTime() + now.getTimezoneOffset() * 60_000;
    const local = new Date(utc - 3 * 3600_000);
    const day = local.getDay();
    const hhmm = `${String(local.getHours()).padStart(2, '0')}:${String(local.getMinutes()).padStart(2, '0')}`;
    return node.windows.some((w) => w.days.includes(day) && w.start <= hhmm && hhmm <= w.end);
  }
}

export class CallSession {
  readonly digitWaiters: Array<{ resolve: (d: string | null) => void; timer: NodeJS.Timeout }> = [];
  closed = false;
  vars: Vars = {};
  callRowId: string | null = null;
  resumeNode: string | null = null;

  constructor(
    readonly client: AriClient,
    readonly channel: Channel,
    readonly tenantId: string,
    readonly tenantName: string,
    readonly tenantSlug: string,
    readonly did: string,
  ) {}

  get channelId(): string { return this.channel.id; }

  /** Encerra a sessao liberando quem espera DTMF. */
  close() {
    if (this.closed) return;
    this.closed = true;
    for (const w of this.digitWaiters) { clearTimeout(w.timer); w.resolve(null); }
    this.digitWaiters.length = 0;
    void prisma.call.update({
      where: { channelId: this.channelId },
      data: {
        status: 'completed',
        endedAt: new Date(),
        variables: this.vars as Prisma.InputJsonValue,
        ...(this.resumeNode && { variables: { ...this.vars, __resume: this.resumeNode } as unknown as Prisma.InputJsonValue }),
      },
    }).catch(() => undefined);
  }

  onDtmf(digit: string) {
    const waiter = this.digitWaiters.shift();
    if (waiter) { clearTimeout(waiter.timer); waiter.resolve(digit); }
  }

  waitForDigit(timeoutMs: number): Promise<string | null> {
    return new Promise((resolve) => {
      const entry = {
        resolve: (d: string | null) => {
          const idx = this.digitWaiters.indexOf(entry);
          if (idx >= 0) this.digitWaiters.splice(idx, 1);
          resolve(d);
        },
        timer: setTimeout(() => entry.resolve(null), timeoutMs),
      };
      this.digitWaiters.push(entry);
    });
  }

  /** Toca uma URI de midia e aguarda o fim. */
  async play(media: string | string[]): Promise<void> {
    let playback: Playback;
    try {
      playback = await this.client.channels.play({ channelId: this.channelId, media });
    } catch (err) {
      if (this.closed) return;
      logger.warn({ err: String(err) }, 'Falha ao iniciar playback');
      return;
    }
    await new Promise<void>((resolve) => {
      const onFinished = (_evt: unknown, pb: Playback) => {
        if (pb.id === playback.id) {
          this.client.removeListener('PlaybackFinished', onFinished);
          clearTimeout(timer);
          resolve();
        }
      };
      const timer = setTimeout(() => {
        this.client.removeListener('PlaybackFinished', onFinished);
        resolve();
      }, 180_000);
      this.client.on('PlaybackFinished', onFinished);
    });
  }

  /** Toca um prompt (TTS ou arquivo de audio). Retorna false se nao conseguiu gerar audio. */
  async playPrompt(prompt: Prompt | undefined): Promise<boolean> {
    if (!prompt) return false;
    if (prompt.audio) {
      await this.play(`sound:custom/${prompt.audio}`);
      return true;
    }
    if (prompt.text) {
      const text = interpolate(prompt.text, this.vars);
      const media = await ttsToMedia(this.tenantId, text);
      if (media) { await this.play(media); return true; }
    }
    return false;
  }

  /** Coleta digitos com terminador e timeout entre digitos. */
  async collectDigits(opts: { maxDigits: number; terminator?: string; firstTimeoutMs: number; interTimeoutMs?: number }): Promise<string | null> {
    const terminator = opts.terminator ?? '#';
    let digits = '';
    let timeout = opts.firstTimeoutMs;
    while (digits.length < opts.maxDigits && !this.closed) {
      const digit = await this.waitForDigit(timeout);
      if (digit === null) break;
      if (digit === terminator) break;
      digits += digit;
      timeout = opts.interTimeoutMs ?? opts.firstTimeoutMs;
    }
    return digits || null;
  }

  /** Grava audio do canal ate silencio ou duracao maxima. Retorna caminho do arquivo. */
  async record(name: string, maxDurationSec: number, maxSilenceSec: number): Promise<string | null> {
    try {
      await this.client.channels.record({
        channelId: this.channelId,
        name,
        format: 'wav',
        maxDurationSeconds: maxDurationSec,
        maxSilenceSeconds: maxSilenceSec,
        ifExists: 'overwrite',
        beep: false,
      });
      const path = `${env.RECORDINGS_DIR.replace(/\/$/, '')}/${name}.wav`;
      await new Promise<void>((resolve) => {
        const onFinished = (_evt: unknown, rec: { name: string }) => {
          if (rec.name === name) {
            this.client.removeListener('RecordingFinished', onFinished);
            clearTimeout(timer);
            resolve();
          }
        };
        const timer = setTimeout(() => {
          this.client.removeListener('RecordingFinished', onFinished);
          resolve();
        }, (maxDurationSec + 15) * 1000);
        this.client.on('RecordingFinished', onFinished);
      });
      return path;
    } catch (err) {
      logger.warn({ err: String(err) }, 'Falha ao gravar audio');
      return null;
    }
  }
}

/** Executa o fluxo de URA publicado. */
export class FlowExecutor {
  private steps = 0;
  constructor(
    readonly session: CallSession,
    readonly flow: IvrFlowDefinition,
    private readonly prisma: PrismaClient,
  ) {}

  private node(id: string): FlowNode | undefined {
    return this.flow.nodes.find((n) => n.id === id);
  }

  private async event(type: string, nodeId?: string, data: Vars = {}) {
    if (!this.session.callRowId) return;
    await this.prisma.callEvent.create({
      data: { callId: this.session.callRowId, type, nodeId, data: data as Prisma.InputJsonValue },
    }).catch(() => undefined);
  }

  async run(startNodeId: string): Promise<void> {
    let current: string | undefined = startNodeId;
    while (current && !this.session.closed) {
      if (++this.steps > 1000) { logger.warn('Limite de passos do fluxo atingido'); break; }
      const node = this.node(current);
      if (!node) {
        logger.warn({ node: current }, 'No inexistente no fluxo; encerrando');
        break;
      }
      await this.event('node_enter', node.id);
      current = (await this.execute(node)) ?? undefined;
    }
    if (!this.session.closed) {
      try { await this.session.client.channels.hangup({ channelId: this.session.channelId }); } catch { /* noop */ }
    }
  }

  private async execute(node: FlowNode): Promise<string | null | undefined> {
    const s = this.session;
    switch (node.type) {
      case 'start':
        return node.next;

      case 'schedule':
        return scheduleIsOpen(node) ? node.open : node.closed;

      case 'playback':
        await s.playPrompt(node.prompt);
        return node.next;

      case 'set_variable':
        for (const [key, template] of Object.entries(node.assignments)) {
          s.vars[key] = interpolate(template, s.vars);
        }
        return node.next;

      case 'menu': {
        let attempts = node.retries + 1;
        while (attempts-- > 0 && !s.closed) {
          await s.playPrompt(node.prompt);
          const digit = await s.waitForDigit(node.timeoutSec * 1000);
          await this.event('dtmf', node.id, { digit });
          if (digit && node.options[digit]) return node.options[digit];
          if (digit) await s.playPrompt(node.invalidPrompt ?? { text: 'Opção inválida.' });
        }
        return node.fallback ?? null;
      }

      case 'collect_digits': {
        let attempts = node.retries + 1;
        while (attempts-- > 0 && !s.closed) {
          await s.playPrompt(node.prompt);
          const digits = await s.collectDigits({
            maxDigits: node.maxDigits,
            terminator: node.terminator,
            firstTimeoutMs: node.timeoutSec * 1000,
          });
          await this.event('dtmf', node.id, { digits });
          if (digits && this.validDigits(digits, node.validate)) {
            s.vars[node.variable] = digits;
            return node.next;
          }
          if (digits) await s.playPrompt(node.invalidPrompt ?? { text: 'Dados inválidos.' });
        }
        return node.fallback ?? null;
      }

      case 'ask': {
        let attempts = node.retries + 1;
        while (attempts-- > 0 && !s.closed) {
          await s.playPrompt(node.prompt);
          const path = await s.record(`ask-${s.channelId.slice(0, 8)}-${Date.now()}`, node.maxDurationSec, node.maxSilenceSec);
          const text = path ? await transcribe(s.tenantId, path, this.flow.language) : null;
          await this.event('asr', node.id, { text });
          if (text) {
            s.vars[node.variable] = text;
            return node.next ?? null;
          }
          await s.playPrompt(node.noInputPrompt ?? { text: 'Não entendi. Vamos tentar novamente.' });
        }
        return node.fallback ?? null;
      }

      case 'erp_action': {
        logger.warn({ action: node.action }, 'Acao de ERP ainda nao integrada no engine; seguindo fluxo');
        s.vars[node.output] = null;
        return node.onError ?? node.onSuccess;
      }

      case 'whatsapp_send': {
        logger.warn('Envio de WhatsApp ainda nao integrado no engine; seguindo fluxo');
        return node.onError ?? node.onSuccess;
      }

      case 'condition': {
        for (const rule of node.rules) {
          const value = resolveVar(s.vars, rule.variable);
          if (compare(rule.op, value, rule.value ?? '')) return rule.next;
        }
        return node.else;
      }

      case 'transfer': {
        await s.playPrompt(node.announcement);
        try {
          await s.client.channels.continueInDialplan({
            channelId: s.channelId,
            context: `to-${s.tenantSlug}`,
            extension: interpolate(node.destination, s.vars),
            priority: 1,
          });
        } catch (err) {
          logger.warn({ err: String(err) }, 'Falha na transferencia');
          return node.onNoAnswer ?? null;
        }
        return null; // canal saiu do Stasis
      }

      case 'queue': {
        await s.playPrompt(node.announcement);
        s.resumeNode = node.onTimeout ?? null;
        try {
          await s.client.channels.setChannelVar({ channelId: s.channelId, variable: 'URA_QUEUE', value: node.queueName });
          await s.client.channels.setChannelVar({ channelId: s.channelId, variable: 'URA_TENANT', value: s.tenantId });
          await s.client.channels.setChannelVar({ channelId: s.channelId, variable: 'URA_TIMEOUT', value: String(node.maxWaitSec) });
          await s.client.channels.continueInDialplan({ channelId: s.channelId, context: 'sub-queue', extension: 's', priority: 1 });
        } catch (err) {
          logger.warn({ err: String(err) }, 'Falha ao entrar na fila');
          return node.onTimeout ?? null;
        }
        return null; // canal saiu do Stasis; volta em queue-exit
      }

      case 'voicemail': {
        await s.playPrompt(node.prompt ?? { text: 'Por favor, deixe sua mensagem após o sinal.' });
        const name = `vm-${s.channelId.slice(0, 8)}-${Date.now()}`;
        const path = await s.record(name, node.maxDurationSec, 5);
        if (path && s.callRowId) {
          await this.prisma.recording.create({
            data: { tenantId: s.tenantId, path, format: 'wav' },
          }).catch(() => undefined);
        }
        return node.next ?? null;
      }

      case 'hangup': {
        await s.playPrompt(node.prompt);
        try { await s.client.channels.hangup({ channelId: s.channelId }); } catch { /* noop */ }
        return null;
      }

      default:
        return null;
    }
  }

  private validDigits(digits: string, validate: string): boolean {
    if (validate === 'none' || validate === 'numeric') return digits.length > 0;
    const nums = digits.replace(/\D/g, '');
    if (validate === 'phone') return nums.length >= 10 && nums.length <= 13;
    if (validate === 'cpf_cnpj') {
      if (nums.length !== 11 && nums.length !== 14) return false;
      return true; // digitos validados; checagem de DV pode ser adicionada depois
    }
    return true;
  }
}

/** Carrega o fluxo publicado do tenant (rota de entrada -> fluxo, ou primeiro publicado). */
export async function loadFlowForDid(tenantId: string, did: string): Promise<{ flow: IvrFlowDefinition; flowId: string } | null> {
  const routes = await prisma.inboundRoute.findMany({
    where: { tenantId, active: true },
    include: { flow: true },
    orderBy: { priority: 'asc' },
  });
  const digits = did.replace(/\D/g, '');
  const route = routes.find((r) => {
    if (r.destinationType !== 'ivr' || !r.flow?.published) return false;
    const pattern = r.did.trim();
    if (!pattern || pattern === '_X.' || pattern === '_X' || pattern === 's') return true;
    if (pattern.startsWith('_')) {
      const regex = new RegExp(`^${pattern.slice(1).replace(/\./g, '.').replace(/X/g, '\\d').replace(/\+/g, '\\+')}$`);
      return regex.test(digits);
    }
    return pattern.replace(/\D/g, '') === digits;
  });
  if (route?.flow?.published) {
    return { flow: ivrFlowDefinitionSchema.parse(route.flow.published), flowId: route.flow.id };
  }
  const fallback = await prisma.ivrFlow.findFirst({ where: { tenantId, active: true, published: { not: Prisma.DbNull } } });
  if (fallback?.published) {
    return { flow: ivrFlowDefinitionSchema.parse(fallback.published), flowId: fallback.id };
  }
  return null;
}
