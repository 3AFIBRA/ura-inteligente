import axios, { AxiosError, type AxiosInstance, type AxiosRequestConfig, type AxiosResponse } from 'axios';
import { ErpError } from '../types.js';

export interface HttpClientOptions {
  baseUrl: string;
  timeoutMs?: number;
  headers?: Record<string, string>;
  auth?: { username: string; password: string };
}

/**
 * Cliente HTTP fino sobre axios com timeout e traducao de erros para ErpError.
 */
export class HttpClient {
  readonly axios: AxiosInstance;

  constructor(opts: HttpClientOptions) {
    this.axios = axios.create({
      baseURL: opts.baseUrl.replace(/\/+$/, ''),
      timeout: opts.timeoutMs ?? 15000,
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', ...(opts.headers ?? {}) },
      auth: opts.auth,
      // nao lancar automaticamente: tratamos status manualmente
      validateStatus: () => true,
    });
  }

  async request<T = unknown>(cfg: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    let res: AxiosResponse<T>;
    try {
      res = await this.axios.request<T>(cfg);
    } catch (err) {
      throw translateAxiosError(err);
    }
    if (res.status >= 400) throw httpStatusToError(res.status, res.data, cfg.url);
    return res;
  }

  get<T = unknown>(url: string, cfg: AxiosRequestConfig = {}): Promise<AxiosResponse<T>> {
    return this.request<T>({ ...cfg, method: 'GET', url });
  }

  post<T = unknown>(url: string, data?: unknown, cfg: AxiosRequestConfig = {}): Promise<AxiosResponse<T>> {
    return this.request<T>({ ...cfg, method: 'POST', url, data });
  }

  put<T = unknown>(url: string, data?: unknown, cfg: AxiosRequestConfig = {}): Promise<AxiosResponse<T>> {
    return this.request<T>({ ...cfg, method: 'PUT', url, data });
  }
}

export function httpStatusToError(status: number, body: unknown, url?: string): ErpError {
  const detail = extractMessage(body);
  const where = url ? ` (${url})` : '';
  if (status === 401 || status === 403) {
    return new ErpError(`Falha de autenticacao no ERP${where}: ${detail || status}`, 'AUTH', body);
  }
  if (status === 404) return new ErpError(`Recurso nao encontrado no ERP${where}`, 'NOT_FOUND', body);
  if (status === 400 || status === 422) return new ErpError(`Requisicao invalida ao ERP${where}: ${detail || status}`, 'INVALID', body);
  if (status >= 500) return new ErpError(`Erro interno do ERP${where}: ${detail || status}`, 'CONNECTION', body);
  return new ErpError(`Erro HTTP ${status} no ERP${where}: ${detail}`, 'UNKNOWN', body);
}

export function translateAxiosError(err: unknown): ErpError {
  if (err instanceof ErpError) return err;
  if (axios.isAxiosError(err)) {
    const e = err as AxiosError;
    if (e.code === 'ECONNABORTED' || e.code === 'ETIMEDOUT') {
      return new ErpError('Tempo limite excedido ao conectar no ERP', 'CONNECTION', err);
    }
    if (e.response) return httpStatusToError(e.response.status, e.response.data, e.config?.url);
    return new ErpError(`Falha de conexao com o ERP: ${e.message}`, 'CONNECTION', err);
  }
  if (err instanceof Error) return new ErpError(err.message, 'UNKNOWN', err);
  return new ErpError('Erro desconhecido ao chamar o ERP', 'UNKNOWN', err);
}

function extractMessage(body: unknown): string {
  if (!body) return '';
  if (typeof body === 'string') return body.slice(0, 200);
  if (typeof body === 'object') {
    const b = body as Record<string, unknown>;
    for (const k of ['message', 'msg', 'error', 'erro', 'mensagem', 'detail']) {
      const v = b[k];
      if (typeof v === 'string') return v.slice(0, 200);
      if (v && typeof v === 'object' && typeof (v as Record<string, unknown>).message === 'string') {
        return String((v as Record<string, unknown>).message).slice(0, 200);
      }
    }
  }
  return '';
}

/** Converte um corpo de resposta (arraybuffer, string ou objeto) em base64 de PDF quando possivel. */
export function responseToBase64(data: unknown): string | undefined {
  if (!data) return undefined;
  if (Buffer.isBuffer(data)) return data.toString('base64');
  if (data instanceof ArrayBuffer) return Buffer.from(data).toString('base64');
  if (typeof data === 'string') {
    if (data.startsWith('%PDF')) return Buffer.from(data, 'binary').toString('base64');
    if (/^data:application\/pdf;base64,/.test(data)) return data.split(',')[1];
    if (/^[A-Za-z0-9+/=\r\n]+$/.test(data) && data.length > 100) return data.replace(/\s+/g, '');
  }
  return undefined;
}
