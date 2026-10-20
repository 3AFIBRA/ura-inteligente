import type { ErpConnectionStatus, ErpCustomer, ErpDocument, ErpInvoice, ErpMode, ErpNewCustomer, ErpType } from '@ura/shared';
import { normalizePhoneBR, onlyDigits } from '@ura/shared';
import { HttpClient, responseToBase64 } from '../base/http-client.js';
import {
  type AnyRecord,
  getPath,
  phoneVariants,
  pick,
  rowToCustomer,
  rowToInvoice,
  toAmount,
  toBool,
  toCustomerStatus,
  toDocument,
  toInvoiceStatus,
  toIsoDate,
  toPhone,
  toStr,
  toStrRequired,
  unwrapList,
  unwrapObject,
} from '../base/mappers.js';
import { ErpError, ErpNotFoundError, ErpNotSupportedError, type ErpConnector, type ErpConnectorOptions, type ErpTestResult } from '../types.js';

/**
 * Template de endpoint. Placeholders: {id}, {customerId}, {invoiceId}, {contractId}, {document}, {phone}.
 * `query` e enviado como querystring (GET) ou corpo (POST) com os mesmos placeholders nos valores.
 */
export interface EndpointTemplate {
  method?: 'GET' | 'POST' | 'PUT';
  path: string;
  query?: Record<string, string>;
  body?: Record<string, unknown>;
  /** caminho no JSON de resposta onde esta a lista/objeto (ex.: `data.items`) */
  resultPath?: string;
}

export interface RestEndpoints {
  ping?: EndpointTemplate;
  findCustomerByDocument?: EndpointTemplate;
  findCustomerByPhone?: EndpointTemplate;
  listOpenInvoices?: EndpointTemplate;
  getInvoice?: EndpointTemplate;
  getInvoicePdf?: EndpointTemplate;
  createCustomer?: EndpointTemplate;
  getConnectionStatus?: EndpointTemplate;
  unlockConnection?: EndpointTemplate;
  openTicket?: EndpointTemplate;
}

/** Mapeamento de campos: chave normalizada -> caminho no objeto de resposta (ex.: `data.nome`). */
export interface FieldMap {
  customer?: Partial<Record<keyof Omit<ErpCustomer, 'raw' | 'contracts'> | 'contractId' | 'plan', string>>;
  invoice?: Partial<Record<keyof Omit<ErpInvoice, 'raw'>, string>>;
  connection?: Partial<Record<keyof Omit<ErpConnectionStatus, 'customerId'>, string>>;
  /** caminhos para id em respostas de criacao */
  createdId?: string;
  ticketId?: string;
  /** caminhos para pdf em resposta de boleto */
  pdfBase64?: string;
  pdfUrl?: string;
}

export interface RestDefaults {
  endpoints: RestEndpoints;
  fieldMap?: FieldMap;
  /** header de autenticacao: default Authorization: Bearer <apiKey> */
  authHeader?: string;
  authPrefix?: string;
  /** valores monetarios em centavos */
  amountInCents?: boolean;
  /** nome do metodo para teste; default usa ping ou findCustomerByDocument */
  testMessage?: string;
}

export interface RestConnectorDeps {
  http?: HttpClient;
}

type Vars = Record<string, string | undefined>;

/**
 * Conector REST configuravel: todos os endpoints e mapeamentos vem de `defaults` (por ERP)
 * sobrescritos por `config.endpoints` e `config.fieldMap` do tenant.
 */
export class ConfigurableRestConnector implements ErpConnector {
  readonly type: ErpType;
  readonly mode: ErpMode = 'api';
  protected readonly http: HttpClient;
  protected readonly endpoints: RestEndpoints;
  protected readonly fieldMap: FieldMap;
  protected readonly amountInCents: boolean;

  constructor(
    protected readonly opts: ErpConnectorOptions,
    protected readonly defaults: RestDefaults,
    deps: RestConnectorDeps = {},
  ) {
    this.type = opts.type;
    const cfg = opts.config;
    const apiKey = opts.secrets.apiKey ?? opts.secrets.token ?? '';
    if (!deps.http && !cfg.baseUrl) throw new ErpError(`baseUrl do ERP ${opts.type} nao informada`, 'INVALID');
    const authHeader = (typeof cfg.authHeader === 'string' && cfg.authHeader) || defaults.authHeader || 'Authorization';
    const authPrefix = typeof cfg.authPrefix === 'string' ? cfg.authPrefix : defaults.authPrefix ?? (authHeader === 'Authorization' ? 'Bearer ' : '');
    const headers: Record<string, string> = {};
    if (apiKey) headers[authHeader] = `${authPrefix}${apiKey}`;
    if (cfg.extraHeaders && typeof cfg.extraHeaders === 'object') Object.assign(headers, cfg.extraHeaders as Record<string, string>);
    const auth = opts.secrets.username && opts.secrets.password && !apiKey ? { username: opts.secrets.username, password: opts.secrets.password } : undefined;
    this.http = deps.http ?? new HttpClient({ baseUrl: cfg.baseUrl ?? '', timeoutMs: opts.timeoutMs, headers, auth });
    const cfgEndpoints = (cfg.endpoints && typeof cfg.endpoints === 'object' ? cfg.endpoints : {}) as RestEndpoints;
    this.endpoints = { ...defaults.endpoints, ...cfgEndpoints };
    const cfgFieldMap = (cfg.fieldMap && typeof cfg.fieldMap === 'object' ? cfg.fieldMap : {}) as FieldMap;
    this.fieldMap = {
      ...defaults.fieldMap,
      ...cfgFieldMap,
      customer: { ...defaults.fieldMap?.customer, ...cfgFieldMap.customer },
      invoice: { ...defaults.fieldMap?.invoice, ...cfgFieldMap.invoice },
      connection: { ...defaults.fieldMap?.connection, ...cfgFieldMap.connection },
    };
    this.amountInCents = cfg.amountInCents === true || cfg.amountInCents === 'true' || !!defaults.amountInCents;
  }

  protected require(name: keyof RestEndpoints): EndpointTemplate {
    const ep = this.endpoints[name];
    if (!ep || !ep.path) throw new ErpNotSupportedError(name);
    return ep;
  }

  protected fill(template: string, vars: Vars): string {
    return template.replace(/\{(\w+)\}/g, (_, k: string) => encodeURIComponent(vars[k] ?? ''));
  }

  protected fillDeep(value: unknown, vars: Vars): unknown {
    if (typeof value === 'string') return value.replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? '');
    if (Array.isArray(value)) return value.map((v) => this.fillDeep(v, vars));
    if (value && typeof value === 'object') {
      const out: AnyRecord = {};
      for (const [k, v] of Object.entries(value as AnyRecord)) out[k] = this.fillDeep(v, vars);
      return out;
    }
    return value;
  }

  protected async call(name: keyof RestEndpoints, vars: Vars, extraBody?: AnyRecord, responseType?: 'arraybuffer'): Promise<unknown> {
    const ep = this.require(name);
    const method = ep.method ?? 'GET';
    const url = this.fill(ep.path, vars);
    const params = ep.query ? (this.fillDeep(ep.query, vars) as AnyRecord) : undefined;
    const body = method === 'GET' ? undefined : { ...((this.fillDeep(ep.body ?? {}, vars) as AnyRecord) ?? {}), ...(extraBody ?? {}) };
    const res = await this.http.request<unknown>({ method, url, params, data: body, responseType });
    if (responseType === 'arraybuffer') return res.data;
    return ep.resultPath ? getPath(res.data, ep.resultPath) : res.data;
  }

  protected mapCustomer(obj: AnyRecord): ErpCustomer {
    const m = this.fieldMap.customer ?? {};
    const base = rowToCustomer(obj);
    const g = (k: keyof typeof m) => (m[k] ? getPath(obj, m[k]) : undefined);
    const contractId = toStr(g('contractId'));
    return {
      ...base,
      id: toStr(g('id')) ?? base.id,
      name: toStr(g('name')) ?? base.name,
      document: m.document ? toDocument(g('document')) : base.document,
      phone: m.phone ? toPhone(g('phone')) : base.phone,
      mobile: m.mobile ? toPhone(g('mobile')) : base.mobile,
      email: toStr(g('email')) ?? base.email,
      address: toStr(g('address')) ?? base.address,
      status: m.status ? toCustomerStatus(g('status')) : base.status,
      contracts: contractId ? [{ id: contractId, plan: toStr(g('plan')) }] : base.contracts,
      raw: obj,
    };
  }

  protected mapInvoice(obj: AnyRecord, customerId?: string): ErpInvoice {
    const m = this.fieldMap.invoice ?? {};
    const base = rowToInvoice(obj, { centavos: this.amountInCents });
    const g = (k: keyof typeof m) => (m[k] ? getPath(obj, m[k]) : undefined);
    const dueDate = m.dueDate ? toIsoDate(g('dueDate')) : base.dueDate;
    return {
      ...base,
      id: toStr(g('id')) ?? base.id,
      customerId: toStr(g('customerId')) ?? base.customerId ?? customerId ?? '',
      dueDate,
      amount: m.amount ? toAmount(g('amount'), this.amountInCents) : base.amount,
      status: m.status ? toInvoiceStatus(g('status'), dueDate) : base.status,
      digitableLine: toStr(g('digitableLine')) ?? base.digitableLine,
      barcode: toStr(g('barcode')) ?? base.barcode,
      pixCode: toStr(g('pixCode')) ?? base.pixCode,
      pdfUrl: toStr(g('pdfUrl')) ?? base.pdfUrl,
      raw: obj,
    };
  }

  async testConnection(): Promise<ErpTestResult> {
    const started = Date.now();
    try {
      if (this.endpoints.ping) await this.call('ping', {});
      else if (this.endpoints.findCustomerByDocument) {
        await this.call('findCustomerByDocument', { document: '00000000000', id: '00000000000' }).catch((err: ErpError) => {
          if (err.code === 'NOT_FOUND' || err.code === 'INVALID') return null;
          throw err;
        });
      } else await this.http.get('/');
      return { ok: true, message: this.defaults.testMessage ?? `Conexao com o ERP ${this.type} estabelecida`, latencyMs: Date.now() - started };
    } catch (err) {
      return { ok: false, message: (err as Error).message, latencyMs: Date.now() - started };
    }
  }

  protected firstObject(data: unknown): AnyRecord | null {
    const list = unwrapList(data);
    if (list.length) return list[0];
    const obj = unwrapObject(data);
    if (!obj) return null;
    // objeto vazio ou envelope sem dados
    return Object.keys(obj).length ? obj : null;
  }

  async findCustomerByDocument(document: string): Promise<ErpCustomer | null> {
    const doc = onlyDigits(document);
    if (!doc) return null;
    try {
      const data = await this.call('findCustomerByDocument', { document: doc, id: doc });
      const obj = this.firstObject(data);
      return obj ? this.mapCustomer(obj) : null;
    } catch (err) {
      if ((err as ErpError).code === 'NOT_FOUND') return null;
      throw err;
    }
  }

  async findCustomerByPhone(phone: string): Promise<ErpCustomer | null> {
    this.require('findCustomerByPhone');
    for (const v of phoneVariants(phone)) {
      if (!/^\d+$/.test(v)) continue;
      try {
        const data = await this.call('findCustomerByPhone', { phone: v, id: v, phoneE164: normalizePhoneBR(v) });
        const obj = this.firstObject(data);
        if (obj) return this.mapCustomer(obj);
      } catch (err) {
        if ((err as ErpError).code !== 'NOT_FOUND') throw err;
      }
    }
    return null;
  }

  async listOpenInvoices(customerId: string): Promise<ErpInvoice[]> {
    try {
      const data = await this.call('listOpenInvoices', { customerId, id: customerId });
      return unwrapList(data)
        .map((r) => this.mapInvoice(r, customerId))
        .filter((i) => i.status === 'open' || i.status === 'overdue');
    } catch (err) {
      if ((err as ErpError).code === 'NOT_FOUND') return [];
      throw err;
    }
  }

  async getInvoice(invoiceId: string): Promise<ErpInvoice | null> {
    try {
      const data = await this.call('getInvoice', { invoiceId, id: invoiceId });
      const obj = this.firstObject(data);
      return obj ? this.mapInvoice(obj) : null;
    } catch (err) {
      if ((err as ErpError).code === 'NOT_FOUND') return null;
      throw err;
    }
  }

  async getInvoicePdf(invoiceId: string): Promise<ErpDocument> {
    const filename = `boleto-${invoiceId}.pdf`;
    const raw = await this.call('getInvoicePdf', { invoiceId, id: invoiceId }, undefined, 'arraybuffer');
    const buf = Buffer.isBuffer(raw) ? raw : Buffer.from(raw as ArrayBuffer);
    const text = buf.toString('utf8');
    if (text.startsWith('%PDF')) return { filename, mimeType: 'application/pdf', base64: buf.toString('base64') };
    let json: unknown = null;
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
    if (json && typeof json === 'object') {
      const obj = this.firstObject(json) ?? (json as AnyRecord);
      const b64 =
        toStr(this.fieldMap.pdfBase64 ? getPath(json, this.fieldMap.pdfBase64) : undefined) ??
        toStr(pick(obj, 'pdf_base64', 'base64', 'pdf', 'arquivo', 'boleto'));
      if (b64 && b64.length > 100) return { filename, mimeType: 'application/pdf', base64: b64.replace(/^data:[^,]+,/, '') };
      const url =
        toStr(this.fieldMap.pdfUrl ? getPath(json, this.fieldMap.pdfUrl) : undefined) ??
        toStr(pick(obj, 'pdf_url', 'url', 'link', 'link_boleto', 'url_boleto'));
      if (url) {
        try {
          const dl = new HttpClient({ baseUrl: url, timeoutMs: this.opts.timeoutMs });
          const res = await dl.get<ArrayBuffer>('', { responseType: 'arraybuffer', headers: { Accept: 'application/pdf,*/*' } });
          return { filename, mimeType: 'application/pdf', base64: Buffer.from(res.data).toString('base64'), url };
        } catch {
          return { filename, mimeType: 'application/pdf', url };
        }
      }
    }
    const b64 = responseToBase64(text);
    if (b64) return { filename, mimeType: 'application/pdf', base64: b64 };
    throw new ErpNotFoundError('Boleto');
  }

  async createCustomer(data: ErpNewCustomer): Promise<ErpCustomer> {
    const doc = onlyDigits(data.document);
    const phone = normalizePhoneBR(data.phone);
    const vars: Vars = {
      name: data.name,
      document: doc,
      phone,
      email: data.email ?? '',
      address: data.address ?? '',
      city: data.city ?? '',
      state: data.state ?? '',
      zip: data.zip ? onlyDigits(data.zip) : '',
      notes: data.notes ?? '',
    };
    const ep = this.require('createCustomer');
    // sem body configurado, envia um payload padrao
    const extra = ep.body
      ? undefined
      : {
          name: data.name,
          nome: data.name,
          document: doc,
          cpf_cnpj: doc,
          phone,
          telefone: phone,
          email: data.email,
          address: data.address,
          endereco: data.address,
          city: data.city,
          cidade: data.city,
          state: data.state,
          uf: data.state,
          zip: vars.zip,
          cep: vars.zip,
          notes: data.notes,
          observacao: data.notes,
        };
    const resp = await this.call('createCustomer', vars, extra);
    const obj = this.firstObject(resp) ?? {};
    const id = toStr(this.fieldMap.createdId ? getPath(resp, this.fieldMap.createdId) : undefined) ?? toStr(pick(obj, 'id', 'customer_id', 'codigo', 'cliente_id'));
    if (!id) {
      const found = await this.findCustomerByDocument(doc).catch(() => null);
      if (found) return found;
      throw new ErpError('ERP nao retornou o id do cliente cadastrado', 'UNKNOWN', resp);
    }
    return { id, name: data.name, document: doc, mobile: phone, email: data.email, address: data.address, status: 'active', raw: obj };
  }

  async getConnectionStatus(customerId: string, contractId?: string): Promise<ErpConnectionStatus> {
    const data = await this.call('getConnectionStatus', { customerId, id: contractId ?? customerId, contractId: contractId ?? '' });
    const obj = this.firstObject(data);
    if (!obj) throw new ErpNotFoundError('Conexao');
    const m = this.fieldMap.connection ?? {};
    const g = (k: keyof typeof m, ...fallback: string[]) => (m[k] ? getPath(obj, m[k]) : pick(obj, ...fallback));
    return {
      customerId,
      contractId: toStr(g('contractId', 'contract_id', 'contrato', 'id_contrato')) ?? contractId,
      online: toBool(g('online', 'online', 'conectado', 'status_online')),
      blocked: toBool(g('blocked', 'blocked', 'bloqueado', 'bloqueio')),
      blockReason: toStr(g('blockReason', 'block_reason', 'motivo_bloqueio', 'motivo')),
      ip: toStr(g('ip', 'ip', 'ip_address')),
      lastSeen: toStr(g('lastSeen', 'last_seen', 'ultimo_acesso', 'ultima_conexao')),
    };
  }

  async unlockConnection(customerId: string, contractId?: string): Promise<{ ok: boolean; message?: string }> {
    try {
      const data = await this.call('unlockConnection', { customerId, id: contractId ?? customerId, contractId: contractId ?? '' });
      const obj = this.firstObject(data) ?? {};
      const okRaw = pick(obj, 'ok', 'success', 'sucesso', 'status');
      const ok = okRaw === undefined ? true : typeof okRaw === 'string' && /^(ok|success|sucesso|true|1)$/i.test(okRaw) ? true : toBool(okRaw);
      return { ok, message: toStr(pick(obj, 'message', 'mensagem', 'msg')) ?? (ok ? 'Desbloqueio realizado' : 'Nao foi possivel desbloquear') };
    } catch (err) {
      const e = err as ErpError;
      if (e.code === 'INVALID') return { ok: false, message: e.message };
      throw err;
    }
  }

  async openTicket(customerId: string, subject: string, description: string): Promise<{ id: string }> {
    const ep = this.require('openTicket');
    const extra = ep.body ? undefined : { customer_id: customerId, cliente_id: customerId, subject, assunto: subject, description, descricao: description };
    const data = await this.call('openTicket', { customerId, id: customerId, subject, description }, extra);
    const obj = this.firstObject(data) ?? {};
    const id = toStr(this.fieldMap.ticketId ? getPath(data, this.fieldMap.ticketId) : undefined) ?? toStr(pick(obj, 'id', 'ticket_id', 'protocolo', 'codigo'));
    return { id: toStrRequired(id, '0') };
  }

  async close(): Promise<void> {
    // sem recursos persistentes
  }
}
