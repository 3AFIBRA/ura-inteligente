import { PrismaClient } from '@prisma/client';
import { decryptSecrets } from '@ura/shared/crypto';
import { createErpConnector, ErpError, type ErpConnector, type ErpConnectorOptions } from '@ura/erp';
import type { ErpCustomer, ErpInvoice } from '@ura/shared';
import { logger } from '../logger.js';

const prisma = new PrismaClient();

type CacheEntry = { connector: ErpConnector; key: string; at: number };
const cache = new Map<string, CacheEntry>();

function connectionKey(id: string, updatedAt: Date, active: boolean): string {
  return `${id}:${updatedAt.getTime()}:${active ? 1 : 0}`;
}

/** Retorna o conector ERP ativo do tenant (cache de 60s; null se nao houver conexao ativa). */
export async function getErpConnector(tenantId: string): Promise<ErpConnector | null> {
  const row = await prisma.erpConnection.findFirst({
    where: { tenantId, active: true },
    orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }],
  });
  if (!row) return null;
  const key = connectionKey(row.id, row.updatedAt, row.active);
  const hit = cache.get(tenantId);
  if (hit && hit.key === key && Date.now() - hit.at < 60_000) return hit.connector;
  const secrets = decryptSecrets<Record<string, string | undefined>>(row.secretsEnc);
  const opts: ErpConnectorOptions = {
    type: row.type as ErpConnectorOptions['type'],
    mode: row.mode as ErpConnectorOptions['mode'],
    config: (row.config ?? {}) as Record<string, unknown>,
    secrets: secrets ?? {},
    timeoutMs: 20_000,
  };
  try {
    const connector = createErpConnector(opts);
    cache.set(tenantId, { connector, key, at: Date.now() });
    return connector;
  } catch (err) {
    logger.warn({ err: String(err), tenantId, erp: row.type }, 'Falha ao instanciar conector ERP');
    return null;
  }
}

/** Formata data ISO em dd/mm/aaaa. */
function dateBR(iso?: string): string {
  if (!iso) return '';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return y && m && d ? `${d}/${m}/${y}` : '';
}

/** Formata valor em Real (1.234,56). */
function moneyBR(v: number): string {
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Decora a fatura com campos prontos para fala/mensagens (dueDateBR, amountBR). */
function decorateInvoice(inv: ErpInvoice): ErpInvoice & { dueDateBR: string; amountBR: string } {
  return { ...inv, dueDateBR: dateBR(inv.dueDate), amountBR: moneyBR(inv.amount) };
}

export interface ErpActionParams {
  phone?: string;
  document?: string;
  customerId?: string;
  invoiceId?: string;
  name?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  email?: string;
  notes?: string;
  subject?: string;
  description?: string;
  contractId?: string;
  [key: string]: unknown;
}

/**
 * Executa uma acao de ERP. Retorna:
 *  - undefined: sem conexao ERP configurada (rotear para onError)
 *  - null: cliente/fatura nao encontrada (rotear para onNotFound)
 *  - objeto: sucesso (definir na variavel de saida)
 */
export async function runErpAction(tenantId: string, action: string, params: ErpActionParams): Promise<unknown> {
  const connector = await getErpConnector(tenantId);
  if (!connector) return undefined;
  switch (action) {
    case 'find_customer': {
      if (params.document) return await connector.findCustomerByDocument(params.document);
      if (params.phone) return await connector.findCustomerByPhone(params.phone);
      throw new ErpError('find_customer exige phone ou document', 'INVALID');
    }
    case 'list_open_invoices': {
      const customerId = params.customerId ?? params.document;
      if (!customerId) throw new ErpError('list_open_invoices exige customerId', 'INVALID');
      const invoices = await connector.listOpenInvoices(customerId);
      return invoices.length > 0 ? invoices.map(decorateInvoice) : null;
    }
    case 'get_invoice_pdf': {
      const invoiceId = params.invoiceId ?? params.customerId;
      if (!invoiceId) throw new ErpError('get_invoice_pdf exige invoiceId', 'INVALID');
      return await connector.getInvoicePdf(invoiceId);
    }
    case 'get_invoice_line': {
      const invoiceId = params.invoiceId ?? params.customerId;
      if (!invoiceId) throw new ErpError('get_invoice_line exige invoiceId', 'INVALID');
      const invoice = await connector.getInvoice(invoiceId);
      if (!invoice) return null;
      return decorateInvoice(invoice);
    }
    case 'create_customer': {
      if (!params.name || !params.document || !params.phone) throw new ErpError('create_customer exige name, document e phone', 'INVALID');
      return await connector.createCustomer({
        name: params.name,
        document: params.document,
        phone: params.phone,
        email: params.email,
        address: params.address,
        city: params.city,
        state: params.state,
        zip: params.zip,
        notes: params.notes,
      });
    }
    case 'get_connection_status': {
      const customerId = params.customerId ?? params.document;
      if (!customerId) throw new ErpError('get_connection_status exige customerId', 'INVALID');
      return await connector.getConnectionStatus(customerId, params.contractId);
    }
    case 'unlock_connection': {
      const customerId = params.customerId ?? params.document;
      if (!customerId) throw new ErpError('unlock_connection exige customerId', 'INVALID');
      return await connector.unlockConnection(customerId, params.contractId);
    }
    case 'open_ticket': {
      const customerId = params.customerId ?? params.document;
      if (!customerId) throw new ErpError('open_ticket exige customerId', 'INVALID');
      return await connector.openTicket(customerId, params.subject ?? 'Chamado URA', params.description ?? params.subject ?? 'Aberto pela URA');
    }
    default:
      throw new ErpError(`Acao de ERP desconhecida: ${action}`, 'INVALID');
  }
}
