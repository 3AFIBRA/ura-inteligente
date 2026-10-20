import { normalizePhoneBR, onlyDigits } from '@ura/shared';
import type { ErpCustomer, ErpInvoice } from '@ura/shared';

export type AnyRecord = Record<string, unknown>;

/** Le um caminho `a.b.c` (ou indices `a.0.b`) de um objeto. */
export function getPath(obj: unknown, path: string | undefined): unknown {
  if (!path) return undefined;
  if (obj === null || obj === undefined) return undefined;
  const parts = path.split('.');
  let cur: unknown = obj;
  for (const p of parts) {
    if (cur === null || cur === undefined) return undefined;
    if (Array.isArray(cur)) {
      const idx = Number(p);
      cur = Number.isInteger(idx) ? cur[idx] : undefined;
    } else if (typeof cur === 'object') {
      cur = (cur as AnyRecord)[p];
    } else {
      return undefined;
    }
  }
  return cur;
}

/** Retorna o primeiro valor definido entre varias chaves/caminhos. */
export function pick(obj: unknown, ...keys: string[]): unknown {
  for (const k of keys) {
    const v = getPath(obj, k);
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return undefined;
}

export function toStr(v: unknown): string | undefined {
  if (v === undefined || v === null) return undefined;
  if (typeof v === 'string') return v.trim() || undefined;
  if (typeof v === 'number' || typeof v === 'bigint' || typeof v === 'boolean') return String(v);
  if (v instanceof Date) return v.toISOString();
  return undefined;
}

export function toStrRequired(v: unknown, fallback = ''): string {
  return toStr(v) ?? fallback;
}

/**
 * Converte valores monetarios em numero (reais). Aceita "1.234,56", "1234.56", 123456 (centavos quando
 * `centavos` = true), etc.
 */
export function toAmount(v: unknown, centavos = false): number {
  if (v === undefined || v === null || v === '') return 0;
  let n: number;
  if (typeof v === 'number') n = v;
  else if (typeof v === 'bigint') n = Number(v);
  else {
    let s = String(v).trim().replace(/[R$\s]/g, '');
    if (/,\d{1,2}$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(/,/g, '');
    n = Number(s);
  }
  if (!Number.isFinite(n)) return 0;
  if (centavos) n = n / 100;
  return Math.round(n * 100) / 100;
}

/** Normaliza data em ISO (YYYY-MM-DD). Aceita Date, ISO, "DD/MM/YYYY", timestamps. */
export function toIsoDate(v: unknown): string {
  if (v === undefined || v === null || v === '') return '';
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? '' : v.toISOString().slice(0, 10);
  if (typeof v === 'number') {
    const d = new Date(v < 1e12 ? v * 1000 : v);
    return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  const br = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(s);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? s : d.toISOString().slice(0, 10);
}

export function isPastDate(iso: string): boolean {
  if (!iso) return false;
  const d = new Date(`${iso}T23:59:59`);
  return !Number.isNaN(d.getTime()) && d.getTime() < Date.now();
}

/** Normaliza status de fatura de diversos ERPs. */
export function toInvoiceStatus(v: unknown, dueDate?: string, paidFlag?: unknown): ErpInvoice['status'] {
  const s = String(v ?? '').trim().toLowerCase();
  if (paidFlag === true || paidFlag === 1 || paidFlag === '1' || paidFlag === 'S' || paidFlag === 's') return 'paid';
  if (/^(paid|pago|paga|liquidad[oa]|quitad[oa]|baixad[oa]|r|pg)$/.test(s) || /recebid/.test(s)) return 'paid';
  if (/^(cancel(ad[oa]|led)?|c|estornad[oa]|excluid[oa]|inativ[oa])$/.test(s)) return 'cancelled';
  if (/^(overdue|vencid[oa]|atrasad[oa]|em atraso)$/.test(s)) return 'overdue';
  if (/^(open|aberto|aberta|pendente|a|em aberto|a vencer|avencer|emitid[oa]|nao pago|0)$/.test(s) || s === '') {
    return dueDate && isPastDate(dueDate) ? 'overdue' : 'open';
  }
  return dueDate && isPastDate(dueDate) ? 'overdue' : 'open';
}

/** Normaliza status de cliente. */
export function toCustomerStatus(v: unknown): ErpCustomer['status'] {
  const s = String(v ?? '').trim().toLowerCase();
  if (!s) return 'unknown';
  if (/^(a|active|ativo|ativa|1|true|s|habilitado|normal)$/.test(s)) return 'active';
  if (/^(b|blocked|bloqueado|bloqueada|bloqueio|cb|fa|ca)$/.test(s) || /bloq/.test(s)) return 'blocked';
  if (/^(s|suspended|suspenso|suspensa|suspensao|reducao)$/.test(s) || /suspen/.test(s)) return 'suspended';
  if (/^(c|cancelled|canceled|cancelado|cancelada|d|desativado|inativo|inativa|0|false)$/.test(s) || /cancel/.test(s)) {
    return 'cancelled';
  }
  return 'unknown';
}

export function toDocument(v: unknown): string {
  return onlyDigits(toStr(v) ?? '');
}

export function toPhone(v: unknown): string | undefined {
  const s = toStr(v);
  if (!s) return undefined;
  const d = normalizePhoneBR(s);
  return d || undefined;
}

export function toBool(v: unknown): boolean {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  const s = String(v ?? '').trim().toLowerCase();
  return ['1', 'true', 's', 'sim', 'y', 'yes', 'ativo', 'online', 'on'].includes(s);
}

/**
 * Gera as variacoes de um telefone BR para busca no ERP:
 * com/sem 55, com/sem o nono digito, e formatos comuns.
 */
export function phoneVariants(phone: string): string[] {
  const digits = onlyDigits(phone).replace(/^0+/, '');
  const set = new Set<string>();
  if (!digits) return [];
  let national = digits;
  if (national.startsWith('55') && (national.length === 12 || national.length === 13)) national = national.slice(2);
  const nationals = new Set<string>([national]);
  if (national.length === 11 && national[2] === '9') nationals.add(national.slice(0, 2) + national.slice(3));
  else if (national.length === 10 && /[6-9]/.test(national[2])) nationals.add(national.slice(0, 2) + '9' + national.slice(2));
  for (const n of nationals) {
    set.add(n);
    set.add(`55${n}`);
    if (n.length >= 10) {
      const ddd = n.slice(0, 2);
      const rest = n.slice(2);
      set.add(rest); // sem DDD
      if (rest.length === 9) set.add(`(${ddd}) ${rest.slice(0, 5)}-${rest.slice(5)}`);
      if (rest.length === 8) set.add(`(${ddd}) ${rest.slice(0, 4)}-${rest.slice(4)}`);
    }
  }
  set.add(digits);
  return [...set];
}

/** Mapeia uma linha SQL/objeto com nomes de colunas padrao para ErpCustomer. */
export function rowToCustomer(row: AnyRecord): ErpCustomer {
  const contractsRaw = pick(row, 'contracts', 'contratos');
  const contracts = Array.isArray(contractsRaw)
    ? contractsRaw.map((c) => ({
        id: toStrRequired(pick(c, 'id', 'contract_id', 'contrato')),
        plan: toStr(pick(c, 'plan', 'plano')),
        status: toStr(pick(c, 'status')),
      }))
    : undefined;
  const contractId = toStr(pick(row, 'contract_id', 'contrato', 'id_contrato'));
  return {
    id: toStrRequired(pick(row, 'id', 'customer_id', 'codigo', 'id_cliente')),
    name: toStrRequired(pick(row, 'name', 'nome', 'razao', 'razao_social', 'fantasia')),
    document: toDocument(pick(row, 'document', 'cpf_cnpj', 'cnpj_cpf', 'cpfcnpj', 'cpf', 'cnpj', 'documento')),
    phone: toPhone(pick(row, 'phone', 'telefone', 'fone', 'telefone_comercial')),
    mobile: toPhone(pick(row, 'mobile', 'celular', 'telefone_celular', 'whatsapp')),
    email: toStr(pick(row, 'email')),
    address: toStr(pick(row, 'address', 'endereco')),
    status: toCustomerStatus(pick(row, 'status', 'ativo', 'situacao')),
    contracts: contracts ?? (contractId ? [{ id: contractId, plan: toStr(pick(row, 'plan', 'plano')) }] : undefined),
    raw: row,
  };
}

/** Mapeia uma linha SQL/objeto com nomes de colunas padrao para ErpInvoice. */
export function rowToInvoice(row: AnyRecord, opts: { centavos?: boolean } = {}): ErpInvoice {
  const dueDate = toIsoDate(pick(row, 'due_date', 'vencimento', 'data_vencimento', 'dt_vencimento'));
  return {
    id: toStrRequired(pick(row, 'id', 'invoice_id', 'titulo', 'id_titulo', 'codigo')),
    customerId: toStrRequired(pick(row, 'customer_id', 'id_cliente', 'cliente_id', 'cliente')),
    dueDate,
    amount: toAmount(pick(row, 'amount', 'valor', 'valor_total', 'value'), opts.centavos),
    status: toInvoiceStatus(pick(row, 'status', 'situacao'), dueDate, pick(row, 'paid', 'pago')),
    digitableLine: toStr(pick(row, 'digitable_line', 'linha_digitavel', 'linhadigitavel')),
    barcode: toStr(pick(row, 'barcode', 'codigo_barras', 'codigobarras')),
    pixCode: toStr(pick(row, 'pix_code', 'pix', 'pix_copia_cola', 'qrcode_pix', 'pix_txid')),
    pdfUrl: toStr(pick(row, 'pdf_url', 'link', 'url_boleto', 'link_boleto')),
    raw: row,
  };
}

/** Aceita lista em varios formatos de envelope (array direto, {data:[]}, {registros:[]}, {rows:[]}) */
export function unwrapList(data: unknown): AnyRecord[] {
  if (Array.isArray(data)) return data.filter((x) => x && typeof x === 'object') as AnyRecord[];
  if (data && typeof data === 'object') {
    const d = data as AnyRecord;
    for (const k of ['registros', 'data', 'rows', 'items', 'result', 'results', 'lista', 'titulos', 'faturas', 'clientes']) {
      const v = d[k];
      if (Array.isArray(v)) return v.filter((x) => x && typeof x === 'object') as AnyRecord[];
      if (v && typeof v === 'object' && Array.isArray((v as AnyRecord).data)) {
        return ((v as AnyRecord).data as unknown[]).filter((x) => x && typeof x === 'object') as AnyRecord[];
      }
    }
  }
  return [];
}

/** Aceita objeto unico em varios envelopes. */
export function unwrapObject(data: unknown): AnyRecord | null {
  if (!data || typeof data !== 'object') return null;
  if (Array.isArray(data)) return (data[0] as AnyRecord) ?? null;
  const d = data as AnyRecord;
  for (const k of ['data', 'registro', 'result', 'cliente', 'customer']) {
    const v = d[k];
    if (Array.isArray(v)) return (v[0] as AnyRecord) ?? null;
    if (v && typeof v === 'object') return v as AnyRecord;
  }
  return d;
}
