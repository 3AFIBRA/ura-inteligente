# Contrato da API (REST + Realtime)

Base: `/api`. Todas as rotas (exceto `/auth/*` e `/health`) exigem `Authorization: Bearer <accessToken>`.
Respostas de erro: `{ "statusCode": number, "message": string | string[], "error": string }`.
Listagens paginadas: `?page=1&pageSize=20&search=` → `{ items: T[], total, page, pageSize }`.
Datas em ISO 8601. IDs são UUID.

## Multi-tenant
- Usuário com `role=superadmin` tem `tenantId=null` e pode agir em qualquer tenant enviando o header `X-Tenant-Id: <uuid>`.
- Os demais usuários estão presos ao próprio `tenantId` (header ignorado).
- Toda consulta roda com `SET LOCAL app.tenant_id = '<uuid>'` + Row Level Security no PostgreSQL.

## Auth
| Método | Rota | Body | Resposta |
|---|---|---|---|
| POST | `/auth/login` | `{ email, password }` | `{ accessToken, refreshToken, user: UserDto }` |
| POST | `/auth/refresh` | `{ refreshToken }` | `{ accessToken, refreshToken }` |
| POST | `/auth/logout` | `{ refreshToken }` | `204` |
| GET | `/auth/me` | — | `UserDto` |
| PATCH | `/auth/me` | `{ name?, locale?, password?, currentPassword? }` | `UserDto` |

`UserDto = { id, email, name, role, locale, tenantId, tenant?: { id, slug, name, locale }, extension?: { id, number, name, type } }`

## Health
`GET /health` → `{ status: 'ok', db: boolean, redis: boolean, asterisk: { ami: boolean, ari: boolean } }`

## Tenants (superadmin)
- `GET /tenants`, `POST /tenants`, `GET /tenants/:id`, `PATCH /tenants/:id`, `DELETE /tenants/:id`
- Body: `{ slug, name, locale?, timezone?, active?, settings? }` (`slug` = `^[a-z0-9]{2,12}$`, imutável)
- `GET /tenants/:id/stats` → `{ extensions, trunks, queues, callsToday, activeCalls }`
- `POST /tenants/:id/apply` → regenera configs do Asterisk do tenant e recarrega

## Usuários
- CRUD `/users` — `{ email, name, password?, role, locale?, extensionId?, active? }`

## Troncos
- CRUD `/trunks` — campos do model `Trunk` (sem `lastStatus*`). `password` nunca é retornado em texto puro: retorna `hasPassword: boolean`.
- `GET /trunks/:id/status` → `{ status: 'registered'|'unregistered'|'reachable'|'unreachable'|'unknown', detail?: string }`
- Nome: `^[a-z0-9_]{2,20}$`

## Ramais
- CRUD `/extensions` — `{ number, name, type, secret?, codecs, callerId, record, voicemail, voicemailEmail, maxContacts, active }`
- `POST /extensions/:id/reset-secret` → `{ secret }` (gera nova senha aleatória)
- `GET /extensions/:id/credentials` → `{ username: 't<slug>-<number>', secret, domain, wssUrl: 'wss://<APP_DOMAIN>/ws', sipPort: 5060, tlsPort: 5061, turn: { urls: ['turn:<host>:3478'], username, credential } }` — exibe credenciais para softphone; para WebRTC o painel usa esta rota.
- `GET /extensions/status` → `[{ id, number, status: 'online'|'offline'|'busy'|'ringing'|'unknown' }]`

## Rotas
- CRUD `/inbound-routes` — `{ name, trunkId?, did, destinationType, flowId?, extensionNumber?, queueName?, record, priority, active }`
- CRUD `/outbound-routes` — `{ name, pattern, trunkId, stripDigits, prependDigits, callerId?, priority, record, active }`

## Filas
- CRUD `/queues` — campos do model + `members: [{ extensionId, penalty, paused }]`
- `GET /queues/status` → `QueueSnapshot[]` (ver `@ura/shared`)
- `POST /queues/:id/members/:extensionId/pause` body `{ paused: boolean, reason? }`

## Fluxos de URA
- CRUD `/flows` — `{ name, description?, draft: IvrFlowDefinition }`; listagem retorna sem `draft/published` (apenas metadados + `hasPublished`)
- `GET /flows/:id` → inclui `draft` e `published`
- `PUT /flows/:id/draft` body `IvrFlowDefinition` → valida com zod e salva
- `POST /flows/:id/publish` → copia `draft` para `published`, `version++`
- `POST /flows/validate` body `IvrFlowDefinition` → `{ ok: boolean, issues: [{ path, message }] }`
- `GET /flows/templates` → `[{ key: 'isp_default', name, description, definition }]`
- `POST /flows/:id/tts-preview` body `{ text }` → `audio/wav` (usa SpeechConfig do tenant)

## Integrações ERP
- CRUD `/erp-connections` — `{ name, type, mode, config, secrets?: Record<string,string>, isDefault, active }`. Resposta nunca retorna `secrets`; retorna `secretKeys: string[]` (nomes dos campos salvos).
- `GET /erp-connections/catalog` → `[{ type, name, modes: ['api'|'database'][], configFields: FieldDescriptor[], secretFields: FieldDescriptor[], capabilities: string[] }]`
- `POST /erp-connections/:id/test` → `{ ok, message, latencyMs }`
- `POST /erp-connections/:id/query` body `{ action: 'find_customer'|'list_open_invoices'|..., params }` → resultado bruto (simulador no painel)

`FieldDescriptor = { key, label, type: 'text'|'password'|'number'|'select'|'boolean'|'textarea', required?: boolean, options?: [{value,label}], placeholder?, help? }`

## WhatsApp
- CRUD `/whatsapp-connections` — `{ name, provider, config, secrets?, isDefault, active }` (mesma regra de `secretKeys`)
- `GET /whatsapp-connections/catalog` → `[{ provider, name, configFields, secretFields }]`
- `POST /whatsapp-connections/:id/test` → `{ ok, message }`
- `POST /whatsapp-connections/:id/send-test` body `{ to, text }` → `WhatsappSendResult`
- `GET /whatsapp-messages` (paginado; filtros `status`, `from`, `to`)

## Speech (ASR/TTS/NLU)
- `GET /speech-config` → `{ asrProvider, ttsProvider, nluProvider, ttsVoice, language, config, secretKeys }`
- `PUT /speech-config` body `{ asrProvider, ttsProvider, nluProvider, ttsVoice, language, config, secrets? }`
- `POST /speech-config/test` → `{ ok, message }`

## Chamadas / CDR / Gravações
- `GET /calls` (paginado; filtros `from`, `to`, `direction`, `status`, `queueName`, `agentExtension`, `callerId`, `customerDocument`) → `CallSummary[]`
- `GET /calls/:id` → `Call` completo + `events: CallEvent[]`
- `GET /calls/active` → `CallSummary[]`
- `POST /calls/originate` body `{ fromExtension, to }` → `{ ok }` (click-to-call via AMI)
- `POST /calls/:id/hangup` → `204`
- `POST /calls/:id/spy` body `{ listenerExtension, mode: 'listen'|'whisper'|'barge' }` → `204` (ChanSpy via AMI Originate)
- `GET /calls/export.csv` (mesmos filtros) → CSV
- `GET /recordings/:id/stream` → arquivo de áudio (aceita `?token=<accessToken>` para uso em `<audio src>`)
- `DELETE /recordings/:id`

## Relatórios
- `GET /reports/overview?from&to` → `{ totalCalls, answered, abandoned, avgWaitSec, avgTalkSec, slaPct, byHour: [{hour, calls}], byDay: [{date, calls, answered, abandoned}], byIntent: [{intent, count}], byQueue: [{queueName, calls, answered, abandoned, avgWaitSec, slaPct}] }`
- `GET /reports/agents?from&to` → `[{ extension, name, callsTaken, avgTalkSec, totalTalkSec, pausedSec }]`
- `GET /reports/ivr?from&to` → `{ totalIvrCalls, selfServiceRate, boletosSent, newCustomers, transfersToQueue, byIntent }`

## Asterisk (admin)
- `GET /asterisk/status` → `{ version, uptime, ami: boolean, ari: boolean, channels: number, endpoints: number }`
- `POST /asterisk/reload` → `{ ok }` (regenera configs de TODOS os tenants e recarrega)
- `GET /asterisk/preview` → `{ pjsip: string, extensions: string, queues: string }` (arquivos gerados do tenant atual)
- `POST /asterisk/cli` body `{ command }` → `{ output }` (somente superadmin)

## Auditoria
- `GET /audit-logs` (paginado)

## Realtime (Socket.IO)
- Namespace padrão, path `/socket.io`, auth via `auth: { token: accessToken }` no handshake.
- Servidor coloca o socket na room `tenant:<tenantId>` (superadmin pode enviar `tenantId` em `auth` para escolher).
- Eventos emitidos: `event` com payload `RealtimeEvent` (ver `@ura/shared`): `call.started | call.updated | call.ended | queue.updated | endpoint.status | trunk.status`.
- Cliente pode emitir `subscribe` `{ tenantId }` (superadmin).

## Redis
- Canal pub/sub `ura:events`: JSON `RealtimeEvent` (publicado por engine e api).
- Canal `ura:asterisk:reload`: `{ tenantId | 'all' }` — pede para a API regenerar e recarregar.
