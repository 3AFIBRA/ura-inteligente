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
 * SGP (TSMX) - API URA oficial.
 * Autenticacao por `token` + `app` enviados no corpo (form-urlencoded) de cada POST.
 * Doc: /api/ura/consultacliente/, /api/ura/fatura2via/, /api/ura/chamado/,
 *      /api/ura/liberacaopromessa/, /api/ura/verificaacesso/, /api/precadastro/{F|J}/
 */
export class SgpApiConnector implements ErpConnector {
  readonly type: ErpType = 'sgp';
  readonly mode: ErpMode = 'api';
  private readonly http: HttpClient;
  private readonly cfg: Record<string, unknown>;
  private readonly token: string;
  private readonly app: string;
  /** cache clienteId/cpfcnpj -> contratos (evita reconsultar para fatura2via/chamado) */
  private readonly contractsCache = new Map<string, AnyRecord[]>();
  private lastCustomerId: string | undefined;

  constructor(
    private readonly opts: ErpConnectorOptions,
    deps: SgpConnectorDeps = {},
  ) {
    this.cfg = opts.config;
    this.token = opts.secrets.token ?? opts.secrets.apiKey ?? '';
    this.app = (typeof opts.config.app === 'string' && opts.config.app) || opts.secrets.app || 'ura';
    if (!deps.http) {
      if (!opts.config.baseUrl) throw new ErpError('URL do SGP nao informada (ex.: https://suasempresa.sgp.net.br)', 'INVALID');
      if (!this.token) throw new ErpError('Token do SGP nao informado (SGP > Administracao > Integracoes > Tokens)', 'INVALID');
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

  private async post(endpoint: string, params: Record<string, string | number | undefined>): Promise<AnyRecord> {
    const form = new URLSearchParams({ token: this.token, app: this.app });
    for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') form.set(k, String(v));
    const res = await this.http.post<AnyRecord | string>(endpoint, form.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    const data = typeof res.data === 'string' ? safeJson(res.data) : (res.data ?? {});
    if (data && typeof data === 'object' && 'status' in data) {
      const status = Number(data.status);
      const msg = toStr(pick(data, 'msg', 'message')) ?? '';
      if (status === 0 && /token|autentica|autoriza|invalido/i.test(msg)) {
        throw new ErpError(`SGP: ${msg}`, 'AUTH', data);
      }
    }
    return (data ?? {}) as AnyRecord;
  }

  // ---------------------------------------------------------------- cliente

  private mapCustomer(doc: string, data: AnyRecord): ErpCustomer | null {
    const contracts = unwrapList(pick(data, 'contratos') ?? data);
    const first = contracts[0] ?? (data.razaoSocial || data.razao_social || data.nome ? data : null);
    if (!first) return null;
    const clientId = toStrRequired(pick(first, 'clienteId', 'cliente_id', 'idCliente', 'id'));
    const document = doc || onlyDigits(toStr(pick(first, 'cpfCnpj', 'cpfcnpj', 'cpf_cnpj')) ?? '');
    const customer: ErpCustomer = {
      id: clientId || document,
      name: toStrRequired(pick(first, 'razaoSocial', 'razao_social', 'nome', 'cliente')),
      document,
      phone: toPhone(pick(first, 'telefone', 'fone')),
      mobile: this.pickMobile(first),
      email: toStr(pick(first, 'email')),
      address: this.fullAddress(first),
      status: toCustomerStatus(pick(first, 'status', 'contratoStatusDisplay', 'contratoStatus')),
      contracts: contracts.map((c) => ({
        id: toStrRequired(pick(c, 'contratoId', 'contrato', 'id')),
        plan: toStr(pick(c, 'planoNome', 'plano', 'planointernet', 'servico')),
        status: toStr(pick(c, 'status', 'contratoStatusDisplay', 'contratoStatus')),
      })),
      raw: data,
    };
    // cacheia contratos para as demais acoes (fatura2via, chamado, liberacao)
    if (contracts.length > 0) {
      if (customer.id) this.contractsCache.set(customer.id, contracts);
      if (document) this.contractsCache.set(document, contracts);
    }
    return customer;
  }

  private pickMobile(rec: AnyRecord): string | undefined {
    const cargos = unwrapList(pick(rec, 'telefones_cargos', 'telefonesCargos'));
    for (const c of cargos) {
      const n = onlyDigits(toStr(pick(c, 'contato', 'telefone')) ?? '');
      if (n.length >= 11) return n;
    }
    return toPhone(pick(rec, 'celular', 'whatsapp', 'telefone'));
  }

  private fullAddress(rec: AnyRecord): string | undefined {
    const parts = [
      toStr(pick(rec, 'endereco_logradouro', 'enderecoLogradouro', 'logradouro')),
      toStr(pick(rec, 'endereco_numero', 'enderecoNumero', 'numero')),
      toStr(pick(rec, 'endereco_bairro', 'bairro')),
      toStr(pick(rec, 'endereco_cidade', 'cidade')),
      toStr(pick(rec, 'endereco_uf', 'uf')),
    ].filter(Boolean);
    return parts.length > 0 ? parts.join(', ') : toStr(pick(rec, 'endereco'));
  }

  /**
   * Resolve o contrato (necessario para fatura2via/chamado/liberacao).
   * Ordem: cache local -> consulta por documento -> trata o id como contrato.
   */
  private async resolveContract(customerId: string): Promise<string | null> {
    const d = onlyDigits(customerId);
    const cached = this.contractsCache.get(customerId) ?? this.contractsCache.get(d);
    if (cached?.length) return toStrRequired(pick(cached[0], 'contratoId', 'contrato', 'id')) || null;
    if (d.length === 11 || d.length === 14) {
      const data = await this.post(this.ep('customerEndpoint', '/api/ura/consultacliente/'), { cpfcnpj: d }).catch(() => null);
      const contracts = data ? unwrapList(pick(data, 'contratos')) : [];
      if (contracts.length > 0) {
        this.contractsCache.set(d, contracts);
        return toStrRequired(pick(contracts[0], 'contratoId', 'contrato', 'id')) || null;
      }
      return null;
    }
    // nao eh documento e nao temos cache: assume que o proprio id eh o contrato
    return customerId || null;
  }

  async testConnection(): Promise<ErpTestResult> {
    const started = Date.now();
    try {
      await this.post(this.ep('customerEndpoint', '/api/ura/consultacliente/'), { cpfcnpj: '00000000000' });
      return { ok: true, message: 'Conexao com o SGP estabelecida', latencyMs: Date.now() - started };
    } catch (err) {
      const e = err as ErpError;
      if (e.code === 'NOT_FOUND' || e.code === 'INVALID') return { ok: true, message: 'Conexao com o SGP estabelecida', latencyMs: Date.now() - started };
      return { ok: false, message: e.message, latencyMs: Date.now() - started };
    }
  }

  async findCustomerByDocument(document: string): Promise<ErpCustomer | null> {
    const doc = onlyDigits(document);
    if (!doc) return null;
    const data = await this.post(this.ep('customerEndpoint', '/api/ura/consultacliente/'), { cpfcnpj: doc });
    return this.mapCustomer(doc, data);
  }

  async findCustomerByPhone(phone: string): Promise<ErpCustomer | null> {
    const ep = this.ep('customerEndpoint', '/api/ura/consultacliente/');
    for (const v of phoneVariants(phone)) {
      if (!/^\d+$/.test(v)) continue;
      const data = await this.post(ep, { telefone: v }).catch(() => null);
      if (!data) continue;
      const c = this.mapCustomer('', data);
      if (c) return c;
    }
    return null;
  }

  // ---------------------------------------------------------------- faturas

  async listOpenInvoices(customerId: string): Promise<ErpInvoice[]> {
    this.lastCustomerId = customerId;
    const contrato = await this.resolveContract(customerId);
    if (!contrato) return [];
    const data = await this.post(this.ep('secondCopyEndpoint', '/api/ura/fatura2via/'), { contrato });
    const links = unwrapList(pick(data, 'links', 'faturas', 'titulos'));
    const invoices = links.map((r) => this.mapInvoice(customerId, r));
    // PIX copia-e-cola quando nao vem na resposta da fatura
    for (const inv of invoices) {
      if (!inv.pixCode && inv.raw?.id) {
        const pix = await this.getPixCode(String(inv.raw.id)).catch(() => undefined);
        if (pix) inv.pixCode = pix;
      }
    }
    return invoices;
  }

  private mapInvoice(customerId: string, r: AnyRecord): ErpInvoice {
    const dueDate = toIsoDate(pick(r, 'vencimento', 'dataVencimento', 'due_date'));
    const amount = toAmount(pick(r, 'valor', 'valorCorrigido', 'valor_total', 'amount'));
    const id = toStrRequired(pick(r, 'fatura', 'numeroDocumento', 'id', 'titulo')) || '0';
    return {
      id,
      customerId,
      dueDate,
      amount,
      status: toInvoiceStatus(pick(r, 'status', 'situacao'), dueDate, pick(r, 'pago')),
      digitableLine: toStr(pick(r, 'linhadigitavel', 'linhaDigitavel', 'linha_digitavel')),
      barcode: toStr(pick(r, 'codigoBarras', 'codigo_barras')),
      pixCode: toStr(pick(r, 'codigopix', 'codigoPix', 'pixCopiaECola', 'pix')),
      pdfUrl: toStr(pick(r, 'link', 'linkBoleto', 'url')),
      raw: r,
    };
  }

  /** PIX copia-e-cola via /api/ura/pagamento/pix/{id}/ (quando ausente na fatura). */
  private async getPixCode(invoiceRowId: string): Promise<string | undefined> {
    const ep = this.ep('pixEndpoint', `/api/ura/pagamento/pix/${invoiceRowId}/`);
    const data = await this.post(ep, {});
    return toStr(pick(data, 'pix', 'codigopix', 'pixCopiaECola'));
  }

  async getInvoice(invoiceId: string): Promise<ErpInvoice | null> {
    // formato aceito: "<customerId>" (primeira fatura) ou "<customerId>:<invoiceId>"
    let customerId = this.lastCustomerId;
    let id = invoiceId;
    if (invoiceId.includes(':')) [customerId, id] = invoiceId.split(':', 2);
    if (!customerId) throw new ErpNotSupportedError('get_invoice (SGP exige o cliente; use listOpenInvoices)');
    const list = await this.listOpenInvoices(customerId);
    return list.find((i) => i.id === id) ?? list[0] ?? null;
  }

  /** 2a via: o SGP retorna o link do boleto diretamente na fatura2via. */
  async getInvoicePdf(invoiceId: string): Promise<ErpDocument> {
    const invoice = await this.getInvoice(invoiceId);
    if (!invoice) throw new ErpNotFoundError('Fatura em aberto');
    if (invoice.pdfUrl) return { filename: `boleto-${invoice.id}.pdf`, mimeType: 'application/pdf', url: invoice.pdfUrl };
    // fallback: baixa o PDF direto do endpoint (algumas instalacoes geram PDF no POST)
    const ep = this.ep('secondCopyEndpoint', '/api/ura/fatura2via/');
    const contrato = await this.resolveContract(invoice.customerId);
    const res = await this.http.post<unknown>(
      ep,
      new URLSearchParams({ token: this.token, app: this.app, ...(contrato ? { contrato } : {}), formato: 'pdf' }).toString(),
      { responseType: 'arraybuffer', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/pdf,application/json,*/*' } },
    );
    const buf = Buffer.isBuffer(res.data) ? res.data : Buffer.from(res.data as ArrayBuffer);
    const text = buf.toString('utf8');
    if (text.startsWith('%PDF')) return { filename: `boleto-${invoiceId}.pdf`, mimeType: 'application/pdf', base64: buf.toString('base64') };
    const json = safeJson(text);
    if (json) {
      const url = toStr(pick(json, 'link', 'url', 'linkBoleto'));
      if (url) return { filename: `boleto-${invoiceId}.pdf`, mimeType: 'application/pdf', url };
      const b64 = toStr(pick(json, 'pdf', 'base64', 'arquivo', 'boleto'));
      if (b64 && b64.length > 100) return { filename: `boleto-${invoiceId}.pdf`, mimeType: 'application/pdf', base64: b64.replace(/^data:[^,]+,/, '') };
    }
    const b64 = responseToBase64(text);
    if (b64) return { filename: `boleto-${invoiceId}.pdf`, mimeType: 'application/pdf', base64: b64 };
    throw new ErpNotFoundError('Boleto');
  }

  // ---------------------------------------------------------------- cadastro

  /** Pre-cadastro via /api/precadastro/F/ (pessoa fisica) ou /api/precadastro/J/ (juridica). */
  async createCustomer(data: ErpNewCustomer): Promise<ErpCustomer> {
    const doc = onlyDigits(data.document);
    const isJuridica = doc.length === 14;
    const ep = this.ep(isJuridica ? 'createCustomerEndpointJ' : 'createCustomerEndpoint', isJuridica ? '/api/precadastro/J/' : '/api/precadastro/F/');
    const phone = normalizePhoneBR(data.phone);
    const planoId = toStr(this.cfg.planoId) ?? undefined;
    const resp = await this.post(ep, {
      nome: data.name,
      cpfcnpj: doc,
      email: data.email,
      plano_id: planoId,
      logradouro: data.address,
      cidade: data.city,
      uf: data.state,
      observacao: `${data.notes ? `${data.notes} ` : ''}Contato atraves da URA. Telefone: ${phone}`,
    });
    const err = toStr(pick(resp, 'error', 'erro'));
    if (err) throw new ErpError(`SGP: ${err}`, 'INVALID', resp);
    return {
      id: toStr(pick(resp, 'id', 'clienteId', 'precadastroId')) ?? doc,
      name: data.name,
      document: doc,
      mobile: phone,
      email: data.email,
      address: data.address,
      status: 'active',
      raw: resp,
    };
  }

  // ---------------------------------------------------------------- status / desbloqueio / chamado

  async getConnectionStatus(customerId: string, contractId?: string): Promise<ErpConnectionStatus> {
    const contrato = contractId ?? (await this.resolveContract(customerId));
    const contracts = this.contractsCache.get(customerId) ?? this.contractsCache.get(onlyDigits(customerId)) ?? [];
    const c = (contractId ? contracts.find((x) => toStr(pick(x, 'contratoId', 'contrato', 'id')) === contractId) : undefined) ?? contracts[0];
    let blocked = false;
    let blockReason: string | undefined;
    let online = false;
    if (c) {
      const statusTxt = String(pick(c, 'status', 'contratoStatusDisplay', 'contratoStatus') ?? '').toLowerCase();
      blocked = /bloq|suspen|reduc/.test(statusTxt) || toBool(pick(c, 'bloqueado'));
      if (blocked) blockReason = toStr(pick(c, 'status', 'contratoStatusDisplay', 'motivoBloqueio'));
    }
    if (contrato) {
      // verificaacesso: msg "Serviço Offline" => sem conexao
      const data = await this.post(this.ep('accessStatusEndpoint', '/api/ura/verificaacesso/'), { contrato }).catch(() => null);
      const msg = toStr(pick(data ?? {}, 'msg', 'message')) ?? '';
      online = !!msg && !/offline|indispon/i.test(msg);
    }
    return {
      customerId,
      contractId: contrato ?? undefined,
      online,
      blocked,
      blockReason,
      ip: toStr(pick(c ?? {}, 'ip', 'ipAddress')),
      lastSeen: toStr(pick(c ?? {}, 'ultimaConexao', 'ultimo_acesso')),
    };
  }

  /** Liberacao por confianca (promessa de pagamento): /api/ura/liberacaopromessa/. */
  async unlockConnection(customerId: string, contractId?: string): Promise<{ ok: boolean; message?: string }> {
    const contrato = contractId ?? (await this.resolveContract(customerId));
    if (!contrato) throw new ErpNotFoundError('Contrato');
    try {
      const data = await this.post(this.ep('unlockEndpoint', '/api/ura/liberacaopromessa/'), { contrato });
      const liberado = toBool(pick(data, 'liberado')) || Number(data.status) === 1;
      return { ok: liberado, message: toStr(pick(data, 'msg', 'message')) ?? (liberado ? 'Liberacao em confianca realizada' : 'Liberacao nao disponivel no momento') };
    } catch (err) {
      const e = err as ErpError;
      if (e.code === 'INVALID' || e.code === 'NOT_FOUND') return { ok: false, message: e.message };
      throw err;
    }
  }

  /** Abertura de chamado: /api/ura/chamado/ (contrato + conteudo). */
  async openTicket(customerId: string, subject: string, description: string): Promise<{ id: string }> {
    const contrato = await this.resolveContract(customerId);
    if (!contrato) throw new ErpNotFoundError('Contrato');
    const conteudo = description && subject && !description.startsWith(subject) ? `${subject}\n${description}` : (description || subject);
    const data = await this.post(this.ep('ticketEndpoint', '/api/ura/chamado/'), {
      contrato,
      conteudo,
      ...(toStr(this.cfg.ticketTypeId) ? { ocorrenciatipo: toStr(this.cfg.ticketTypeId) } : {}),
    });
    const protocolo = toStrRequired(pick(data, 'protocolo', 'id', 'chamadoId', 'ocorrenciaId'), '0');
    const ok = Number(data.status) === 1 || protocolo !== '0';
    if (!ok) throw new ErpError(toStr(pick(data, 'msg', 'message')) ?? 'SGP: falha ao abrir chamado', 'INVALID', data);
    return { id: protocolo };
  }

  async close(): Promise<void> {
    this.contractsCache.clear();
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
