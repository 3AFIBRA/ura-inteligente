import type { ErpConnectionStatus, ErpCustomer, ErpDocument, ErpInvoice, ErpMode, ErpNewCustomer, ErpType } from '@ura/shared';
import { normalizePhoneBR, onlyDigits } from '@ura/shared';
import { HttpClient, responseToBase64 } from '../base/http-client.js';
import {
  type AnyRecord,
  phoneVariants,
  pick,
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
} from '../base/mappers.js';
import { ErpError, ErpNotFoundError, type ErpConnector, type ErpConnectorOptions, type ErpTestResult } from '../types.js';

export interface HubsoftConnectorDeps {
  http?: HttpClient;
  now?: () => number;
}

interface TokenResponse {
  access_token: string;
  token_type?: string;
  expires_in?: number;
}

/**
 * HubSoft - API de integracao com OAuth2 (password grant ou client_credentials).
 */
export class HubsoftApiConnector implements ErpConnector {
  readonly type: ErpType = 'hubsoft';
  readonly mode: ErpMode = 'api';
  private readonly http: HttpClient;
  private readonly cfg: Record<string, unknown>;
  private readonly now: () => number;
  private token: { value: string; expiresAt: number } | null = null;
  private tokenPromise: Promise<string> | null = null;

  constructor(
    private readonly opts: ErpConnectorOptions,
    deps: HubsoftConnectorDeps = {},
  ) {
    this.cfg = opts.config;
    this.now = deps.now ?? (() => Date.now());
    if (!deps.http) {
      if (!opts.config.baseUrl) throw new ErpError('baseUrl do HubSoft nao informada', 'INVALID');
      if (!opts.secrets.clientId || !opts.secrets.clientSecret) throw new ErpError('clientId/clientSecret do HubSoft nao informados', 'INVALID');
    }
    this.http = deps.http ?? new HttpClient({ baseUrl: opts.config.baseUrl ?? '', timeoutMs: opts.timeoutMs });
  }

  private ep(key: string, def: string): string {
    const v = this.cfg[key];
    return typeof v === 'string' && v.trim() ? v.trim() : def;
  }

  /** Obtem (e cacheia) o access token OAuth2. */
  async getToken(): Promise<string> {
    if (this.token && this.token.expiresAt - 30_000 > this.now()) return this.token.value;
    if (this.tokenPromise) return this.tokenPromise;
    this.tokenPromise = (async () => {
      const s = this.opts.secrets;
      const grant = s.username && s.password ? 'password' : 'client_credentials';
      const body: AnyRecord = {
        grant_type: grant,
        client_id: s.clientId,
        client_secret: s.clientSecret,
      };
      if (grant === 'password') {
        body.username = s.username;
        body.password = s.password;
      }
      let res;
      try {
        res = await this.http.post<TokenResponse>(this.ep('tokenEndpoint', '/oauth/token'), body);
      } catch (err) {
        const e = err as ErpError;
        if (e.code === 'INVALID' || e.code === 'AUTH') throw new ErpError(`Falha na autenticacao OAuth2 do HubSoft: ${e.message}`, 'AUTH', err);
        throw err;
      }
      const data = res.data;
      if (!data?.access_token) throw new ErpError('HubSoft nao retornou access_token', 'AUTH', data);
      const ttl = (Number(data.expires_in) || 3600) * 1000;
      this.token = { value: data.access_token, expiresAt: this.now() + ttl };
      return data.access_token;
    })();
    try {
      return await this.tokenPromise;
    } finally {
      this.tokenPromise = null;
    }
  }

  private async authed<T = AnyRecord>(method: 'GET' | 'POST', url: string, data?: unknown, params?: AnyRecord, responseType?: 'arraybuffer') {
    const token = await this.getToken();
    const doReq = (tk: string) =>
      this.http.request<T>({ method, url, data, params, responseType, headers: { Authorization: `Bearer ${tk}` } });
    try {
      return await doReq(token);
    } catch (err) {
      const e = err as ErpError;
      if (e.code === 'AUTH' && this.token) {
        // token pode ter sido revogado: renova uma vez
        this.token = null;
        const fresh = await this.getToken();
        return doReq(fresh);
      }
      throw err;
    }
  }

  private mapCustomer(r: AnyRecord): ErpCustomer {
    const services = unwrapList(pick(r, 'servicos') ?? []);
    const phones = unwrapList(pick(r, 'telefones') ?? []);
    const phone = toStr(pick(r, 'telefone_primario', 'telefone')) ?? toStr(pick(phones[0] ?? {}, 'numero'));
    const mobile = toStr(pick(r, 'telefone_secundario', 'celular')) ?? toStr(pick(phones[1] ?? {}, 'numero'));
    const firstService = services[0];
    return {
      id: toStrRequired(pick(r, 'id_cliente', 'id')),
      name: toStrRequired(pick(r, 'nome_razaosocial', 'nome', 'razao_social')),
      document: toDocument(pick(r, 'cpf_cnpj', 'documento')),
      phone: toPhone(phone),
      mobile: toPhone(mobile),
      email: toStr(pick(r, 'email_principal', 'email')),
      address: toStr(pick(firstService ?? {}, 'endereco_instalacao.endereco_completo', 'endereco')) ?? toStr(pick(r, 'endereco')),
      status: services.length
        ? toCustomerStatus(pick(firstService, 'status_prefixo', 'status'))
        : toCustomerStatus(pick(r, 'status', 'ativo')),
      contracts: services.map((s) => ({
        id: toStrRequired(pick(s, 'id_cliente_servico', 'id')),
        plan: toStr(pick(s, 'nome', 'plano', 'servico.nome')),
        status: toStr(pick(s, 'status', 'status_prefixo')),
      })),
      raw: r,
    };
  }

  private mapInvoice(r: AnyRecord, customerId: string): ErpInvoice {
    const dueDate = toIsoDate(pick(r, 'data_vencimento', 'vencimento'));
    const statusRaw = pick(r, 'status', 'status_prefixo');
    return {
      id: toStrRequired(pick(r, 'id_fatura', 'id')),
      customerId: toStr(pick(r, 'id_cliente', 'cliente.id_cliente')) ?? customerId,
      dueDate,
      amount: toAmount(pick(r, 'valor', 'valor_total')),
      status: toInvoiceStatus(statusRaw, dueDate, pick(r, 'pago')),
      digitableLine: toStr(pick(r, 'linha_digitavel', 'codigo_linha_digitavel')),
      barcode: toStr(pick(r, 'codigo_barras')),
      pixCode: toStr(pick(r, 'pix_copia_cola', 'pix.copia_cola', 'pix_qrcode', 'qrcode_pix')),
      pdfUrl: toStr(pick(r, 'link', 'url_boleto', 'link_boleto')),
      raw: r,
    };
  }

  async testConnection(): Promise<ErpTestResult> {
    const started = Date.now();
    try {
      await this.getToken();
      return { ok: true, message: 'Autenticacao no HubSoft realizada', latencyMs: Date.now() - started };
    } catch (err) {
      return { ok: false, message: (err as Error).message, latencyMs: Date.now() - started };
    }
  }

  private async queryCustomer(busca: string, termo: string): Promise<AnyRecord[]> {
    const res = await this.authed<AnyRecord>('GET', this.ep('customerEndpoint', '/api/v1/integracao/cliente'), undefined, {
      busca,
      termo_busca: termo,
      limit: 5,
    });
    const d = res.data ?? {};
    if (d.status === 'error') return [];
    return unwrapList(pick(d, 'clientes', 'data') ?? d);
  }

  async findCustomerByDocument(document: string): Promise<ErpCustomer | null> {
    const doc = onlyDigits(document);
    if (!doc) return null;
    const rows = await this.queryCustomer('cpf_cnpj', doc);
    return rows[0] ? this.mapCustomer(rows[0]) : null;
  }

  async findCustomerByPhone(phone: string): Promise<ErpCustomer | null> {
    for (const v of phoneVariants(phone)) {
      if (!/^\d+$/.test(v)) continue;
      const rows = await this.queryCustomer('telefone', v);
      if (rows[0]) return this.mapCustomer(rows[0]);
    }
    return null;
  }

  private customerParams(customerId: string): AnyRecord {
    const d = onlyDigits(customerId);
    if (d.length === 11 || d.length === 14) return { busca: 'cpf_cnpj', termo_busca: d };
    return { busca: 'id_cliente', termo_busca: customerId };
  }

  async listOpenInvoices(customerId: string): Promise<ErpInvoice[]> {
    const res = await this.authed<AnyRecord>('GET', this.ep('invoicesEndpoint', '/api/v1/integracao/cliente/financeiro'), undefined, {
      ...this.customerParams(customerId),
      apenas_pendente: 'sim',
    });
    const d = res.data ?? {};
    if (d.status === 'error') {
      if (/nao encontrado|não encontrado/i.test(String(d.msg ?? ''))) return [];
      throw new ErpError(`HubSoft: ${String(d.msg ?? 'erro ao listar faturas')}`, 'UNKNOWN', d);
    }
    const rows = unwrapList(pick(d, 'faturas', 'data') ?? d);
    return rows.map((r) => this.mapInvoice(r, customerId)).filter((i) => i.status === 'open' || i.status === 'overdue');
  }

  async getInvoice(invoiceId: string): Promise<ErpInvoice | null> {
    const res = await this.authed<AnyRecord>('GET', this.ep('invoicesEndpoint', '/api/v1/integracao/cliente/financeiro'), undefined, {
      busca: 'id_fatura',
      termo_busca: invoiceId,
    });
    const d = res.data ?? {};
    if (d.status === 'error') return null;
    const rows = unwrapList(pick(d, 'faturas', 'data') ?? d);
    const r = rows.find((x) => toStr(pick(x, 'id_fatura', 'id')) === invoiceId) ?? rows[0];
    return r ? this.mapInvoice(r, '') : null;
  }

  async getInvoicePdf(invoiceId: string): Promise<ErpDocument> {
    const filename = `boleto-${invoiceId}.pdf`;
    const ep = this.ep('secondCopyEndpoint', '/api/v1/integracao/cliente/financeiro/boleto');
    const res = await this.authed<unknown>('GET', ep, undefined, { id_fatura: invoiceId, formato: 'base64' }, 'arraybuffer');
    const buf = Buffer.isBuffer(res.data) ? res.data : Buffer.from(res.data as ArrayBuffer);
    const text = buf.toString('utf8');
    if (text.startsWith('%PDF')) return { filename, mimeType: 'application/pdf', base64: buf.toString('base64') };
    let json: AnyRecord | null = null;
    try {
      json = JSON.parse(text) as AnyRecord;
    } catch {
      json = null;
    }
    if (json) {
      if (json.status === 'error') throw new ErpError(`HubSoft: ${String(json.msg ?? 'erro ao gerar boleto')}`, 'INVALID', json);
      const items = unwrapList(pick(json, 'boletos', 'faturas', 'data') ?? []);
      const first = items[0] ?? json;
      const b64 = toStr(pick(first, 'base64', 'pdf', 'arquivo', 'boleto_base64'));
      if (b64 && b64.length > 100) return { filename, mimeType: 'application/pdf', base64: b64.replace(/^data:[^,]+,/, '') };
      const url = toStr(pick(first, 'link', 'url', 'link_boleto', 'url_boleto'));
      if (url) return { filename, mimeType: 'application/pdf', url };
    }
    const b64 = responseToBase64(text);
    if (b64) return { filename, mimeType: 'application/pdf', base64: b64 };
    throw new ErpNotFoundError('Boleto');
  }

  async createCustomer(data: ErpNewCustomer): Promise<ErpCustomer> {
    const doc = onlyDigits(data.document);
    const body: AnyRecord = {
      nome_razaosocial: data.name,
      cpf_cnpj: doc,
      tipo_pessoa: doc.length === 14 ? 'pj' : 'pf',
      telefone_primario: normalizePhoneBR(data.phone).replace(/^55/, ''),
      email_principal: data.email,
      observacao: data.notes ?? 'Cadastro via URA',
      endereco: data.address
        ? { logradouro: data.address, cidade: data.city, estado: data.state, cep: data.zip ? onlyDigits(data.zip) : undefined }
        : undefined,
      origem: 'ura',
      ...(this.cfg.newCustomerDefaults && typeof this.cfg.newCustomerDefaults === 'object' ? (this.cfg.newCustomerDefaults as AnyRecord) : {}),
    };
    const res = await this.authed<AnyRecord>('POST', this.ep('prospectEndpoint', '/api/v1/integracao/prospecto'), body);
    const d = res.data ?? {};
    if (d.status === 'error') throw new ErpError(`HubSoft: ${String(d.msg ?? 'erro ao cadastrar prospecto')}`, 'INVALID', d);
    const id = toStr(pick(d, 'prospecto.id_prospecto', 'id_prospecto', 'data.id_prospecto', 'id')) ?? doc;
    return { id, name: data.name, document: doc, mobile: normalizePhoneBR(data.phone), email: data.email, address: data.address, status: 'active', raw: d };
  }

  async getConnectionStatus(customerId: string, contractId?: string): Promise<ErpConnectionStatus> {
    const res = await this.authed<AnyRecord>('GET', this.ep('serviceStatusEndpoint', '/api/v1/integracao/cliente/servico'), undefined, {
      ...this.customerParams(customerId),
      ...(contractId ? { id_cliente_servico: contractId } : {}),
    });
    const d = res.data ?? {};
    if (d.status === 'error') throw new ErpNotFoundError('Servico');
    const services = unwrapList(pick(d, 'servicos', 'data') ?? d);
    const s = (contractId ? services.find((x) => toStr(pick(x, 'id_cliente_servico', 'id')) === contractId) : undefined) ?? services[0];
    if (!s) throw new ErpNotFoundError('Servico');
    const statusTxt = String(pick(s, 'status_prefixo', 'status') ?? '').toLowerCase();
    const blocked = /bloq|suspen|reduc/.test(statusTxt);
    return {
      customerId,
      contractId: toStr(pick(s, 'id_cliente_servico', 'id')) ?? contractId,
      online: toBool(pick(s, 'online', 'conexao.online', 'status_conexao')),
      blocked,
      blockReason: blocked ? toStr(pick(s, 'status', 'motivo_bloqueio')) : undefined,
      ip: toStr(pick(s, 'ip', 'conexao.ip', 'login.ip')),
      lastSeen: toStr(pick(s, 'ultima_conexao', 'conexao.ultima_conexao')),
    };
  }

  async unlockConnection(customerId: string, contractId?: string): Promise<{ ok: boolean; message?: string }> {
    let contract = contractId;
    if (!contract) {
      const st = await this.getConnectionStatus(customerId).catch(() => null);
      contract = st?.contractId;
    }
    const body: AnyRecord = { ...this.customerParams(customerId) };
    if (contract) body.id_cliente_servico = contract;
    try {
      const res = await this.authed<AnyRecord>('POST', this.ep('unlockEndpoint', '/api/v1/integracao/cliente/financeiro/desbloqueio'), body);
      const d = res.data ?? {};
      if (d.status === 'error') return { ok: false, message: String(d.msg ?? 'Nao foi possivel desbloquear') };
      return { ok: true, message: toStr(d.msg) ?? 'Desbloqueio de confianca realizado' };
    } catch (err) {
      const e = err as ErpError;
      if (e.code === 'INVALID') return { ok: false, message: e.message };
      throw err;
    }
  }

  async openTicket(customerId: string, subject: string, description: string): Promise<{ id: string }> {
    const body: AnyRecord = {
      ...this.customerParams(customerId),
      descricao: `${subject}\n\n${description}`,
      id_tipo_atendimento: toStr(this.cfg.ticketTypeId) ?? 1,
      ...(this.cfg.ticketDefaults && typeof this.cfg.ticketDefaults === 'object' ? (this.cfg.ticketDefaults as AnyRecord) : {}),
    };
    const res = await this.authed<AnyRecord>('POST', this.ep('ticketEndpoint', '/api/v1/integracao/cliente/atendimento'), body);
    const d = res.data ?? {};
    if (d.status === 'error') throw new ErpError(`HubSoft: ${String(d.msg ?? 'erro ao abrir atendimento')}`, 'INVALID', d);
    return { id: toStrRequired(pick(d, 'atendimento.id_atendimento', 'id_atendimento', 'protocolo', 'id'), '0') };
  }

  async close(): Promise<void> {
    this.token = null;
  }
}
