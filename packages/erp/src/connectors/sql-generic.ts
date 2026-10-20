import type { ErpConnectionStatus, ErpCustomer, ErpDocument, ErpInvoice, ErpMode, ErpNewCustomer, ErpType } from '@ura/shared';
import { normalizePhoneBR, onlyDigits } from '@ura/shared';
import { HttpClient } from '../base/http-client.js';
import { phoneVariants, pick, rowToCustomer, rowToInvoice, toBool, toStr, toStrRequired } from '../base/mappers.js';
import { createSqlClient, type SqlClient, type SqlRow } from '../base/sql-client.js';
import {
  ErpError,
  ErpNotFoundError,
  ErpNotSupportedError,
  type ErpConnector,
  type ErpConnectorOptions,
  type ErpQueryName,
  type ErpTestResult,
} from '../types.js';

export interface SqlConnectorDeps {
  /** permite injetar um client (testes) */
  client?: SqlClient;
}

/**
 * Conector SQL generico: todas as operacoes sao queries configuradas em `config.queries`
 * usando placeholders nomeados (`:document`, `:phone`, `:customerId`, `:invoiceId`, `:name`, ...).
 * Conectores especificos em modo `database` herdam desta classe fornecendo queries padrao.
 */
export class SqlGenericConnector implements ErpConnector {
  readonly type: ErpType;
  readonly mode: ErpMode = 'database';
  protected readonly client: SqlClient;
  protected readonly queries: Partial<Record<ErpQueryName, string>>;
  protected readonly amountInCents: boolean;

  constructor(
    protected readonly opts: ErpConnectorOptions,
    deps: SqlConnectorDeps = {},
    defaultQueries: Partial<Record<ErpQueryName, string>> = {},
  ) {
    this.type = opts.type;
    const cfg = opts.config;
    const dialect = cfg.dialect ?? 'postgres';
    this.client =
      deps.client ??
      createSqlClient({
        dialect,
        host: cfg.host ?? '',
        port: cfg.port ? Number(cfg.port) : undefined,
        database: cfg.database ?? '',
        user: cfg.user ?? opts.secrets.username ?? '',
        password: opts.secrets.password,
        ssl: !!cfg.ssl,
        timeoutMs: opts.timeoutMs,
      });
    this.queries = { ...defaultQueries, ...(cfg.queries ?? {}) };
    this.amountInCents = cfg.amountInCents === true || cfg.amountInCents === 'true';
  }

  protected requireQuery(name: ErpQueryName): string {
    const q = this.queries[name];
    if (!q || !q.trim()) throw new ErpNotSupportedError(name);
    return q;
  }

  protected async run(name: ErpQueryName, params: Record<string, unknown>) {
    const sql = this.requireQuery(name);
    return this.client.query(sql, params);
  }

  /** Parametros base disponiveis em todas as queries (chaves ausentes nao podem ser referenciadas). */
  protected baseParams(extra: Record<string, unknown>): Record<string, unknown> {
    return { ...extra };
  }

  async testConnection(): Promise<ErpTestResult> {
    const started = Date.now();
    try {
      await this.client.query('SELECT 1 AS ok');
      return { ok: true, message: 'Conexao com o banco de dados estabelecida', latencyMs: Date.now() - started };
    } catch (err) {
      const e = err as ErpError;
      return { ok: false, message: e.message ?? 'Falha ao conectar no banco', latencyMs: Date.now() - started };
    }
  }

  protected mapCustomer(row: SqlRow): ErpCustomer {
    return rowToCustomer(row);
  }

  protected mapInvoice(row: SqlRow): ErpInvoice {
    return rowToInvoice(row, { centavos: this.amountInCents });
  }

  async findCustomerByDocument(document: string): Promise<ErpCustomer | null> {
    const doc = onlyDigits(document);
    if (!doc) return null;
    const res = await this.run('find_customer_by_document', this.baseParams({ document: doc }));
    const row = res.rows[0];
    return row ? this.mapCustomer(row) : null;
  }

  async findCustomerByPhone(phone: string): Promise<ErpCustomer | null> {
    const variants = phoneVariants(phone);
    if (!variants.length) return null;
    this.requireQuery('find_customer_by_phone');
    for (const v of variants) {
      const res = await this.run(
        'find_customer_by_phone',
        this.baseParams({ phone: v, phoneDigits: onlyDigits(v), phoneE164: normalizePhoneBR(v) }),
      );
      const row = res.rows[0];
      if (row) return this.mapCustomer(row);
    }
    return null;
  }

  async listOpenInvoices(customerId: string): Promise<ErpInvoice[]> {
    const res = await this.run('list_open_invoices', this.baseParams({ customerId }));
    return res.rows.map((r) => this.mapInvoice(r)).filter((i) => i.status === 'open' || i.status === 'overdue');
  }

  async getInvoice(invoiceId: string): Promise<ErpInvoice | null> {
    const res = await this.run('get_invoice', this.baseParams({ invoiceId }));
    const row = res.rows[0];
    return row ? this.mapInvoice(row) : null;
  }

  async getInvoicePdf(invoiceId: string): Promise<ErpDocument> {
    const filename = `boleto-${invoiceId}.pdf`;
    let row: SqlRow | undefined;
    if (this.queries.get_invoice_pdf) {
      const res = await this.run('get_invoice_pdf', this.baseParams({ invoiceId }));
      row = res.rows[0];
    } else if (this.queries.get_invoice) {
      const res = await this.run('get_invoice', this.baseParams({ invoiceId }));
      row = res.rows[0];
    } else {
      throw new ErpNotSupportedError('get_invoice_pdf');
    }
    if (!row) throw new ErpNotFoundError('Boleto');
    const b64 = toStr(pick(row, 'pdf_base64', 'base64', 'pdf'));
    if (b64) return { filename, mimeType: 'application/pdf', base64: b64.replace(/^data:[^,]+,/, '') };
    const buf = pick(row, 'pdf_blob', 'arquivo');
    if (Buffer.isBuffer(buf)) return { filename, mimeType: 'application/pdf', base64: buf.toString('base64') };
    const url = toStr(pick(row, 'pdf_url', 'url', 'link', 'link_boleto'));
    if (url) {
      const base64 = await this.downloadPdf(url);
      return { filename, mimeType: 'application/pdf', base64, url };
    }
    throw new ErpError('A query de boleto nao retornou pdf_url nem pdf_base64', 'INVALID');
  }

  protected async downloadPdf(url: string): Promise<string> {
    const http = new HttpClient({ baseUrl: url, timeoutMs: this.opts.timeoutMs });
    const res = await http.get<ArrayBuffer>('', { responseType: 'arraybuffer', headers: { Accept: 'application/pdf,*/*' } });
    return Buffer.from(res.data).toString('base64');
  }

  async createCustomer(data: ErpNewCustomer): Promise<ErpCustomer> {
    const params = this.baseParams({
      name: data.name,
      document: onlyDigits(data.document),
      phone: normalizePhoneBR(data.phone),
      email: data.email ?? null,
      address: data.address ?? null,
      city: data.city ?? null,
      state: data.state ?? null,
      zip: data.zip ? onlyDigits(data.zip) : null,
      notes: data.notes ?? null,
    });
    const res = await this.run('create_customer', params);
    let id = toStr(pick(res.rows[0] ?? {}, 'id', 'customer_id', 'codigo'));
    if (!id && res.insertId !== undefined) id = String(res.insertId);
    if (!id) {
      // tenta recuperar o id gerado conforme dialeto
      const dialect = this.client.dialect;
      const sql =
        dialect === 'mysql' ? 'SELECT LAST_INSERT_ID() AS id' : dialect === 'mssql' ? 'SELECT SCOPE_IDENTITY() AS id' : null;
      if (sql) {
        try {
          const r = await this.client.query(sql);
          id = toStr(pick(r.rows[0] ?? {}, 'id'));
        } catch {
          // ignora
        }
      }
    }
    if (!id) {
      const found = await this.findCustomerByDocument(data.document).catch(() => null);
      if (found) return found;
      throw new ErpError('Cliente criado, mas nao foi possivel obter o id gerado', 'UNKNOWN');
    }
    return {
      id,
      name: data.name,
      document: onlyDigits(data.document),
      phone: normalizePhoneBR(data.phone),
      email: data.email,
      address: data.address,
      status: 'active',
    };
  }

  async getConnectionStatus(customerId: string, contractId?: string): Promise<ErpConnectionStatus> {
    const res = await this.run('get_connection_status', this.baseParams({ customerId, contractId: contractId ?? null }));
    const row = res.rows[0];
    if (!row) throw new ErpNotFoundError('Conexao');
    return {
      customerId,
      contractId: toStr(pick(row, 'contract_id', 'contrato', 'id_contrato')) ?? contractId,
      online: toBool(pick(row, 'online', 'conectado', 'status_online')),
      blocked: toBool(pick(row, 'blocked', 'bloqueado', 'bloqueio')),
      blockReason: toStr(pick(row, 'block_reason', 'motivo_bloqueio', 'motivo')),
      ip: toStr(pick(row, 'ip', 'framedipaddress', 'ip_address')),
      lastSeen: toStr(pick(row, 'last_seen', 'ultimo_acesso', 'acctstarttime')),
    };
  }

  async unlockConnection(customerId: string, contractId?: string): Promise<{ ok: boolean; message?: string }> {
    const res = await this.run('unlock_connection', this.baseParams({ customerId, contractId: contractId ?? null }));
    const row = res.rows[0];
    const ok = row ? toBool(pick(row, 'ok', 'success', 'sucesso') ?? true) : (res.rowCount ?? 1) > 0;
    return { ok, message: toStr(pick(row ?? {}, 'message', 'mensagem')) ?? (ok ? 'Desbloqueio realizado' : 'Nao foi possivel desbloquear') };
  }

  async openTicket(customerId: string, subject: string, description: string): Promise<{ id: string }> {
    const res = await this.run('open_ticket', this.baseParams({ customerId, subject, description }));
    let id = toStr(pick(res.rows[0] ?? {}, 'id', 'ticket_id', 'codigo'));
    if (!id && res.insertId !== undefined) id = String(res.insertId);
    return { id: toStrRequired(id, '0') };
  }

  async close(): Promise<void> {
    await this.client.close();
  }
}
