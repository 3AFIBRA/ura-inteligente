export const ROLES = ['superadmin', 'tenant_admin', 'supervisor', 'agent'] as const;
export type Role = (typeof ROLES)[number];

export const LOCALES = ['pt-BR', 'en', 'es'] as const;
export type Locale = (typeof LOCALES)[number];

export const EXTENSION_TYPES = ['sip', 'webrtc'] as const;
export type ExtensionType = (typeof EXTENSION_TYPES)[number];

export const TRUNK_AUTH_MODES = ['register', 'ip'] as const;
export type TrunkAuthMode = (typeof TRUNK_AUTH_MODES)[number];

export const TRUNK_TRANSPORTS = ['udp', 'tcp', 'tls'] as const;
export type TrunkTransport = (typeof TRUNK_TRANSPORTS)[number];

export const CODECS = ['ulaw', 'alaw', 'g729', 'g722', 'opus', 'gsm'] as const;
export type Codec = (typeof CODECS)[number];

export const QUEUE_STRATEGIES = [
  'ringall',
  'leastrecent',
  'fewestcalls',
  'random',
  'rrmemory',
  'linear',
  'wrandom',
] as const;
export type QueueStrategy = (typeof QUEUE_STRATEGIES)[number];

export const ERP_TYPES = ['sgp', 'ispfy', 'ixcsoft', 'atlaz', 'hubsoft', 'receitanet', 'sql_generic'] as const;
export type ErpType = (typeof ERP_TYPES)[number];

export const ERP_MODES = ['api', 'database'] as const;
export type ErpMode = (typeof ERP_MODES)[number];

export const DB_DIALECTS = ['postgres', 'mysql', 'mssql'] as const;
export type DbDialect = (typeof DB_DIALECTS)[number];

export const WHATSAPP_PROVIDERS = ['meta', 'evolution', 'zapi'] as const;
export type WhatsappProviderType = (typeof WHATSAPP_PROVIDERS)[number];

export const ASR_PROVIDERS = ['openai', 'google'] as const;
export type AsrProviderType = (typeof ASR_PROVIDERS)[number];

export const TTS_PROVIDERS = ['openai', 'google', 'azure'] as const;
export type TtsProviderType = (typeof TTS_PROVIDERS)[number];

export const NLU_PROVIDERS = ['openai', 'keyword'] as const;
export type NluProviderType = (typeof NLU_PROVIDERS)[number];

export const CALL_DIRECTIONS = ['inbound', 'outbound', 'internal'] as const;
export type CallDirection = (typeof CALL_DIRECTIONS)[number];

export const CALL_STATUSES = ['ringing', 'in_ivr', 'in_queue', 'talking', 'completed', 'abandoned', 'failed'] as const;
export type CallStatus = (typeof CALL_STATUSES)[number];

export const INTENTS = [
  'segunda_via',
  'cadastro',
  'financeiro',
  'suporte',
  'desbloqueio',
  'atendente',
  'cancelar',
  'confirmar',
  'negar',
  'desconhecido',
] as const;
export type Intent = (typeof INTENTS)[number];
