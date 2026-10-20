import type { WhatsappProviderType, WhatsappSendResult } from '@ura/shared';

export interface WhatsappConfig {
  /** Meta: phoneNumberId, businessAccountId, apiVersion */
  phoneNumberId?: string;
  businessAccountId?: string;
  apiVersion?: string;
  /** Evolution: baseUrl, instance */
  baseUrl?: string;
  instance?: string;
  /** Z-API: instanceId */
  instanceId?: string;
  [key: string]: unknown;
}

export interface WhatsappSecrets {
  /** Meta: access token permanente; Evolution: apikey; Z-API: token + clientToken */
  token?: string;
  apiKey?: string;
  clientToken?: string;
  [key: string]: string | undefined;
}

export interface WhatsappProviderOptions {
  provider: WhatsappProviderType;
  config: WhatsappConfig;
  secrets: WhatsappSecrets;
  timeoutMs?: number;
}

export interface WhatsappDocument {
  filename: string;
  mimeType: string;
  base64?: string;
  url?: string;
  caption?: string;
}

export interface WhatsappTemplate {
  name: string;
  language?: string;
  params?: string[];
}

export interface WhatsappProvider {
  readonly provider: WhatsappProviderType;
  testConnection(): Promise<{ ok: boolean; message: string }>;
  sendText(to: string, text: string): Promise<WhatsappSendResult>;
  sendDocument(to: string, doc: WhatsappDocument): Promise<WhatsappSendResult>;
  sendTemplate(to: string, template: WhatsappTemplate): Promise<WhatsappSendResult>;
}

export class WhatsappError extends Error {
  constructor(
    message: string,
    public readonly code: 'AUTH' | 'INVALID_NUMBER' | 'RATE_LIMIT' | 'CONNECTION' | 'UNKNOWN' = 'UNKNOWN',
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'WhatsappError';
  }
}
