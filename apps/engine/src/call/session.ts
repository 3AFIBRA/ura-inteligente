import type { Client as AriClient } from 'ari-client';
import type { Channel, Playback } from 'ari-client';
import { PrismaClient, Prisma } from '@prisma/client';
import { ivrFlowDefinitionSchema, interpolate, type FlowNode, type IvrFlowDefinition, type Prompt } from '@ura/shared';
import * as fs from 'node:fs';
import { env } from '../config/env.js';
import { logger } from '../logger.js';
import { ttsToMedia, transcribe, classifyIntent } from '../speech/tts.js';

const prisma = new PrismaClient();

type Vars = Record<string, unknown>;

/** Duracao aproximada de um WAV (header RIFF), ou null se ilegivel. */
function wavDurationSec(path: string): number | null {
  try {
    const buf = Buffer.alloc(44);
    const fd = fs.openSync(path, 'r');
    try {
      if (fs.readSync(fd, buf, 0, 44, 0) < 44 || buf.toString('ascii', 0, 4) !== 'RIFF') return null;
      const byteRate = buf.readUInt32LE(28);
      if (!byteRate) return null;
      return Math.max(0, (fs.statSync(path).size - 44) / byteRate);
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return null;
  }
}

/** Resolve caminho aninhado "a.b.c" nas variaveis. */
function resolveVar(vars: Vars, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc && typeof acc === 'object' && key in (acc as Vars)) return (acc as Vars)[key];
    return undefined;
  }, vars);
}

/** Digitos falados (pt-BR) e palavras de contexto aceitas. */
const SPOKEN_DIGITS: Record<string, string> = { '0': '0', '1': '1', '2': '2', '3': '3', '4': '4', '5': '5', '6': '6', '7': '7', '8': '8', '9': '9', zero: '0', um: '1', uma: '1', dois: '2', duas: '2', tres: '3', quatro: '4', cinco: '5', seis: '6', sete: '7', oito: '8', nove: '9' };
const DIGIT_FILLERS = new Set(['opcao', 'a', 'o', 'e', 'para', 'por', 'favor', 'quero', 'gostaria', 'de', 'do', 'da', 'numero', 'eh', 'digito', 'tecla', 'numero']);

/** Extrai um digito falado ("opção dois") do texto; ignora frases comuns. */
function spokenDigit(text: string): string | null {
  const words = text
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  let found: string | null = null;
  for (const w of words) {
    const d = SPOKEN_DIGITS[w];
    if (d !== undefined) {
      if (found) return null; // mais de um numero => ambiguo
      found = d;
      continue;
    }
    if (!DIGIT_FILLERS.has(w)) return null; // frase livre, nao eh um digito
  }
  return found;
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
  private activePlayback?: Playback;
  private snoopChannel: Channel | null = null;

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

  /** Waiter de DTMF cancelavel (evita que waiters antigos roubem digitos do proximo no). */
  createDigitWaiter(timeoutMs: number): { promise: Promise<string | null>; cancel: () => void } {
    let entry!: { resolve: (d: string | null) => void; timer: NodeJS.Timeout };
    const promise = new Promise<string | null>((resolve) => {
      entry = {
        resolve: (d: string | null) => {
          const idx = this.digitWaiters.indexOf(entry);
          if (idx >= 0) this.digitWaiters.splice(idx, 1);
          clearTimeout(entry.timer);
          resolve(d);
        },
        timer: setTimeout(() => entry.resolve(null), timeoutMs),
      };
      this.digitWaiters.push(entry);
    });
    return { promise, cancel: () => entry.resolve(null) };
  }

  waitForDigit(timeoutMs: number): Promise<string | null> {
    return this.createDigitWaiter(timeoutMs).promise;
  }

  /** Toca uma URI de midia e aguarda o fim. Interrompivel via stopPlayback(). */
  async play(media: string | string[]): Promise<void> {
    let playback: Playback;
    try {
      playback = await this.client.channels.play({ channelId: this.channelId, media });
    } catch (err) {
      if (this.closed) return;
      logger.warn({ err: String(err) }, 'Falha ao iniciar playback');
      return;
    }
    this.activePlayback = playback;
    await new Promise<void>((resolve) => {
      const onFinished = (_evt: unknown, pb: Playback) => {
        if (pb.id === playback.id) {
          this.client.removeListener('PlaybackFinished', onFinished);
          clearTimeout(timer);
          if (this.activePlayback === playback) this.activePlayback = undefined;
          resolve();
        }
      };
      const timer = setTimeout(() => {
        this.client.removeListener('PlaybackFinished', onFinished);
        if (this.activePlayback === playback) this.activePlayback = undefined;
        resolve();
      }, 180_000);
      this.client.on('PlaybackFinished', onFinished);
    });
  }

  /** Interrompe o playback em andamento (barge-in). */
  async stopPlayback(): Promise<void> {
    const pb = this.activePlayback;
    this.activePlayback = undefined;
    if (pb) {
      try { await this.client.playbacks.stop({ playbackId: pb.id }); } catch { /* ja finalizado */ }
    }
  }

  /** Cria canal snoop (spy=in) para ouvir SOMENTE a voz do chamador durante prompts. */
  async startCallerSnoop(): Promise<Channel | null> {
    if (this.snoopChannel) return this.snoopChannel;
    try {
      this.snoopChannel = await this.client.channels.snoopChannel({
        channelId: this.channelId,
        app: env.ARI_APP,
        spy: 'in',
        appArgs: 'snoop',
      });
      return this.snoopChannel;
    } catch (err) {
      logger.warn({ err: String(err) }, 'Falha ao criar canal snoop');
      return null;
    }
  }

  /** Encerra o canal snoop e descarta gravacao pendente. */
  async stopCallerSnoop(recName?: string | null): Promise<void> {
    if (recName) this.cancelRecording(recName).catch(() => undefined);
    const sn = this.snoopChannel;
    this.snoopChannel = null;
    if (sn) {
      try { await sn.hangup(); } catch { /* ja encerrado */ }
    }
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

  /** Grava audio de um canal (padrao: o chamador) ate silencio ou duracao maxima. Resolve com o caminho do arquivo. */
  record(name: string, maxDurationSec: number, maxSilenceSec: number, beep = true, channelId = this.channelId): Promise<string | null> {
    return new Promise((resolve) => {
      let settled = false;
      const finish = (value: string | null) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this.client.removeListener('RecordingFinished', onFinished);
        this.client.removeListener('RecordingFailed', onFailed);
        resolve(value);
      };
      const onFinished = (_evt: unknown, rec: { name?: string }) => {
        if (rec?.name === name) finish(`${env.RECORDINGS_DIR.replace(/\/$/, '')}/${name}.wav`);
      };
      const onFailed = (_evt: unknown, rec: { name?: string }) => {
        if (rec?.name === name) finish(null);
      };
      const timer = setTimeout(() => finish(null), (maxDurationSec + 20) * 1000);
      this.client.on('RecordingFinished', onFinished);
      this.client.on('RecordingFailed', onFailed);
      this.client.channels.record({
        channelId,
        name,
        format: 'wav',
        maxDurationSeconds: maxDurationSec,
        maxSilenceSeconds: maxSilenceSec,
        ifExists: 'overwrite',
        beep,
      }).catch((err) => {
        logger.warn({ err: String(err) }, 'Falha ao iniciar gravacao');
        finish(null);
      });
    });
  }

  /** Cancela (descarta) uma gravacao em andamento. */
  async cancelRecording(name: string): Promise<void> {
    try {
      await this.client.recordings.cancel({ recordingName: name });
    } catch { /* gravacao ja encerrada */ }
  }

  /** Descarta esperas de DTMF pendentes (usado ao transitar entre nos). */
  clearDigitWaiters() {
    for (const w of this.digitWaiters) { clearTimeout(w.timer); w.resolve(null); }
    this.digitWaiters.length = 0;
  }
}

/** Entrada reconhecida em um menu: tecla ou fala. */
type MenuInput = { kind: 'dtmf'; digit: string } | { kind: 'speech'; text: string };

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
      this.session.clearDigitWaiters();
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
        const intentKeys = node.allowSpeech ? Object.keys(node.intents ?? {}) : [];
        let attempts = node.retries + 1;
        while (attempts-- > 0 && !s.closed) {
          // o prompt e tocado dentro de listenForMenuInput (permite interromper falando/teclando)
          const input = await this.listenForMenuInput(node);
          if (input?.kind === 'dtmf') {
            await this.event('dtmf', node.id, { digit: input.digit });
            if (node.options[input.digit]) return node.options[input.digit];
            await s.playPrompt(node.invalidPrompt ?? { text: 'Opção inválida.' });
            continue;
          }
          if (input?.kind === 'speech') {
            await this.event('asr', node.id, { text: input.text });
            const digit = spokenDigit(input.text);
            if (digit && node.options[digit]) {
              await this.event('dtmf', node.id, { digit, via: 'voz' });
              return node.options[digit];
            }
            if (intentKeys.length > 0) {
              const intent = await classifyIntent(s.tenantId, input.text, intentKeys);
              await this.event('nlu', node.id, { intent });
              const intentMap = node.intents as Record<string, string> | undefined;
              if (intent && intentMap?.[intent]) return intentMap[intent];
            }
            await s.playPrompt(node.invalidPrompt ?? { text: 'Não entendi. Vou repetir as opções.' });
            continue;
          }
          // sem entrada (timeout) — repete
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

  /**
   * Escuta entrada do menu tocando o prompt em paralelo:
   *  - DTMF pode interromper o prompt a qualquer momento;
   *  - com allowSpeech, grava a voz do chamador (canal snoop, spy=in) DESDE o inicio do
   *    prompt — falar durante as opções interrompe o áudio (barge-in);
   *  - gravacao que termina com ~maxSilence de duracao = silencio puro (regrava sem gastar ASR).
   */
  private async listenForMenuInput(node: Extract<FlowNode, { type: 'menu' }>): Promise<MenuInput | null> {
    const s = this.session;
    const timeoutMs = Math.max(node.timeoutSec, 3) * 1000;
    const maxSilence = 3;

    const digit = s.createDigitWaiter(200_000);
    const rec: { name: string | null; promise: Promise<string | null> | null } = { name: null, promise: null };
    let recRestarts = 0;
    try {
      // Snoop antes do prompt: escuta somente o audio do chamador enquanto as opcoes tocam
      let listenChannelId: string | null = null;
      if (node.allowSpeech) {
        const snoop = await s.startCallerSnoop();
        if (snoop) listenChannelId = snoop.id;
      }
      const startRec = (channelId: string) => {
        const name = `m-${s.channelId.slice(0, 12)}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        rec.name = name;
        rec.promise = s.record(name, node.timeoutSec + 20, maxSilence, false, channelId);
      };
      if (listenChannelId) startRec(listenChannelId);

      const playDone = s.playPrompt(node.prompt).then(() => true, () => false);
      let promptDone = false;
      let deadline = Number.MAX_SAFE_INTEGER;

      // sem suporte a voz (ou snoop falhou e prompt terminou): grava no proprio canal apos o prompt
      const fallbackRecAfterPrompt = () => {
        if (!rec.promise && node.allowSpeech && !listenChannelId && !s.closed) startRec(s.channelId);
      };

      while (!s.closed) {
        const racers: Array<Promise<{ kind: 'digit'; d: string | null } | { kind: 'rec'; path: string | null } | { kind: 'played' } | { kind: 'deadline' }>> = [
          digit.promise.then((d) => ({ kind: 'digit' as const, d })),
        ];
        if (rec.promise) racers.push(rec.promise.then((path) => ({ kind: 'rec' as const, path })));
        if (!promptDone) racers.push(playDone.then(() => ({ kind: 'played' as const })));
        else racers.push(new Promise<{ kind: 'deadline' }>((r) => setTimeout(() => r({ kind: 'deadline' }), Math.max(0, deadline - Date.now()))));

        const winner = await Promise.race(racers);

        if (winner.kind === 'digit') {
          if (!promptDone) void s.stopPlayback();
          return winner.d ? { kind: 'dtmf', digit: winner.d } : null;
        }
        if (winner.kind === 'played') {
          promptDone = true;
          deadline = Date.now() + timeoutMs;
          fallbackRecAfterPrompt();
          continue;
        }
        if (winner.kind === 'deadline') {
          // tempo esgotado sem fala — verifica fala tardia na gravacao em andamento
          if (rec.promise && rec.name) {
            const path = await Promise.race([rec.promise, new Promise<null>((r) => setTimeout(() => r(null), 2500))]);
            if (path) {
              const text = await this.transcribeIfSpeech(path, maxSilence);
              if (text) return { kind: 'speech', text };
            }
          }
          return null;
        }
        // gravacao encerrou: fala do chamador ou silencio puro
        const path = winner.path;
        rec.promise = null;
        const text = path ? await this.transcribeIfSpeech(path, maxSilence) : null;
        if (text) {
          if (!promptDone) void s.stopPlayback(); // barge-in: corta as opcoes
          return { kind: 'speech', text };
        }
        // silencio ate agora: continua ouvindo (regrava), com limite contra falhas repetidas
        if (recRestarts++ > 12) return null;
        if (promptDone && Date.now() >= deadline) return null;
        startRec(listenChannelId ?? s.channelId);
      }
      return null;
    } finally {
      digit.cancel();
      await s.stopCallerSnoop(rec.name);
    }
  }

  /** Transcreve o audio se ele contiver fala (duracao > maxSilence); null se so silencio/vazio. */
  private async transcribeIfSpeech(path: string, maxSilenceSec: number): Promise<string | null> {
    const dur = wavDurationSec(path);
    if (dur != null && dur <= maxSilenceSec + 0.7) return null; // silencio puro — nao gasta ASR
    const text = await transcribe(this.session.tenantId, path, this.flow.language);
    return text && text.trim() ? text.trim() : null;
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
