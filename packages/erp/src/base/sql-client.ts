import type { DbDialect } from '@ura/shared';
import { ErpError } from '../types.js';

export interface SqlClientOptions {
  dialect: DbDialect;
  host: string;
  port?: number;
  database: string;
  user: string;
  password?: string;
  ssl?: boolean;
  timeoutMs?: number;
}

export type SqlRow = Record<string, unknown>;

export interface SqlQueryResult {
  rows: SqlRow[];
  /** id gerado em INSERT quando o driver informa (mysql insertId) */
  insertId?: string | number;
  rowCount?: number;
}

/**
 * Interface minima de acesso a banco usada pelos conectores.
 * Permite substituir a implementacao real por mocks em testes.
 */
export interface SqlClient {
  readonly dialect: DbDialect;
  query(sql: string, params?: Record<string, unknown>): Promise<SqlQueryResult>;
  close(): Promise<void>;
}

/**
 * Converte placeholders nomeados (`:nome`) para o formato do dialeto e devolve a lista
 * ordenada de valores. Ignora `::cast` do Postgres e literais entre aspas simples.
 */
export function bindNamedParams(
  sql: string,
  params: Record<string, unknown>,
  dialect: DbDialect,
): { text: string; values: unknown[]; names: string[] } {
  const values: unknown[] = [];
  const names: string[] = [];
  const pgIndex = new Map<string, number>();
  let out = '';
  let i = 0;
  while (i < sql.length) {
    const ch = sql[i];
    // literal entre aspas simples: copia ate fechar
    if (ch === "'") {
      let j = i + 1;
      while (j < sql.length) {
        if (sql[j] === "'" && sql[j + 1] === "'") {
          j += 2;
          continue;
        }
        if (sql[j] === "'") break;
        j++;
      }
      out += sql.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    if (ch === ':' && sql[i + 1] !== ':' && (i === 0 || sql[i - 1] !== ':')) {
      const m = /^:([a-zA-Z_][a-zA-Z0-9_]*)/.exec(sql.slice(i));
      if (m) {
        const name = m[1];
        if (!(name in params)) {
          throw new ErpError(`Parametro ":${name}" nao informado para a query`, 'INVALID');
        }
        if (dialect === 'postgres') {
          let idx = pgIndex.get(name);
          if (idx === undefined) {
            values.push(params[name]);
            names.push(name);
            idx = values.length;
            pgIndex.set(name, idx);
          }
          out += `$${idx}`;
        } else if (dialect === 'mssql') {
          if (!names.includes(name)) {
            names.push(name);
            values.push(params[name]);
          }
          out += `@${name}`;
        } else {
          values.push(params[name]);
          names.push(name);
          out += '?';
        }
        i += m[0].length;
        continue;
      }
    }
    if (ch === ':' && sql[i + 1] === ':') {
      out += '::';
      i += 2;
      continue;
    }
    out += ch;
    i++;
  }
  return { text: out, values, names };
}

function normalizeRows(rows: unknown): SqlRow[] {
  if (!Array.isArray(rows)) return [];
  return rows.filter((r) => r && typeof r === 'object') as SqlRow[];
}

function toDbError(err: unknown): ErpError {
  if (err instanceof ErpError) return err;
  const e = err as { code?: string; message?: string };
  const msg = e?.message ?? String(err);
  const code = String(e?.code ?? '');
  if (/auth|password|denied|28P01|ER_ACCESS_DENIED|ELOGIN/i.test(code + ' ' + msg)) {
    return new ErpError(`Falha de autenticacao no banco do ERP: ${msg}`, 'AUTH', err);
  }
  if (/ECONNREFUSED|ETIMEDOUT|ENOTFOUND|EHOSTUNREACH|timeout|ESOCKET|ECONNRESET/i.test(code + ' ' + msg)) {
    return new ErpError(`Falha de conexao com o banco do ERP: ${msg}`, 'CONNECTION', err);
  }
  return new ErpError(`Erro ao consultar o banco do ERP: ${msg}`, 'UNKNOWN', err);
}

abstract class BaseSqlClient implements SqlClient {
  constructor(
    readonly dialect: DbDialect,
    protected readonly opts: SqlClientOptions,
  ) {}
  abstract query(sql: string, params?: Record<string, unknown>): Promise<SqlQueryResult>;
  abstract close(): Promise<void>;
}

class PostgresClient extends BaseSqlClient {
  private pool: import('pg').Pool | null = null;

  private async getPool() {
    if (!this.pool) {
      const pg = await import('pg');
      const Pool = (pg.default ?? pg).Pool;
      this.pool = new Pool({
        host: this.opts.host,
        port: this.opts.port ?? 5432,
        database: this.opts.database,
        user: this.opts.user,
        password: this.opts.password,
        ssl: this.opts.ssl ? { rejectUnauthorized: false } : undefined,
        max: 5,
        connectionTimeoutMillis: this.opts.timeoutMs ?? 10000,
        statement_timeout: this.opts.timeoutMs ?? 10000,
      });
    }
    return this.pool;
  }

  async query(sql: string, params: Record<string, unknown> = {}): Promise<SqlQueryResult> {
    try {
      const pool = await this.getPool();
      const { text, values } = bindNamedParams(sql, params, 'postgres');
      const res = await pool.query(text, values);
      return { rows: normalizeRows(res.rows), rowCount: res.rowCount ?? undefined };
    } catch (err) {
      throw toDbError(err);
    }
  }

  async close() {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
    }
  }
}

class MysqlClient extends BaseSqlClient {
  private pool: import('mysql2/promise').Pool | null = null;

  private async getPool() {
    if (!this.pool) {
      const mysql = await import('mysql2/promise');
      this.pool = mysql.createPool({
        host: this.opts.host,
        port: this.opts.port ?? 3306,
        database: this.opts.database,
        user: this.opts.user,
        password: this.opts.password,
        ssl: this.opts.ssl ? { rejectUnauthorized: false } : undefined,
        connectionLimit: 5,
        connectTimeout: this.opts.timeoutMs ?? 10000,
      });
    }
    return this.pool;
  }

  async query(sql: string, params: Record<string, unknown> = {}): Promise<SqlQueryResult> {
    try {
      const pool = await this.getPool();
      const { text, values } = bindNamedParams(sql, params, 'mysql');
      const [result] = await pool.query({ sql: text, values, timeout: this.opts.timeoutMs ?? 10000 });
      if (Array.isArray(result)) return { rows: normalizeRows(result), rowCount: result.length };
      const header = result as { insertId?: number; affectedRows?: number };
      return { rows: [], insertId: header.insertId, rowCount: header.affectedRows };
    } catch (err) {
      throw toDbError(err);
    }
  }

  async close() {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
    }
  }
}

class MssqlClient extends BaseSqlClient {
  private pool: import('mssql').ConnectionPool | null = null;

  private async getPool() {
    if (!this.pool) {
      const mssql = await import('mssql');
      const sql = mssql.default ?? mssql;
      const pool = new sql.ConnectionPool({
        server: this.opts.host,
        port: this.opts.port ?? 1433,
        database: this.opts.database,
        user: this.opts.user,
        password: this.opts.password,
        connectionTimeout: this.opts.timeoutMs ?? 10000,
        requestTimeout: this.opts.timeoutMs ?? 10000,
        options: { encrypt: !!this.opts.ssl, trustServerCertificate: true },
        pool: { max: 5 },
      });
      await pool.connect();
      this.pool = pool;
    }
    return this.pool;
  }

  async query(sql: string, params: Record<string, unknown> = {}): Promise<SqlQueryResult> {
    try {
      const pool = await this.getPool();
      const { text, values, names } = bindNamedParams(sql, params, 'mssql');
      const req = pool.request();
      names.forEach((n, idx) => req.input(n, values[idx] as never));
      const res = await req.query(text);
      return { rows: normalizeRows(res.recordset ?? []), rowCount: res.rowsAffected?.[0] };
    } catch (err) {
      throw toDbError(err);
    }
  }

  async close() {
    if (this.pool) {
      await this.pool.close();
      this.pool = null;
    }
  }
}

export function createSqlClient(opts: SqlClientOptions): SqlClient {
  if (!opts.host) throw new ErpError('Host do banco de dados nao informado', 'INVALID');
  if (!opts.database) throw new ErpError('Nome do banco de dados nao informado', 'INVALID');
  switch (opts.dialect) {
    case 'postgres':
      return new PostgresClient('postgres', opts);
    case 'mysql':
      return new MysqlClient('mysql', opts);
    case 'mssql':
      return new MssqlClient('mssql', opts);
    default:
      throw new ErpError(`Dialeto de banco nao suportado: ${String(opts.dialect)}`, 'INVALID');
  }
}

/** Query leve para teste de conexao conforme dialeto. */
export function pingQuery(dialect: DbDialect): string {
  return 'SELECT 1 AS ok';
}
