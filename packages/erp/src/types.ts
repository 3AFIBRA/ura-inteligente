import type {
  DbDialect,
  ErpConnectionStatus,
  ErpCustomer,
  ErpDocument,
  ErpInvoice,
  ErpMode,
  ErpNewCustomer,
  ErpType,
} from '@ura/shared';

/** Configuracao nao sensivel persistida em ErpConnection.config */
export interface ErpConfig {
  /** API */
  baseUrl?: string;
  /** Banco */
  dialect?: DbDialect;
  host?: string;
  port?: number;
  database?: string;
  user?: string;
  ssl?: boolean;
  /** Mapeamento de queries para o conector SQL generico ou override em conectores especificos */
  queries?: Partial<Record<ErpQueryName, string>>;
  /** Campos adicionais especificos de cada conector */
  [key: string]: unknown;
}

/** Credenciais (armazenadas criptografadas) */
export interface ErpSecrets {
  password?: string;
  token?: string;
  apiKey?: string;
  clientId?: string;
  clientSecret?: string;
  username?: string;
  /** campos extras */
  [key: string]: string | undefined;
}

export type ErpQueryName =
  | 'find_customer_by_document'
  | 'find_customer_by_phone'
  | 'list_open_invoices'
  | 'get_invoice'
  | 'get_invoice_pdf'
  | 'create_customer'
  | 'get_connection_status'
  | 'unlock_connection'
  | 'open_ticket';

export interface ErpConnectorOptions {
  type: ErpType;
  mode: ErpMode;
  config: ErpConfig;
  secrets: ErpSecrets;
  /** timeout em ms para chamadas externas */
  timeoutMs?: number;
}

export interface ErpTestResult {
  ok: boolean;
  message: string;
  latencyMs?: number;
}

/**
 * Interface comum a todos os conectores de ERP.
 * Metodos opcionais devem lancar ErpNotSupportedError quando o ERP nao suporta.
 */
export interface ErpConnector {
  readonly type: ErpType;
  readonly mode: ErpMode;

  testConnection(): Promise<ErpTestResult>;

  findCustomerByDocument(document: string): Promise<ErpCustomer | null>;
  findCustomerByPhone(phone: string): Promise<ErpCustomer | null>;

  listOpenInvoices(customerId: string): Promise<ErpInvoice[]>;
  getInvoice(invoiceId: string): Promise<ErpInvoice | null>;
  /** PDF do boleto (base64 ou URL) */
  getInvoicePdf(invoiceId: string): Promise<ErpDocument>;

  createCustomer(data: ErpNewCustomer): Promise<ErpCustomer>;

  getConnectionStatus(customerId: string, contractId?: string): Promise<ErpConnectionStatus>;
  /** desbloqueio de confianca */
  unlockConnection(customerId: string, contractId?: string): Promise<{ ok: boolean; message?: string }>;

  openTicket(customerId: string, subject: string, description: string): Promise<{ id: string }>;

  close(): Promise<void>;
}

export class ErpError extends Error {
  constructor(
    message: string,
    public readonly code: 'NOT_FOUND' | 'NOT_SUPPORTED' | 'AUTH' | 'CONNECTION' | 'INVALID' | 'UNKNOWN' = 'UNKNOWN',
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'ErpError';
  }
}

export class ErpNotSupportedError extends ErpError {
  constructor(feature: string) {
    super(`Operacao nao suportada por este ERP: ${feature}`, 'NOT_SUPPORTED');
  }
}

export class ErpNotFoundError extends ErpError {
  constructor(what = 'registro') {
    super(`${what} nao encontrado`, 'NOT_FOUND');
  }
}
