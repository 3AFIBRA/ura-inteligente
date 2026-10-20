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
import { ErpError, ErpNotFoundError, ErpNotSupportedError, type ErpConnector, type ErpConnectorOptions, type ErpQueryName, type ErpTestResult } from '../types.js';
import { SqlGenericConnector, type SqlConnectorDeps } from './sql-generic.js';

export interface SgpConnectorDeps {
  http?: HttpClient;
}

/**
 * SGP (TSMX) - API URA.
 * Autenticacao por `token` + `app` enviados no corpo (form-urlencoded) de cada POST.
 * Endpoints padrao: /api/ura/consultacliente/, /api/ura/titulos/, /api/ura/segundavia/, /api/ura/liberacaopromessa/.
 */
export class SgpApiConnector implements ErpConnector {
  readonly type: ErpType = 'sgp';
  readonly mode: ErpMode = 'api';
  private readonly http: HttpClient;
  private readonly cfg: Record<string, unknown>;
  private readonly token: string;
  private readonly app: string;
  private lastCustomerId: string | undefined;

  constructor(
    private readonly opts: ErpConnectorOptions,
    deps: SgpConnectorDeps = {},
  ) {
    this.cfg = opts.config;
    this.token = opts.secrets.token ?? opts.secrets.apiKey ?? '';
    this.app = (typeof opts.config.app === 'string' && opts.config.app) || opts.secrets.app || 'ura';
    if (!deps.http) {
      if (!opts.config.baseUrl) throw new ErpError('baseUrl do SGP nao informada', 'INVALID');
      if (!this.token) throw new ErpError('Token do SGP nao informado', 'INVALID');
    }
    this.http =
      deps.http ??
      new HttpClient({
        baseUrl: opts.config.baseUrl ?? '',
        timeoutMs: opts.timeoutMs,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });
  }

  private ep(key: string, def: string): string {
    const v = this.cfg[key];
    return typeof v === 'string' && v.trim() ? v.trim() : def;
  }

  private async post(endpoint: string, params: Record<string, string | undefined>): Promise<AnyRecord> {
    const form = new URLSearchParams({ token: this.token, app: this.app });
    for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') form.set(k, v);
    const res = await this.http.post<AnyRecord | string>(endpoint, form.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    const data = typeof res.data === 'string' ? safeJson(res.data) : (res.data ?? {});
    if (data && typeof data === 'object' && 'status' in data && Number(data.status) === 0) {
      const msg = toStr(pick(data, 'msg', 'message')) ?? 'erro';
      if (/token|autentica|autoriza/i.test(msg)) throw new ErpError(`SGP: ${msg}`, 'AUTH', data);
      if (/nao encontrado|não encontrado|inexistente/i.test(msg)) return { ...data, __notFound: true };
      throw new ErpError(`SGP: ${msg}`, 'INVALID', data);
    }
    return data as AnyRecord;
  }

  private mapCustomer(doc: string, data: AnyRecord): ErpCustomer | null {
    const contracts = unwrapList(pick(data, 'contratos') ?? data);
    const first = contracts[0] ?? (data.razaoSocial || data.nome ? data : null);
    if (!first) return null;
    const clientId = toStr(pick(first, 'clienteId', 'cliente_id', 'idCliente', 'id'));
    return {
      id: clientId ?? doc,
      name: toStrRequired(pick(first, 'razaoSocial', 'nome', 'razao_social', 'cliente')),
      document: doc || toDocument(pick(first, 'cpfcnpj', 'cpf_cnpj')),
      phone: toPhone(pick(first, 'telefone', 'fone')),
      mobile: toPhone(pick(first, 'celular', 'telefoneCelular', 'whatsapp')),
      email: toStr(pick(first, 'email')),
      address: toStr(pick(first, 'endereco', 'enderecoLogradouro')),
      status: toCustomerStatus(pick(first, 'contratoStatusDisplay', 'contratoStatus', 'status')),
      contracts: contracts.map((c) => ({
        id: toStrRequired(pick(c, 'contratoId', 'contrato', 'id')),
        plan: toStr(pick(c, 'planoNome', 'plano', 'servico')),
        status: toStr(pick(c, 'contratoStatusDisplay', 'contratoStatus', 'status')),
      })),
      raw: data,
    };
  }

  private mapInvoice(customerId: string, r: AnyRecord): ErpInvoice {
    const dueDate = toIsoDate(pick(r, 'vencimento', 'dataVencimento', 'due_date'));
    return {
      id: toStrRequired(pick(r, 'numeroDocumento', 'numero_documento', 'id', 'titulo', 'fatura')),
      customerId,
      dueDate,
      amount: toAmount(pick(r, 'valorCorrigido', 'valor_corrigido', 'valor', 'amount')),
      status: toInvoiceStatus(pick(r, 'status', 'situacao'), dueDate, pick(r, 'pago')),
      digitableLine: toStr(pick(r, 'linhaDigitavel', 'linha_digitavel')),
      barcode: toStr(pick(r, 'codigoBarras', 'codigo_barras')),
      pixCode: toStr(pick(r, 'codigoPix', 'pixCopiaECola', 'pix', 'qrCodePix')),
      pdfUrl: toStr(pick(r, 'link', 'linkBoleto', 'url', 'pdf_url')),
      raw: r,
    };
  }

  async testConnection(): Promise<ErpTestResult> {
    const started = Date.now();
    try {
      // consulta com documento invalido: valida token/url sem expor dados
      await this.post(this.ep('customerEndpoint', '/api/ura/consultacliente/'), { cpfcnpj: '00000000000' });
      return { ok: true, message: 'Conexao com o SGP estabelecida', latencyMs: Date.now() - started };
    } catch (err) {
      const e = err as ErpError;
      if (e.code === 'INVALID' || e.code === 'NOT_FOUND') {
        return { ok: true, message: 'Conexao com o SGP estabelecida', latencyMs: Date.now() - started };
      }
      return { ok: false, message: e.message, latencyMs: Date.now() - started };
    }
  }

  async findCustomerByDocument(document: string): Promise<ErpCustomer | null> {
    const doc = onlyDigits(document);
    if (!doc) return null;
    const data = await this.post(this.ep('customerEndpoint', '/api/ura/consultacliente/'), { cpfcnpj: doc });
    if (data.__notFound) return null;
    return this.mapCustomer(doc, data);
  }

  async findCustomerByPhone(phone: string): Promise<ErpCustomer | null> {
    const ep = this.ep('customerEndpoint', '/api/ura/consultacliente/');
    for (const v of phoneVariants(phone)) {
      if (!/^\d+$/.test(v)) continue;
      const data = await this.post(ep, { telefone: v }).catch((err: ErpError) => {
        if (err.code === 'INVALID') return { __notFound: true } as AnyRecord;
        throw err;
      });
      if (data.__notFound) continue;
      const c = this.mapCustomer('', data);
      if (c) return c;
    }
    return null;
  }

  /** O SGP identifica o cliente por CPF/CNPJ; aceitamos id numerico de cliente ou o documento. */
  private async resolveDocument(customerId: string): Promise<{ cpfcnpj?: string; clienteId?: string }> {
    const d = onlyDigits(customerId);
    if (d.length === 11 || d.length === 14) return { cpfcnpj: d };
    return { clienteId: customerId };
  }

  async listOpenInvoices(customerId: string): Promise<ErpInvoice[]> {
    this.lastCustomerId = customerId;
    const ident = await this.resolveDocument(customerId);
    const data = await this.post(this.ep('invoicesEndpoint', '/api/ura/titulos/'), {
      cpfcnpj: ident.cpfcnpj,
      clienteId: ident.clienteId,
      ...(this.cfg.contractId ? { contrato: String(this.cfg.contractId) } : {}),
    });
    if (data.__notFound) return [];
    const rows = unwrapList(pick(data, 'titulos', 'faturas') ?? data);
    return rows.map((r) => this.mapInvoice(customerId, r)).filter((i) => i.status === 'open' || i.status === 'overdue');
  }

  async getInvoice(invoiceId: string): Promise<ErpInvoice | null> {
    // A API URA do SGP lista titulos por cliente; sem o cliente nao ha busca direta pelo id.
    // Aceita o formato "<customerId>:<invoiceId>" ou usa o ultimo cliente consultado nesta instancia.
    let customerId = this.lastCustomerId;
    let id = invoiceId;
    if (invoiceId.includes(':')) [customerId, id] = invoiceId.split(':', 2);
    if (!customerId) throw new ErpNotSupportedError('get_invoice (SGP exige o cliente; use listOpenInvoices)');
    const list = await this.listOpenInvoices(customerId);
    return list.find((i) => i.id === id) ?? null;
  }

  async getInvoicePdf(invoiceId: string): Promise<ErpDocument> {
    const ep = this.ep('secondCopyEndpoint', '/api/ura/segundavia/');
    const filename = `boleto-${invoiceId}.pdf`;
    const res = await this.http.post<unknown>(
      ep,
      new URLSearchParams({ token: this.token, app: this.app, titulo: invoiceId, numeroDocumento: invoiceId, formato: 'pdf' }).toString(),
      { responseType: 'arraybuffer', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/pdf,application/json,*/*' } },
    );
    const buf = Buffer.isBuffer(res.data) ? res.data : Buffer.from(res.data as ArrayBuffer);
    const text = buf.toString('utf8');
    if (text.startsWith('%PDF')) return { filename, mimeType: 'application/pdf', base64: buf.toString('base64') };
    const json = safeJson(text);
    if (json) {
      if (Number(json.status) === 0) throw new ErpError(`SGP: ${toStr(pick(json, 'msg')) ?? 'erro na segunda via'}`, 'INVALID', json);
      const b64 = toStr(pick(json, 'pdf', 'base64', 'arquivo', 'boleto'));
      if (b64 && b64.length > 100) return { filename, mimeType: 'application/pdf', base64: b64.replace(/^data:[^,]+,/, '') };
      const url = toStr(pick(json, 'link', 'url', 'linkBoleto'));
      if (url) return { filename, mimeType: 'application/pdf', url };
    }
    const b64 = responseToBase64(text);
    if (b64) return { filename, mimeType: 'application/pdf', base64: b64 };
    throw new ErpNotFoundError('Boleto');
  }

  async createCustomer(data: ErpNewCustomer): Promise<ErpCustomer> {
    const ep = typeof this.cfg.createCustomerEndpoint === 'string' ? this.cfg.createCustomerEndpoint : '';
    if (!ep) throw new ErpNotSupportedError('createCustomer (configure createCustomerEndpoint, ex.: /api/ura/prospecto/)');
    const doc = onlyDigits(data.document);
    const resp = await this.post(ep, {
      nome: data.name,
      cpfcnpj: doc,
      telefone: normalizePhoneBR(data.phone),
      email: data.email,
      endereco: data.address,
      cidade: data.city,
      uf: data.state,
      cep: data.zip ? onlyDigits(data.zip) : undefined,
      observacao: data.notes,
    });
    return {
      id: toStr(pick(resp, 'id', 'clienteId', 'prospectoId')) ?? doc,
      name: data.name,
      document: doc,
      mobile: normalizePhoneBR(data.phone),
      email: data.email,
      address: data.address,
      status: 'active',
      raw: resp,
    };
  }

  async getConnectionStatus(customerId: string, contractId?: string): Promise<ErpConnectionStatus> {
    const ident = await this.resolveDocument(customerId);
    const data = await this.post(this.ep('customerEndpoint', '/api/ura/consultacliente/'), {
      cpfcnpj: ident.cpfcnpj,
      clienteId: ident.clienteId,
    });
    if (data.__notFound) throw new ErpNotFoundError('Cliente');
    const contracts = unwrapList(pick(data, 'contratos') ?? data);
    const c = (contractId ? contracts.find((x) => toStr(pick(x, 'contratoId', 'contrato', 'id')) === contractId) : undefined) ?? contracts[0];
    if (!c) throw new ErpNotFoundError('Contrato');
    const statusTxt = String(pick(c, 'contratoStatusDisplay', 'contratoStatus', 'status') ?? '').toLowerCase();
    const blocked = /bloq|suspen|reduc/.test(statusTxt) || toBool(pick(c, 'bloqueado'));
    return {
      customerId,
      contractId: toStr(pick(c, 'contratoId', 'contrato', 'id')),
      online: toBool(pick(c, 'online', 'conectado')),
      blocked,
      blockReason: blocked ? toStr(pick(c, 'contratoStatusDisplay', 'motivoBloqueio')) : undefined,
      ip: toStr(pick(c, 'ip', 'ipAddress')),
      lastSeen: toStr(pick(c, 'ultimaConexao', 'ultimo_acesso')),
    };
  }

  async unlockConnection(customerId: string, contractId?: string): Promise<{ ok: boolean; message?: string }> {
    let contract = contractId;
    if (!contract) {
      const st = await this.getConnectionStatus(customerId);
      contract = st.contractId;
    }
    if (!contract) throw new ErpNotFoundError('Contrato');
    const ident = await this.resolveDocument(customerId);
    try {
      const data = await this.post(this.ep('unlockEndpoint', '/api/ura/liberacaopromessa/'), {
        contrato: contract,
        cpfcnpj: ident.cpfcnpj,
      });
      return { ok: true, message: toStr(pick(data, 'msg', 'message')) ?? 'Liberacao em confianca realizada' };
    } catch (err) {
      const e = err as ErpError;
      if (e.code === 'INVALID') return { ok: false, message: e.message };
      throw err;
    }
  }

  async openTicket(customerId: string, subject: string, description: string): Promise<{ id: string }> {
    const ep = this.ep('ticketEndpoint', '/api/ura/chamado/');
    const ident = await this.resolveDocument(customerId);
    const data = await this.post(ep, {
      cpfcnpj: ident.cpfcnpj,
      clienteId: ident.clienteId,
      assunto: subject,
      descricao: description,
      ocorrenciatipo: toStr(this.cfg.ticketTypeId),
    });
    return { id: toStrRequired(pick(data, 'id', 'chamadoId', 'ocorrenciaId', 'protocolo'), '0') };
  }

  async close(): Promise<void> {
    // sem recursos persistentes
  }
}

function safeJson(text: string): AnyRecord | null {
  try {
    const v = JSON.parse(text);
    return v && typeof v === 'object' ? (v as AnyRecord) : null;
  } catch {
    return null;
  }
}

/** Queries padrao para o banco PostgreSQL do SGP (tabelas configuraveis via config.queries). */
export const SGP_DEFAULT_QUERIES: Partial<Record<ErpQueryName, string>> = {
  find_customer_by_document: `SELECT c.id, c.nome AS name, c.cpfcnpj AS document, c.fone AS phone, c.celular AS mobile,
    c.email, c.endereco AS address, 'active' AS status
    FROM cliente c WHERE regexp_replace(c.cpfcnpj, '\\D', '', 'g') = :document LIMIT 1`,
  find_customer_by_phone: `SELECT c.id, c.nome AS name, c.cpfcnpj AS document, c.fone AS phone, c.celular AS mobile,
    c.email, c.endereco AS address, 'active' AS status
    FROM cliente c WHERE regexp_replace(COALESCE(c.celular,''), '\\D', '', 'g') LIKE '%' || :phone
      OR regexp_replace(COALESCE(c.fone,''), '\\D', '', 'g') LIKE '%' || :phone LIMIT 1`,
  list_open_invoices: `SELECT t.id, t.cliente_id AS customer_id, t.datavencimento AS due_date, t.valor AS amount,
    CASE WHEN t.datapagamento IS NULL THEN 'open' ELSE 'paid' END AS status, t.linhadigitavel AS digitable_line,
    t.codigobarras AS barcode, t.pixcopiaecola AS pix_code
    FROM fn_titulo t WHERE t.cliente_id = :customerId AND t.datapagamento IS NULL AND COALESCE(t.cancelado,false) = false
    ORDER BY t.datavencimento ASC`,
  get_invoice: `SELECT t.id, t.cliente_id AS customer_id, t.datavencimento AS due_date, t.valor AS amount,
    CASE WHEN t.datapagamento IS NULL THEN 'open' ELSE 'paid' END AS status, t.linhadigitavel AS digitable_line,
    t.codigobarras AS barcode, t.pixcopiaecola AS pix_code
    FROM fn_titulo t WHERE t.id = :invoiceId LIMIT 1`,
};

export class SgpDbConnector extends SqlGenericConnector {
  constructor(opts: ErpConnectorOptions, deps: SqlConnectorDeps = {}) {
    super({ ...opts, config: { dialect: 'postgres', port: 5432, ...opts.config } }, deps, SGP_DEFAULT_QUERIES);
  }
}
