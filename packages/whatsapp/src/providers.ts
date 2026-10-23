import axios, { AxiosError, type AxiosRequestConfig } from 'axios';
import type { WhatsappSendResult } from '@ura/shared';
import { WhatsappError, type WhatsappDocument, type WhatsappProviderOptions, type WhatsappTemplate } from './types.js';

/** Cliente HTTP comum (axios, timeout, erros traduzidos). */
export async function waRequest<T>(cfg: AxiosRequestConfig, timeoutMs = 15000): Promise<T> {
  try {
    const res = await axios.request<T>({ timeout: timeoutMs, validateStatus: () => false, ...cfg });
    if (res.status >= 400) {
      const detail = typeof res.data === 'string' ? res.data.slice(0, 200) : JSON.stringify(res.data ?? {}).slice(0, 200);
      if (res.status === 401 || res.status === 403) throw new WhatsappError(`Falha de autenticacao no WhatsApp: ${detail}`, 'AUTH');
      throw new WhatsappError(`Erro HTTP ${res.status} no WhatsApp: ${detail}`, res.status === 429 ? 'RATE_LIMIT' : 'UNKNOWN');
    }
    return res.data;
  } catch (err) {
    if (err instanceof WhatsappError) throw err;
    const e = err as AxiosError;
    if (e.code === 'ECONNABORTED' || e.code === 'ETIMEDOUT') throw new WhatsappError('Tempo limite ao chamar o WhatsApp', 'CONNECTION');
    if (e.response) throw new WhatsappError(`Erro HTTP ${e.response.status} no WhatsApp`, 'UNKNOWN');
    throw new WhatsappError(`Falha de conexao com o WhatsApp: ${e.message}`, 'CONNECTION');
  }
}

/** Normaliza numero para o formato exigido pelas APIs (somente digitos, com 55). */
export function waNumber(to: string): string {
  let n = (to ?? '').replace(/\D/g, '');
  if (n.startsWith('0')) n = n.replace(/^0+/, '');
  if (!n.startsWith('55') && n.length >= 10 && n.length <= 11) n = `55${n}`;
  return n;
}

export function isDocumentWithUrl(doc: WhatsappDocument): doc is WhatsappDocument & { url: string } {
  return typeof doc.url === 'string' && doc.url.length > 0;
}

/* ------------------------------------------------------------------ Meta */

export interface MetaProviderOptions extends WhatsappProviderOptions {
  config: { phoneNumberId?: string; apiVersion?: string; [k: string]: unknown };
  secrets: { token?: string; [k: string]: string | undefined };
}

/** WhatsApp Cloud API (Meta) — https://graph.facebook.com/{v}/{phoneNumberId}/messages */
export class MetaWhatsappProvider {
  readonly provider = 'meta' as const;
  private readonly phoneId: string;
  private readonly apiVersion: string;
  private readonly token: string;

  constructor(private readonly opts: MetaProviderOptions) {
    this.phoneId = String(opts.config.phoneNumberId ?? '');
    this.apiVersion = String(opts.config.apiVersion ?? 'v21.0');
    this.token = opts.secrets.token ?? '';
    if (!this.phoneId) throw new WhatsappError('Meta: phoneNumberId nao informado', 'AUTH');
    if (!this.token) throw new WhatsappError('Meta: token de acesso nao informado', 'AUTH');
  }

  private get url(): string {
    return `https://graph.facebook.com/${this.apiVersion}/${this.phoneId}/messages`;
  }

  private async send(payload: Record<string, unknown>): Promise<WhatsappSendResult> {
    const res = await waRequest<{ messages?: Array<{ id: string }>; error?: { message: string } }>(
      { method: 'POST', url: this.url, headers: { authorization: `Bearer ${this.token}`, 'content-type': 'application/json' }, data: payload },
      this.opts.timeoutMs,
    );
    if (res.error) throw new WhatsappError(`Meta: ${res.error.message}`, 'UNKNOWN');
    return { status: 'sent', providerMessageId: res.messages?.[0]?.id };
  }

  async testConnection(): Promise<{ ok: boolean; message: string }> {
    try {
      const res = await waRequest<{ error?: { message: string } }>({
        method: 'GET',
        url: `https://graph.facebook.com/${this.apiVersion}/${this.phoneId}`,
        headers: { authorization: `Bearer ${this.token}` },
      });
      if (res.error) return { ok: false, message: `Meta: ${res.error.message}` };
      return { ok: true, message: 'Conexao com WhatsApp Cloud API estabelecida' };
    } catch (err) {
      return { ok: false, message: (err as Error).message };
    }
  }

  async sendText(to: string, text: string): Promise<WhatsappSendResult> {
    return this.send({ messaging_product: 'whatsapp', to: waNumber(to), type: 'text', text: { body: text } });
  }

  async sendDocument(to: string, doc: WhatsappDocument): Promise<WhatsappSendResult> {
    if (isDocumentWithUrl(doc)) {
      return this.send({ messaging_product: 'whatsapp', to: waNumber(to), type: 'document', document: { link: doc.url, caption: doc.caption } });
    }
    if (doc.base64) {
      return this.send({
        messaging_product: 'whatsapp',
        to: waNumber(to),
        type: 'document',
        document: { filename: doc.filename, caption: doc.caption },
        // Meta exige upload de midia para base64 — usa endpoint de midias
        ...(await this.mediaFromBase64(doc)),
      });
    }
    throw new WhatsappError('Documento sem URL nem conteudo', 'INVALID_NUMBER');
  }

  private async mediaFromBase64(doc: WhatsappDocument): Promise<Record<string, unknown>> {
    const form = new FormData();
    form.append('messaging_product', 'whatsapp');
    form.append('type', doc.mimeType || 'application/pdf');
    form.append('file', new Blob([Buffer.from(doc.base64 ?? '', 'base64')], { type: doc.mimeType || 'application/pdf' }), doc.filename);
    const res = await waRequest<{ id: string }>(
      { method: 'POST', url: `https://graph.facebook.com/${this.apiVersion}/${this.phoneId}/media`, headers: { authorization: `Bearer ${this.token}` }, data: form },
      this.opts.timeoutMs,
    );
    return { document: { id: res.id, caption: doc.caption, filename: doc.filename } };
  }

  async sendTemplate(to: string, template: WhatsappTemplate): Promise<WhatsappSendResult> {
    return this.send({
      messaging_product: 'whatsapp',
      to: waNumber(to),
      type: 'template',
      template: { name: template.name, language: { code: template.language ?? 'pt_BR' }, components: template.params?.map((p) => ({ type: 'body', text: p })) },
    });
  }
}

/* -------------------------------------------------------------- Evolution */

export interface EvolutionProviderOptions extends WhatsappProviderOptions {
  config: { baseUrl?: string; instance?: string; [k: string]: unknown };
  secrets: { apiKey?: string; token?: string; [k: string]: string | undefined };
}

/** Evolution API — {baseUrl}/message/{text|document}/{instance} com apikey. */
export class EvolutionWhatsappProvider {
  readonly provider = 'evolution' as const;
  private readonly baseUrl: string;
  private readonly instance: string;
  private readonly apiKey: string;

  constructor(private readonly opts: EvolutionProviderOptions) {
    this.baseUrl = String(opts.config.baseUrl ?? '').replace(/\/+$/, '');
    this.instance = String(opts.config.instance ?? '');
    this.apiKey = opts.secrets.apiKey ?? opts.secrets.token ?? '';
    if (!this.baseUrl) throw new WhatsappError('Evolution: URL base nao informada', 'AUTH');
    if (!this.instance) throw new WhatsappError('Evolution: instancia nao informada', 'AUTH');
    if (!this.apiKey) throw new WhatsappError('Evolution: apikey nao informada', 'AUTH');
  }

  private get headers(): Record<string, string> {
    return { apikey: this.apiKey, 'content-type': 'application/json' };
  }

  private async send(path: string, payload: Record<string, unknown>): Promise<WhatsappSendResult> {
    const res = await waRequest<{ key?: { id: string }; error?: { message: string } }>(
      { method: 'POST', url: `${this.baseUrl}${path}`, headers: this.headers, data: payload },
      this.opts.timeoutMs,
    );
    if (res.error) throw new WhatsappError(`Evolution: ${res.error.message}`, 'UNKNOWN');
    return { status: 'sent', providerMessageId: res.key?.id };
  }

  async testConnection(): Promise<{ ok: boolean; message: string }> {
    try {
      const res = await waRequest<{ state?: string; instance?: { state?: string }; status?: number }>({
        method: 'GET',
        url: `${this.baseUrl}/instance/connectionState/${this.instance}`,
        headers: this.headers,
      });
      const state = res.instance?.state ?? res.state ?? '';
      if (/open|connected/i.test(state)) return { ok: true, message: `Evolution conectada (${state})` };
      return { ok: false, message: `Evolution nao esta conectada (estado: ${state || 'desconhecido'})` };
    } catch (err) {
      return { ok: false, message: (err as Error).message };
    }
  }

  async sendText(to: string, text: string): Promise<WhatsappSendResult> {
    return this.send(`/message/text/${this.instance}`, { number: waNumber(to), text });
  }

  async sendDocument(to: string, doc: WhatsappDocument): Promise<WhatsappSendResult> {
    if (isDocumentWithUrl(doc)) {
      return this.send(`/message/document/${this.instance}`, {
        number: waNumber(to),
        documentUrl: doc.url,
        fileName: doc.filename,
        caption: doc.caption,
      });
    }
    return this.send(`/message/document/${this.instance}`, {
      number: waNumber(to),
      document: `data:${doc.mimeType || 'application/pdf'};base64,${doc.base64}`,
      fileName: doc.filename,
      caption: doc.caption,
    });
  }

  async sendTemplate(to: string, template: WhatsappTemplate): Promise<WhatsappSendResult> {
    throw new WhatsappError('Evolution: envio de template nao suportado por este adaptador', 'UNKNOWN');
  }
}

/* -------------------------------------------------------------------- Z-API */

export interface ZapiProviderOptions extends WhatsappProviderOptions {
  config: { baseUrl?: string; instanceId?: string; [k: string]: unknown };
  secrets: { token?: string; clientToken?: string; [k: string]: string | undefined };
}

/** Z-API — {baseUrl}/instances/{instanceId}/token/{token}/send-text | send-document */
export class ZapiWhatsappProvider {
  readonly provider = 'zapi' as const;
  private readonly baseUrl: string;
  private readonly instanceId: string;
  private readonly token: string;
  private readonly clientToken?: string;

  constructor(private readonly opts: ZapiProviderOptions) {
    this.baseUrl = String(opts.config.baseUrl ?? 'https://api.z-api.io').replace(/\/+$/, '');
    this.instanceId = String(opts.config.instanceId ?? '');
    this.token = opts.secrets.token ?? '';
    if (!this.instanceId) throw new WhatsappError('Z-API: instanceId nao informado', 'AUTH');
    if (!this.token) throw new WhatsappError('Z-API: token nao informado', 'AUTH');
    this.clientToken = opts.secrets.clientToken;
  }

  private get headers(): Record<string, string> {
    return { 'content-type': 'application/json', ...(this.clientToken ? { 'client-token': this.clientToken } : {}) };
  }

  private get base(): string {
    return `${this.baseUrl}/instances/${this.instanceId}/token/${this.token}`;
  }

  private async send(path: string, payload: Record<string, unknown>): Promise<WhatsappSendResult> {
    const res = await waRequest<{ zaapId?: string; messageId?: string; error?: string }>(
      { method: 'POST', url: `${this.base}${path}`, headers: this.headers, data: payload },
      this.opts.timeoutMs,
    );
    if (res.error) throw new WhatsappError(`Z-API: ${res.error}`, 'UNKNOWN');
    return { status: 'sent', providerMessageId: String(res.zaapId ?? res.messageId ?? '') };
  }

  async testConnection(): Promise<{ ok: boolean; message: string }> {
    try {
      const res = await waRequest<{ connected?: boolean; error?: string }>({
        method: 'GET',
        url: `${this.base}/status-connection`,
        headers: this.headers,
      });
      if (res.error) return { ok: false, message: `Z-API: ${res.error}` };
      if (res.connected) return { ok: true, message: 'Z-API conectada' };
      return { ok: false, message: 'Z-API nao esta conectada (leia o QR code)' };
    } catch (err) {
      return { ok: false, message: (err as Error).message };
    }
  }

  async sendText(to: string, text: string): Promise<WhatsappSendResult> {
    return this.send('/send-text', { phone: waNumber(to), message: text });
  }

  async sendDocument(to: string, doc: WhatsappDocument): Promise<WhatsappSendResult> {
    if (isDocumentWithUrl(doc)) {
      return this.send('/send-document', { phone: waNumber(to), document: doc.url, fileName: doc.filename, caption: doc.caption });
    }
    throw new WhatsappError('Z-API: envio de documento requer URL publica do PDF', 'UNKNOWN');
  }

  async sendTemplate(to: string, template: WhatsappTemplate): Promise<WhatsappSendResult> {
    throw new WhatsappError('Z-API: envio de template nao suportado por este adaptador', 'UNKNOWN');
  }
}
