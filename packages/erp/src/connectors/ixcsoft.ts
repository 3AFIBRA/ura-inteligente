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
import { ErpError, ErpNotFoundError, type ErpConnector, type ErpConnectorOptions, type ErpQueryName, type ErpTestResult } from '../types.js';
import { SqlGenericConnector, type SqlConnectorDeps } from './sql-generic.js';

export interface IxcConnectorDeps {
  http?: HttpClient;
}

interface IxcListResponse {
  page?: string | number;
  total?: string | number;
  registros?: AnyRecord[];
  type?: string;
  message?: string;
}

/**
 * IXCSoft - Webservice v1.
 * Auth Basic com `id:token` em base64; listagens via POST com header `ixcsoft: listar`.
 */
export class IxcsoftApiConnector implements ErpConnector {
  readonly type: ErpType = 'ixcsoft';
  readonly mode: ErpMode = 'api';
  private readonly http: HttpClient;
  private readonly cfg: Record<string, unknown>;

  constructor(
    private readonly opts: ErpConnectorOptions,
    deps: IxcConnectorDeps = {},
  ) {
    this.cfg = opts.config;
    const token = opts.secrets.token ?? opts.secrets.apiKey ?? '';
    if (!deps.http) {
      if (!opts.config.baseUrl) throw new ErpError('baseUrl do IXC nao informada', 'INVALID');
      if (!token) throw new ErpError('Token do IXC nao informado', 'INVALID');
    }
    // IXC usa Basic com base64(id:token). Aceita token ja em base64 (sem ':') ou no formato id:token.
    const basic = token.includes(':') ? Buffer.from(token, 'utf8').toString('base64') : token;
    this.http =
      deps.http ??
      new HttpClient({
        baseUrl: opts.config.baseUrl ?? '',
        timeoutMs: opts.timeoutMs,
        headers: { Authorization: `Basic ${basic}` },
      });
  }

  private str(key: string, def: string): string {
    const v = this.cfg[key];
    return typeof v === 'string' && v.trim() ? v.trim() : def;
  }

  private async list(resource: string, qtype: string, query: string, oper = '=', rp = 50, extra: AnyRecord = {}): Promise<AnyRecord[]> {
    const body = {
      qtype,
      query,
      oper,
      page: '1',
      rp: String(rp),
      sortname: `${resource}.id`,
      sortorder: 'desc',
      ...extra,
    };
    const res = await this.http.post<IxcListResponse>(`/${resource}`, body, { headers: { ixcsoft: 'listar' } });
    const data = res.data;
    if (data && typeof data === 'object' && data.type === 'error') {
      throw new ErpError(`IXC: ${data.message ?? 'erro na consulta'}`, 'UNKNOWN', data);
    }
    return unwrapList(data);
  }

  private mapCustomer(r: AnyRecord): ErpCustomer {
    const statusRaw = pick(r, 'status_internet', 'ativo');
    let status = toCustomerStatus(statusRaw);
    const ativo = toStr(r.ativo);
    if (ativo && ativo.toUpperCase() === 'N') status = 'cancelled';
    else if (statusRaw === 'CM' || statusRaw === 'CA' || statusRaw === 'FA') status = 'blocked';
    else if (statusRaw === 'A' || statusRaw === 'S') status = 'active';
    return {
      id: toStrRequired(r.id),
      name: toStrRequired(pick(r, 'razao', 'fantasia', 'nome')),
      document: toDocument(pick(r, 'cnpj_cpf', 'cpf_cnpj')),
      phone: toPhone(pick(r, 'telefone_comercial', 'fone')),
      mobile: toPhone(pick(r, 'telefone_celular', 'whatsapp')),
      email: toStr(r.email),
      address: [toStr(r.endereco), toStr(r.numero), toStr(r.bairro), toStr(r.cidade)].filter(Boolean).join(', ') || undefined,
      status,
      raw: r,
    };
  }

  private mapInvoice(r: AnyRecord): ErpInvoice {
    const dueDate = toIsoDate(pick(r, 'data_vencimento', 'vencimento'));
    return {
      id: toStrRequired(r.id),
      customerId: toStrRequired(pick(r, 'id_cliente')),
      dueDate,
      amount: toAmount(pick(r, 'valor_aberto', 'valor')),
      status: toInvoiceStatus(r.status, dueDate),
      digitableLine: toStr(pick(r, 'linha_digitavel')),
      barcode: toStr(pick(r, 'codigo_barras')),
      pixCode: toStr(pick(r, 'pix_qrcode', 'pix_copia_cola', 'pix_txid')),
      raw: r,
    };
  }

  async testConnection(): Promise<ErpTestResult> {
    const started = Date.now();
    try {
      await this.list('cliente', 'cliente.id', '0', '>', 1);
      return { ok: true, message: 'Conexao com o IXC estabelecida', latencyMs: Date.now() - started };
    } catch (err) {
      return { ok: false, message: (err as Error).message, latencyMs: Date.now() - started };
    }
  }

  async findCustomerByDocument(document: string): Promise<ErpCustomer | null> {
    const doc = onlyDigits(document);
    if (!doc) return null;
    // IXC armazena com mascara; tenta formatado e sem mascara
    const formatted = formatDocument(doc);
    for (const q of [formatted, doc]) {
      const rows = await this.list('cliente', 'cliente.cnpj_cpf', q, '=', 5);
      const row = rows.find((r) => toDocument(pick(r, 'cnpj_cpf')) === doc) ?? rows[0];
      if (row) return this.mapCustomer(row);
    }
    return null;
  }

  async findCustomerByPhone(phone: string): Promise<ErpCustomer | null> {
    const variants = phoneVariants(phone);
    const fields = ['cliente.telefone_celular', 'cliente.telefone_comercial', 'cliente.fone', 'cliente.whatsapp'];
    for (const field of fields) {
      for (const v of variants) {
        const rows = await this.list('cliente', field, v, 'L', 5);
        if (rows.length) return this.mapCustomer(rows[0]);
      }
    }
    return null;
  }

  async listOpenInvoices(customerId: string): Promise<ErpInvoice[]> {
    const rows = await this.list('fn_areceber', 'fn_areceber.id_cliente', customerId, '=', 100, {
      sortname: 'fn_areceber.data_vencimento',
      sortorder: 'asc',
      grid_param: JSON.stringify([{ TB: 'fn_areceber.status', OP: '=', P: 'A' }]),
    });
    return rows.map((r) => this.mapInvoice(r)).filter((i) => i.status === 'open' || i.status === 'overdue');
  }

  async getInvoice(invoiceId: string): Promise<ErpInvoice | null> {
    const rows = await this.list('fn_areceber', 'fn_areceber.id', invoiceId, '=', 1);
    return rows[0] ? this.mapInvoice(rows[0]) : null;
  }

  async getInvoicePdf(invoiceId: string): Promise<ErpDocument> {
    const endpoint = this.str('boletoEndpoint', '/get_boleto');
    const res = await this.http.post<unknown>(
      endpoint,
      {
        boletos: invoiceId,
        juro: 'N',
        multa: 'N',
        atualiza_boleto: 'S',
        tipo_boleto: 'arquivo',
        base64: 'S',
      },
      { responseType: 'arraybuffer', headers: { Accept: 'application/pdf,application/json,*/*' } },
    );
    const buf = Buffer.isBuffer(res.data) ? res.data : Buffer.from(res.data as ArrayBuffer);
    const asText = buf.toString('utf8');
    const filename = `boleto-${invoiceId}.pdf`;
    if (asText.startsWith('%PDF')) return { filename, mimeType: 'application/pdf', base64: buf.toString('base64') };
    // pode vir JSON {type:'error'} ou string base64
    try {
      const json = JSON.parse(asText) as AnyRecord;
      if (json.type === 'error') throw new ErpError(`IXC: ${String(json.message ?? 'erro ao gerar boleto')}`, 'UNKNOWN', json);
      const b64 = toStr(pick(json, 'base64', 'pdf', 'arquivo'));
      if (b64) return { filename, mimeType: 'application/pdf', base64: b64 };
    } catch (err) {
      if (err instanceof ErpError) throw err;
    }
    const b64 = responseToBase64(asText);
    if (b64) return { filename, mimeType: 'application/pdf', base64: b64 };
    throw new ErpNotFoundError('Boleto');
  }

  async createCustomer(data: ErpNewCustomer): Promise<ErpCustomer> {
    const doc = onlyDigits(data.document);
    const body: AnyRecord = {
      razao: data.name,
      fantasia: data.name,
      cnpj_cpf: formatDocument(doc),
      tipo_pessoa: doc.length === 14 ? 'J' : 'F',
      telefone_celular: normalizePhoneBR(data.phone).replace(/^55/, ''),
      whatsapp: normalizePhoneBR(data.phone).replace(/^55/, ''),
      email: data.email ?? '',
      endereco: data.address ?? '',
      cidade: data.city ?? '',
      uf: data.state ?? '',
      cep: data.zip ? onlyDigits(data.zip) : '',
      obs: data.notes ?? 'Cadastro via URA',
      ativo: 'S',
      ...(this.cfg.newCustomerDefaults && typeof this.cfg.newCustomerDefaults === 'object' ? (this.cfg.newCustomerDefaults as AnyRecord) : {}),
    };
    const res = await this.http.post<AnyRecord>('/cliente', body);
    const d = res.data ?? {};
    if (d.type === 'error') throw new ErpError(`IXC: ${String(d.message ?? 'erro ao cadastrar cliente')}`, 'INVALID', d);
    const id = toStr(pick(d, 'id', 'atualiza_campos.id'));
    if (!id) {
      const found = await this.findCustomerByDocument(doc);
      if (found) return found;
      throw new ErpError('IXC nao retornou o id do cliente cadastrado', 'UNKNOWN', d);
    }
    return { id, name: data.name, document: doc, mobile: normalizePhoneBR(data.phone), email: data.email, address: data.address, status: 'active', raw: d };
  }

  async getConnectionStatus(customerId: string, contractId?: string): Promise<ErpConnectionStatus> {
    const rows = contractId
      ? await this.list('radusuarios', 'radusuarios.id_contrato', contractId, '=', 5)
      : await this.list('radusuarios', 'radusuarios.id_cliente', customerId, '=', 5);
    const r = rows[0];
    if (!r) throw new ErpNotFoundError('Login de conexao');
    const online = toBool(r.online);
    const ativo = toStr(r.ativo)?.toUpperCase() !== 'N';
    return {
      customerId,
      contractId: toStr(r.id_contrato) ?? contractId,
      online,
      blocked: !ativo,
      blockReason: !ativo ? 'Login inativo/bloqueado' : undefined,
      ip: toStr(pick(r, 'ip', 'framedipaddress')),
      lastSeen: toStr(pick(r, 'ultima_conexao_final', 'ultima_conexao_inicial', 'ultima_conexao')),
    };
  }

  async unlockConnection(customerId: string, contractId?: string): Promise<{ ok: boolean; message?: string }> {
    const endpoint = this.str('unlockEndpoint', '/desbloqueio_confianca');
    let contract = contractId;
    if (!contract) {
      const contracts = await this.list('cliente_contrato', 'cliente_contrato.id_cliente', customerId, '=', 10);
      const active = contracts.find((c) => toStr(c.status)?.toUpperCase() === 'A') ?? contracts[0];
      contract = toStr(active?.id);
    }
    if (!contract) throw new ErpNotFoundError('Contrato');
    const res = await this.http.post<AnyRecord>(endpoint, { id: contract });
    const d = res.data ?? {};
    if (d.type === 'error') return { ok: false, message: String(d.message ?? 'Nao foi possivel desbloquear') };
    return { ok: true, message: toStr(d.message) ?? 'Desbloqueio de confianca realizado' };
  }

  async openTicket(customerId: string, subject: string, description: string): Promise<{ id: string }> {
    const body: AnyRecord = {
      id_cliente: customerId,
      titulo: subject,
      menssagem: description,
      id_assunto: this.str('ticketSubjectId', '1'),
      id_ticket_setor: this.str('ticketSectorId', '1'),
      origem_endereco: 'C',
      prioridade: 'M',
      status: 'N',
      tipo: 'C',
      ...(this.cfg.ticketDefaults && typeof this.cfg.ticketDefaults === 'object' ? (this.cfg.ticketDefaults as AnyRecord) : {}),
    };
    const res = await this.http.post<AnyRecord>('/su_ticket', body);
    const d = res.data ?? {};
    if (d.type === 'error') throw new ErpError(`IXC: ${String(d.message ?? 'erro ao abrir chamado')}`, 'INVALID', d);
    return { id: toStrRequired(pick(d, 'id'), '0') };
  }

  async close(): Promise<void> {
    // sem recursos persistentes
  }
}

export function formatDocument(doc: string): string {
  const d = onlyDigits(doc);
  if (d.length === 11) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  if (d.length === 14) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  return d;
}

/** Queries padrao para o banco MySQL do IXC. */
export const IXC_DEFAULT_QUERIES: Partial<Record<ErpQueryName, string>> = {
  find_customer_by_document: `SELECT c.id, c.razao AS name, c.cnpj_cpf AS document, c.telefone_comercial AS phone,
    c.telefone_celular AS mobile, c.email, CONCAT_WS(', ', c.endereco, c.numero, c.bairro, c.cidade) AS address,
    CASE WHEN c.ativo = 'N' THEN 'cancelled' ELSE 'active' END AS status
    FROM cliente c WHERE REPLACE(REPLACE(REPLACE(c.cnpj_cpf,'.',''),'-',''),'/','') = :document LIMIT 1`,
  find_customer_by_phone: `SELECT c.id, c.razao AS name, c.cnpj_cpf AS document, c.telefone_comercial AS phone,
    c.telefone_celular AS mobile, c.email, CONCAT_WS(', ', c.endereco, c.numero, c.bairro, c.cidade) AS address,
    CASE WHEN c.ativo = 'N' THEN 'cancelled' ELSE 'active' END AS status
    FROM cliente c WHERE REPLACE(REPLACE(REPLACE(REPLACE(c.telefone_celular,'(',''),')',''),'-',''),' ','') LIKE CONCAT('%', :phone)
      OR REPLACE(REPLACE(REPLACE(REPLACE(c.telefone_comercial,'(',''),')',''),'-',''),' ','') LIKE CONCAT('%', :phone)
      OR REPLACE(REPLACE(REPLACE(REPLACE(c.fone,'(',''),')',''),'-',''),' ','') LIKE CONCAT('%', :phone) LIMIT 1`,
  list_open_invoices: `SELECT f.id, f.id_cliente AS customer_id, f.data_vencimento AS due_date, f.valor AS amount, f.status,
    f.linha_digitavel AS digitable_line, f.codigo_barras AS barcode
    FROM fn_areceber f WHERE f.id_cliente = :customerId AND f.status = 'A' ORDER BY f.data_vencimento ASC`,
  get_invoice: `SELECT f.id, f.id_cliente AS customer_id, f.data_vencimento AS due_date, f.valor AS amount, f.status,
    f.linha_digitavel AS digitable_line, f.codigo_barras AS barcode
    FROM fn_areceber f WHERE f.id = :invoiceId LIMIT 1`,
  get_connection_status: `SELECT r.id_contrato AS contract_id, r.online, r.ip, r.ultima_conexao_inicial AS last_seen,
    CASE WHEN r.ativo = 'N' THEN 1 ELSE 0 END AS blocked
    FROM radusuarios r WHERE r.id_cliente = :customerId AND (:contractId IS NULL OR r.id_contrato = :contractId) LIMIT 1`,
};

export class IxcsoftDbConnector extends SqlGenericConnector {
  constructor(opts: ErpConnectorOptions, deps: SqlConnectorDeps = {}) {
    super({ ...opts, config: { dialect: 'mysql', port: 3306, ...opts.config } }, deps, IXC_DEFAULT_QUERIES);
  }
}
