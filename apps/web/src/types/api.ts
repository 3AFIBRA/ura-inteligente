import type {
  Role,
  Locale,
  ExtensionType,
  TrunkAuthMode,
  TrunkTransport,
  Codec,
  QueueStrategy,
  ErpType,
  ErpMode,
  WhatsappProviderType,
  CallDirection,
  CallStatus,
  IvrFlowDefinition,
} from '@ura/shared';

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ApiError {
  statusCode: number;
  message: string | string[];
  error: string;
}

export interface UserDto {
  id: string;
  email: string;
  name: string;
  role: Role;
  locale: Locale | string | null;
  tenantId: string | null;
  tenant?: { id: string; slug: string; name: string; locale: string };
  extension?: { id: string; number: string; name: string; type: ExtensionType };
  active?: boolean;
  extensionId?: string | null;
  lastLoginAt?: string | null;
  createdAt?: string;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: UserDto;
}

export interface Tenant {
  id: string;
  slug: string;
  name: string;
  locale: string;
  timezone: string;
  active: boolean;
  settings: Record<string, unknown> & { recordingRetentionDays?: number };
  createdAt?: string;
  updatedAt?: string;
}

export interface TenantStats {
  extensions: number;
  trunks: number;
  queues: number;
  callsToday: number;
  activeCalls: number;
}

export interface Trunk {
  id: string;
  tenantId: string;
  name: string;
  description?: string | null;
  authMode: TrunkAuthMode;
  host: string;
  port: number;
  transport: TrunkTransport;
  username?: string | null;
  hasPassword?: boolean;
  fromDomain?: string | null;
  fromUser?: string | null;
  outboundCallerId?: string | null;
  codecs: Codec[];
  maxChannels: number;
  stripDigits: number;
  prependDigits: string;
  dids: string[];
  allowedIps: string[];
  qualify: boolean;
  active: boolean;
  createdAt?: string;
}

export type TrunkStatusValue = 'registered' | 'unregistered' | 'reachable' | 'unreachable' | 'unknown';
export interface TrunkStatus {
  status: TrunkStatusValue;
  detail?: string;
}

export interface Extension {
  id: string;
  tenantId: string;
  number: string;
  name: string;
  type: ExtensionType;
  codecs: Codec[];
  callerId?: string | null;
  record: boolean;
  voicemail: boolean;
  voicemailEmail?: string | null;
  maxContacts: number;
  active: boolean;
  createdAt?: string;
}

export type ExtensionStatusValue = 'online' | 'offline' | 'busy' | 'ringing' | 'unknown';
export interface ExtensionStatus {
  id: string;
  number: string;
  status: ExtensionStatusValue;
}

export interface ExtensionCredentials {
  username: string;
  secret: string;
  domain: string;
  wssUrl: string;
  sipPort: number;
  tlsPort: number;
  turn?: { urls: string[]; username?: string; credential?: string };
}

export type InboundDestinationType = 'ivr' | 'extension' | 'queue';
export interface InboundRoute {
  id: string;
  name: string;
  trunkId?: string | null;
  did: string;
  destinationType: InboundDestinationType;
  flowId?: string | null;
  extensionNumber?: string | null;
  queueName?: string | null;
  record: boolean;
  priority: number;
  active: boolean;
}

export interface OutboundRoute {
  id: string;
  name: string;
  pattern: string;
  trunkId: string;
  stripDigits: number;
  prependDigits: string;
  callerId?: string | null;
  priority: number;
  record: boolean;
  active: boolean;
}

export interface QueueMember {
  id?: string;
  extensionId: string;
  penalty: number;
  paused: boolean;
  extension?: { id: string; number: string; name: string };
}

export interface Queue {
  id: string;
  name: string;
  description?: string | null;
  strategy: QueueStrategy;
  timeoutSec: number;
  retrySec: number;
  wrapupSec: number;
  maxLen: number;
  musicClass: string;
  announcePosition: boolean;
  announceHoldtime: boolean;
  announceFrequency: number;
  record: boolean;
  slaSec: number;
  active: boolean;
  members: QueueMember[];
}

export interface FlowListItem {
  id: string;
  name: string;
  description?: string | null;
  version: number;
  publishedAt?: string | null;
  active: boolean;
  hasPublished: boolean;
  updatedAt?: string;
  createdAt?: string;
}

export interface FlowDetail extends FlowListItem {
  draft: IvrFlowDefinition;
  published?: IvrFlowDefinition | null;
}

export interface FlowTemplate {
  key: string;
  name: string;
  description?: string;
  definition: IvrFlowDefinition;
}

export interface ValidationIssue {
  path: string;
  message: string;
}
export interface ValidationResult {
  ok: boolean;
  issues: ValidationIssue[];
}

export interface FieldDescriptor {
  key: string;
  label: string;
  type: 'text' | 'password' | 'number' | 'select' | 'boolean' | 'textarea';
  required?: boolean;
  options?: Array<{ value: string; label: string }>;
  placeholder?: string;
  help?: string;
  /** opcional: restringe o campo a determinados modos */
  modes?: string[];
}

export interface ErpCatalogEntry {
  type: ErpType;
  name: string;
  modes: ErpMode[];
  configFields: FieldDescriptor[];
  secretFields: FieldDescriptor[];
  capabilities: string[];
}

export interface ErpConnection {
  id: string;
  name: string;
  type: ErpType;
  mode: ErpMode;
  config: Record<string, unknown>;
  secretKeys: string[];
  isDefault: boolean;
  active: boolean;
  lastTestAt?: string | null;
  lastTestOk?: boolean | null;
  lastTestMsg?: string | null;
}

export interface TestResult {
  ok: boolean;
  message: string;
  latencyMs?: number;
}

export interface WhatsappCatalogEntry {
  provider: WhatsappProviderType;
  name: string;
  configFields: FieldDescriptor[];
  secretFields: FieldDescriptor[];
}

export interface WhatsappConnection {
  id: string;
  name: string;
  provider: WhatsappProviderType;
  config: Record<string, unknown>;
  secretKeys: string[];
  isDefault: boolean;
  active: boolean;
  lastTestAt?: string | null;
  lastTestOk?: boolean | null;
  lastTestMsg?: string | null;
}

export interface WhatsappMessage {
  id: string;
  connectionId?: string | null;
  callId?: string | null;
  to: string;
  body?: string | null;
  documentName?: string | null;
  status: 'queued' | 'sent' | 'delivered' | 'read' | 'failed';
  providerMessageId?: string | null;
  error?: string | null;
  createdAt: string;
}

export interface SpeechConfig {
  asrProvider: string;
  ttsProvider: string;
  nluProvider: string;
  ttsVoice: string;
  language: string;
  config: Record<string, unknown>;
  secretKeys: string[];
}

export interface CallEvent {
  id: string;
  callId: string;
  type: string;
  nodeId?: string | null;
  data: Record<string, unknown>;
  createdAt: string;
}

export interface CallDetail {
  id: string;
  tenantId: string;
  channelId: string;
  linkedId?: string | null;
  direction: CallDirection;
  status: CallStatus;
  callerId: string;
  callerName?: string | null;
  did?: string | null;
  destination?: string | null;
  trunkName?: string | null;
  queueName?: string | null;
  agentExtension?: string | null;
  flowId?: string | null;
  customerId?: string | null;
  customerName?: string | null;
  customerDocument?: string | null;
  intents: string[];
  startedAt: string;
  answeredAt?: string | null;
  endedAt?: string | null;
  durationSec?: number | null;
  billSec?: number | null;
  waitSec?: number | null;
  hangupCause?: string | null;
  hangupBy?: string | null;
  recordingId?: string | null;
  recordingPath?: string | null;
  variables: Record<string, unknown>;
  events: CallEvent[];
}

export interface CallFilters {
  from?: string;
  to?: string;
  direction?: string;
  status?: string;
  queueName?: string;
  agentExtension?: string;
  callerId?: string;
  customerDocument?: string;
  page?: number;
  pageSize?: number;
}

export interface ReportOverview {
  totalCalls: number;
  answered: number;
  abandoned: number;
  avgWaitSec: number;
  avgTalkSec: number;
  slaPct: number;
  byHour: Array<{ hour: number; calls: number }>;
  byDay: Array<{ date: string; calls: number; answered: number; abandoned: number }>;
  byIntent: Array<{ intent: string; count: number }>;
  byQueue: Array<{ queueName: string; calls: number; answered: number; abandoned: number; avgWaitSec: number; slaPct: number }>;
}

export interface AgentReport {
  extension: string;
  name: string;
  callsTaken: number;
  avgTalkSec: number;
  totalTalkSec: number;
  pausedSec: number;
}

export interface IvrReport {
  totalIvrCalls: number;
  selfServiceRate: number;
  boletosSent: number;
  newCustomers: number;
  transfersToQueue: number;
  byIntent: Array<{ intent: string; count: number }>;
}

export interface AsteriskStatus {
  version: string;
  uptime: string;
  ami: boolean;
  ari: boolean;
  channels: number;
  endpoints: number;
}

export interface AsteriskPreview {
  pjsip: string;
  extensions: string;
  queues: string;
}

export interface AuditLog {
  id: string;
  tenantId?: string | null;
  userId?: string | null;
  user?: { id: string; name: string; email: string } | null;
  action: string;
  entity: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  ip?: string | null;
  createdAt: string;
}

export interface HealthStatus {
  status: string;
  db: boolean;
  redis: boolean;
  asterisk: { ami: boolean; ari: boolean };
}
