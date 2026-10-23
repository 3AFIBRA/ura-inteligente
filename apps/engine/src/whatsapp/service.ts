import { PrismaClient } from '@prisma/client';
import { decryptSecrets } from '@ura/shared/crypto';
import { createWhatsappProvider, type WhatsappProvider } from '@ura/whatsapp';
import { logger } from '../logger.js';

const prisma = new PrismaClient();

type CacheEntry = { provider: WhatsappProvider; key: string; at: number };
const cache = new Map<string, CacheEntry>();

/** Retorna o provedor WhatsApp ativo do tenant (null se nao houver conexao ativa). */
export async function getWhatsappProvider(tenantId: string): Promise<WhatsappProvider | null> {
  const row = await prisma.whatsappConnection.findFirst({
    where: { tenantId, active: true },
    orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }],
  });
  if (!row) return null;
  const key = `${row.id}:${row.updatedAt.getTime()}:${row.active ? 1 : 0}`;
  const hit = cache.get(tenantId);
  if (hit && hit.key === key && Date.now() - hit.at < 60_000) return hit.provider;
  const secrets = decryptSecrets<Record<string, string | undefined>>(row.secretsEnc);
  try {
    const provider = createWhatsappProvider({
      provider: row.provider as 'meta' | 'evolution' | 'zapi',
      config: (row.config ?? {}) as Record<string, unknown>,
      secrets: secrets ?? {},
      timeoutMs: 20_000,
    });
    cache.set(tenantId, { provider, key, at: Date.now() });
    return provider;
  } catch (err) {
    logger.warn({ err: String(err), tenantId, provider: row.provider }, 'Falha ao instanciar provedor WhatsApp');
    return null;
  }
}

export interface WhatsappSendParams {
  to: string;
  message?: string;
  /** variavel contendo { url | base64, filename, mimeType } */
  document?: { filename?: string; mimeType?: string; url?: string; base64?: string } | null;
}

/** Envia texto e/ou documento por WhatsApp. */
export async function sendWhatsapp(tenantId: string, params: WhatsappSendParams): Promise<boolean> {
  const provider = await getWhatsappProvider(tenantId);
  if (!provider) return false;
  const doc = params.document;
  if (doc && (doc.url || doc.base64)) {
    await provider.sendDocument(params.to, {
      filename: doc.filename ?? 'documento.pdf',
      mimeType: doc.mimeType ?? 'application/pdf',
      url: doc.url,
      base64: doc.base64,
      caption: params.message,
    });
    return true;
  }
  if (params.message) {
    await provider.sendText(params.to, params.message);
    return true;
  }
  return false;
}
