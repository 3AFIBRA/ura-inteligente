import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * Criptografia simetrica AES-256-GCM para credenciais (ERP/WhatsApp/Speech).
 * Formato: base64( iv[12] + tag[16] + ciphertext )
 * A chave vem de SECRETS_ENCRYPTION_KEY (hex, 32 bytes).
 */
function keyFromEnv(hexKey?: string): Buffer {
  const hex = hexKey ?? process.env.SECRETS_ENCRYPTION_KEY ?? '';
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error('SECRETS_ENCRYPTION_KEY deve ter 64 caracteres hexadecimais (32 bytes)');
  }
  return Buffer.from(hex, 'hex');
}

export function encryptSecrets(data: Record<string, unknown>, hexKey?: string): string {
  const key = keyFromEnv(hexKey);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const plaintext = Buffer.from(JSON.stringify(data), 'utf8');
  const enc = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
}

export function decryptSecrets<T = Record<string, string | undefined>>(payload: string | null | undefined, hexKey?: string): T {
  if (!payload) return {} as T;
  const key = keyFromEnv(hexKey);
  const buf = Buffer.from(payload, 'base64');
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const enc = buf.subarray(28);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
  return JSON.parse(dec.toString('utf8')) as T;
}

/** Mascara um segredo para exibicao (ex.: "ab****yz") */
export function maskSecret(v?: string): string {
  if (!v) return '';
  if (v.length <= 4) return '****';
  return `${v.slice(0, 2)}${'*'.repeat(Math.min(8, v.length - 4))}${v.slice(-2)}`;
}
