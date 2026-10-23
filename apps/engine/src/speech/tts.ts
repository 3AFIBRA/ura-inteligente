import { createHash } from 'node:crypto';
import { mkdir, writeFile, chmod, access } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { decryptSecrets } from '@ura/shared/crypto';
import { env } from '../config/env.js';
import { logger } from '../logger.js';

const prisma = new PrismaClient();

export interface TenantSpeech {
  language: string;
  ttsProvider: string;
  ttsVoice: string;
  baseUrl?: string;
  apiKey?: string;
  ttsModel?: string;
  nluModel?: string;
}

/** Carrega (com cache curto) a config de voz do tenant. */
const cache = new Map<string, { at: number; value: TenantSpeech }>();
export async function getTenantSpeech(tenantId: string): Promise<TenantSpeech> {
  const hit = cache.get(tenantId);
  if (hit && Date.now() - hit.at < 60_000) return hit.value;
  const row = await prisma.speechConfig.findUnique({ where: { tenantId } });
  const secrets = decryptSecrets<Record<string, string | undefined>>(row?.secretsEnc ?? null);
  const config = (row?.config ?? {}) as Record<string, unknown>;
  const value: TenantSpeech = {
    language: row?.language ?? 'pt-BR',
    ttsProvider: row?.ttsProvider ?? 'openai',
    ttsVoice: row?.ttsVoice ?? 'nova',
    baseUrl: typeof config.openaiBaseUrl === 'string' ? config.openaiBaseUrl : undefined,
    apiKey: secrets.openaiApiKey,
    ttsModel: typeof config.ttsModel === 'string' ? config.ttsModel : undefined,
    nluModel: typeof config.nluModel === 'string' ? config.nluModel : undefined,
  };
  cache.set(tenantId, { at: Date.now(), value });
  return value;
}

function runFfmpeg(input: Buffer, inputFormat: string, outPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', [
      '-hide_banner', '-loglevel', 'error',
      '-f', inputFormat, '-i', 'pipe:0',
      '-ar', '8000', '-ac', '1', '-acodec', 'pcm_s16le',
      '-y', outPath,
    ]);
    proc.stdin.on('error', () => undefined);
    proc.stdin.end(input);
    let err = '';
    proc.stderr.on('data', (d) => { err += d.toString(); });
    proc.on('error', reject);
    proc.on('close', (code) => { code === 0 ? resolve() : reject(new Error(`ffmpeg saiu com ${code}: ${err}`)); });
  });
}

async function exists(path: string): Promise<boolean> {
  try { await access(path); return true; } catch { return false; }
}

/** TTS compativel com OpenAI (POST /audio/speech, resposta wav). */
async function openaiTts(speech: TenantSpeech, text: string): Promise<{ buf: Buffer; format: string }> {
  const base = (speech.baseUrl ?? 'https://api.openai.com/v1').replace(/\/$/, '');
  const res = await fetch(`${base}/audio/speech`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${speech.apiKey}` },
    body: JSON.stringify({
      model: speech.ttsModel ?? 'gpt-4o-mini-tts',
      voice: speech.ttsVoice || 'nova',
      input: text,
      response_format: 'wav',
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`TTS HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return { buf: Buffer.from(await res.arrayBuffer()), format: 'wav' };
}

/** Fallback sem chave: Google Translate TTS (nao oficial, best-effort). */
async function gtranslateTts(text: string, lang: string): Promise<{ buf: Buffer; format: string }> {
  const tl = lang.startsWith('pt') ? 'pt-BR' : lang.startsWith('es') ? 'es' : 'en';
  const clean = text.replace(/\s+/g, ' ').trim();
  const chunks: string[] = [];
  let rest = clean;
  while (rest.length > 0) {
    if (rest.length <= 190) { chunks.push(rest); break; }
    let cut = rest.lastIndexOf(' ', 190);
    if (cut <= 0) cut = 190;
    chunks.push(rest.slice(0, cut));
    rest = rest.slice(cut).trimStart();
  }
  const parts: Buffer[] = [];
  for (const chunk of chunks) {
    const url = `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=${encodeURIComponent(tl)}&q=${encodeURIComponent(chunk)}`;
    const res = await fetch(url, {
      headers: { 'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36' },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`gTTS HTTP ${res.status}`);
    parts.push(Buffer.from(await res.arrayBuffer()));
  }
  return { buf: Buffer.concat(parts), format: 'mp3' };
}

function beep(): { buf: null } { return { buf: null }; }

/**
 * Sintetiza `text` e garante wav 8k mono no diretorio de sons compartilhado.
 * Retorna a URI de midia para o ARI (sound:...) ou null se nao conseguir.
 */
export async function ttsToMedia(tenantId: string, text: string): Promise<string | null> {
  const speech = await getTenantSpeech(tenantId);
  const hash = createHash('sha256')
    .update(`${speech.ttsProvider}|${speech.ttsVoice}|${speech.language}|${text}`)
    .digest('hex')
    .slice(0, 32);
  const dir = join(env.ASTERISK_SOUNDS_DIR, 'tts');
  const wavPath = join(dir, `${hash}.wav`);
  const media = `sound:custom/tts/${hash}`;
  if (await exists(wavPath)) return media;

  try {
    await mkdir(dir, { recursive: true });
    let result: { buf: Buffer | null; format: string };
    if (speech.apiKey) {
      try {
        result = await openaiTts(speech, text);
      } catch (err) {
        logger.warn({ err: String(err) }, 'TTS com chave falhou; usando voz de reserva');
        result = await gtranslateTts(text, speech.language).catch(() => ({ ...beep(), format: 'tone' }));
      }
    } else {
      try {
        result = await gtranslateTts(text, speech.language);
      } catch (err) {
        logger.warn({ err: String(err) }, 'TTS fallback indisponivel; configure a chave no painel (Voz)');
        result = { ...beep(), format: 'tone' };
      }
    }
    if (result.buf === null) {
      // tom curto para sinalizar que a URA esta ativa
      await new Promise<void>((resolve) => {
        const proc = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'sine=frequency=660:duration=0.6', '-ar', '8000', '-ac', '1', '-acodec', 'pcm_s16le', '-y', wavPath]);
        proc.on('close', () => resolve());
        proc.on('error', () => resolve());
      });
      await chmod(wavPath, 0o644).catch(() => undefined);
      return media;
    }
    await runFfmpeg(result.buf, result.format, wavPath);
    await chmod(wavPath, 0o644).catch(() => undefined);
    return media;
  } catch (err) {
    logger.error({ err: String(err), tenantId }, 'Falha ao sintetizar TTS');
    return null;
  }
}

/** Transcreve um arquivo wav via OpenAI-compativel (se configurado). */
export async function transcribe(tenantId: string, filePath: string, language: string): Promise<string | null> {
  const speech = await getTenantSpeech(tenantId);
  if (!speech.apiKey) return null;
  try {
    const { readFile } = await import('node:fs/promises');
    const bytes = await readFile(filePath);
    const base = (speech.baseUrl ?? 'https://api.openai.com/v1').replace(/\/$/, '');
    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(bytes)], { type: 'audio/wav' }), 'audio.wav');
    form.append('model', 'whisper-1');
    form.append('language', language.slice(0, 2));
    const res = await fetch(`${base}/audio/transcriptions`, {
      method: 'POST',
      headers: { authorization: `Bearer ${speech.apiKey}` },
      body: form,
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new Error(`ASR HTTP ${res.status}`);
    const data = (await res.json()) as { text?: string };
    return data.text?.trim() ?? null;
  } catch (err) {
    logger.warn({ err: String(err) }, 'Falha na transcricao ASR');
    return null;
  }
}

/**
 * Classifica a fala do cliente em uma das intenções disponíveis (LLM).
 * Retorna a intenção reconhecida ou null se não houver chave/entrada não encaixar.
 */
export async function classifyIntent(tenantId: string, utterance: string, intents: string[]): Promise<string | null> {
  if (intents.length === 0) return null;
  const speech = await getTenantSpeech(tenantId);
  if (!speech.apiKey) return null;
  try {
    const base = (speech.baseUrl ?? 'https://api.openai.com/v1').replace(/\/$/, '');
    const HINTS: Record<string, string> = {
      segunda_via: 'segunda via do boleto/fatura, refazer boleto, pagar conta, linha digitável',
      cadastro: 'ser cliente, assinar plano, contratar internet, novo cadastro, virar cliente',
      financeiro: 'falar com financeiro, negociar débito, acordo, parcelamento, dívida',
      suporte: 'problema técnico, internet lenta/fora, sem conexão, modem, sinal wi-fi',
      desbloqueio: 'desbloquear internet/linha, foi bloqueado, cortado por inadimplência',
      atendente: 'falar com atendente/humano/pessoa real, atendente por favor',
      cancelar: 'cancelar plano/serviço, encerrar contrato',
      confirmar: 'sim, confirmo, correto, isso mesmo, pode ser',
      negar: 'não, errado, não é isso, cancela',
    };
    const hints = intents.filter((i) => HINTS[i]).map((i) => `- ${i}: ${HINTS[i]}`).join('\n');
    const res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${speech.apiKey}` },
      body: JSON.stringify({
        model: speech.nluModel ?? 'gpt-4o-mini',
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              `Você classifica a fala de um cliente em uma URA telefônica brasileira. A transcrição pode conter erros (áudio de telefone 8kHz) — interprete foneticamente quando necessário. Intenções possíveis: ${intents.join(', ')}.\n` +
              (hints ? `Significado de cada intenção:\n${hints}\n` : '') +
              'Exemplos: "quero a segunda via do boleto" → segunda_via; "minha internet caiu" → suporte; "quero falar com uma pessoa" → atendente; "quero ser cliente de vocês" → cadastro.\n' +
              'Responda SOMENTE com JSON no formato {"intent": "<uma das intenções>"} ou {"intent": null} se nenhuma se encaixar.',
          },
          { role: 'user', content: utterance.slice(0, 500) },
        ],
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`NLU HTTP ${res.status}`);
    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const parsed = JSON.parse(data.choices?.[0]?.message?.content ?? '{}') as { intent?: unknown };
    return typeof parsed.intent === 'string' && intents.includes(parsed.intent) ? parsed.intent : null;
  } catch (err) {
    logger.warn({ err: String(err) }, 'Falha na classificacao de intencao');
    return null;
  }
}
