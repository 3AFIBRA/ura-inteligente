# Convenções de nomes e dialplan gerado por tenant

Arquivos gerados pela API em `ASTERISK_CONFIG_DIR` (`/etc/asterisk/tenants`), um conjunto por tenant (`<slug>` = `Tenant.slug`):

- `pjsip-t<slug>.conf`, `extensions-t<slug>.conf`, `queues-t<slug>.conf`
- Agregadores reescritos a cada geração: `pjsip-all.conf`, `extensions-all.conf`, `queues-all.conf` contendo `#include tenants/<arquivo>` de cada tenant ativo.
- Após escrever, a API executa via AMI: `pjsip reload`, `dialplan reload`, `queue reload all`.

## PJSIP (`pjsip-t<slug>.conf`)
Ramal `<number>` (templates em `infra/asterisk/config/pjsip.conf.tpl`):
```
[t<slug>-<number>](tpl-sip-endpoint)        ; ou (tpl-webrtc-endpoint) quando type=webrtc
auth = t<slug>-<number>-auth
aors = t<slug>-<number>
context = tenant-<slug>
callerid = "<name>" <<number>>
set_var = URA_TENANT=<tenantId>
set_var = URA_EXT=<number>
disallow = all
allow = <codec>...        ; um por linha
mailboxes = <number>@t<slug>  ; se voicemail

[t<slug>-<number>-auth](tpl-auth)
username = t<slug>-<number>
password = <secret>

[t<slug>-<number>](tpl-aor)
max_contacts = <maxContacts>
```
Tronco `<name>`:
```
[t<slug>-trk-<name>](tpl-trunk-endpoint)
context = tenant-<slug>-in-<name>
transport = transport-<udp|tcp|tls>
aors = t<slug>-trk-<name>
outbound_auth = t<slug>-trk-<name>-auth     ; se authMode=register ou com username
from_user / from_domain / callerid conforme campos
disallow=all + allow por codec
set_var = URA_TENANT=<tenantId>
set_var = URA_TRUNK=<name>

[t<slug>-trk-<name>-auth](tpl-auth)         ; se username
username = <username>
password = <password>

[t<slug>-trk-<name>]
type = aor
contact = sip:<host>:<port>;transport=<transport>
qualify_frequency = 60 (se qualify)

[t<slug>-trk-<name>-identify]
type = identify
endpoint = t<slug>-trk-<name>
match = <host>            ; + cada allowedIps

[t<slug>-trk-<name>-reg]                    ; somente authMode=register
type = registration
transport = transport-<transport>
outbound_auth = t<slug>-trk-<name>-auth
server_uri = sip:<host>:<port>
client_uri = sip:<username>@<host>:<port>
contact_user = <username>
retry_interval = 60
forbidden_retry_interval = 600
expiration = 3600
line = yes
endpoint = t<slug>-trk-<name>
```

## Dialplan (`extensions-t<slug>.conf`)
```
; Entrada por tronco: uma por tronco, rotas ordenadas por priority
[tenant-<slug>-in-<trunk>]
exten => <did>,1,NoOp(Entrada <route.name> tenant=<slug>)
 same => n,Set(__URA_TENANT=<tenantId>)
 same => n,Set(__URA_DID=${EXTEN})
 same => n,Set(__URA_TRUNK=<trunk>)
 same => n,Set(CDR(accountcode)=<tenantId>)
 ; se route.record:
 same => n,Set(__URA_RECFILE=${RECDIR}/<tenantId>/${STRFTIME(${EPOCH},,%Y%m%d)}/${UNIQUEID}.wav)
 same => n,MixMonitor(${URA_RECFILE},b)
 ; destino ivr:
 same => n,Set(__URA_FLOW=<flowId>)
 same => n,Gosub(sub-ura,s,1(<tenantId>,${EXTEN}))
 ; destino extension:
 same => n,Dial(PJSIP/t<slug>-<number>,30,tTkK)
 ; destino queue:
 same => n,Gosub(sub-queue,s,1(t<slug>-<queue>,600,<tenantId>))
 same => n,Hangup()
; rotas sem tronco especifico (trunkId null) sao replicadas em todos os contextos de entrada do tenant

; Contexto interno do tenant (ramais discam aqui)
[tenant-<slug>]
exten => <number>,1,Set(__URA_TENANT=<tenantId>)        ; para cada ramal
 same => n,Set(CDR(accountcode)=<tenantId>)
 ; se extension.record: MixMonitor igual acima
 same => n,Dial(PJSIP/t<slug>-<number>,30,tTkK)
 same => n,GotoIf($["${DIALSTATUS}"="BUSY"]?busy:unavail)
 same => n(busy),Busy(10)
 same => n(unavail),Hangup()
exten => *98,1,VoiceMailMain(@t<slug>)
; filas discaveis por *<n>? nao. Rotas de saida ordenadas por priority:
exten => <pattern>,1,Set(__URA_TENANT=<tenantId>)
 same => n,Set(CDR(accountcode)=<tenantId>)
 same => n,Set(CALLERID(num)=<callerId ou trunk.outboundCallerId, se definido>)
 ; se route.record: MixMonitor
 same => n,Dial(PJSIP/<prependDigits>${EXTEN:<stripDigits>}@t<slug>-trk-<trunk>,60,T)
 same => n,Hangup()

; Entrada em fila usada pelo engine (continueInDialplan) e pela API
[tenant-<slug>-queues]
exten => <queueName>,1,Gosub(sub-queue,s,1(t<slug>-<queueName>,<timeout 600>,<tenantId>))
 same => n,Hangup()

; Executar um fluxo especifico (continueInDialplan / transferencias para URA)
[tenant-<slug>-ura]
exten => <flowId>,1,Set(__URA_FLOW=<flowId>)
 same => n,Gosub(sub-ura,s,1(<tenantId>,${URA_DID}))
 same => n,Hangup()
```

## Filas (`queues-t<slug>.conf`)
```
[t<slug>-<name>](tpl-queue)
strategy = <strategy>
timeout = <timeoutSec>
retry = <retrySec>
wrapuptime = <wrapupSec>
maxlen = <maxLen>
musicclass = <musicClass>
announce-position = yes|no
announce-holdtime = yes|no
announce-frequency = <announceFrequency>
member => Local/t<slug>-<number>@queue-agent/n,<penalty>,<extension.name>,PJSIP/t<slug>-<number>
```

## Argumentos do Stasis (engine)
- Entrada na URA: `Stasis(ura-engine,inbound,<tenantId>,<did>)`. Variáveis de canal: `URA_TENANT`, `URA_DID`, `URA_FLOW`, `URA_TRUNK`, `URA_RECFILE`.
- Saída da fila: `Stasis(ura-engine,queue-exit,<tenantId>,<queueAsteriskName>,<QUEUESTATUS>)` — o engine retoma o fluxo do canal (estado em memória por channel id) no nó `onTimeout`.
- Perna originada pelo engine (transferência): `app=ura-engine`, `appArgs=dial,<channelIdOrigem>`.
- Para colocar uma chamada na fila o engine usa `channels.continueInDialplan({ context: 'tenant-<slug>-queues', extension: <queueName>, priority: 1 })`.
- Para transferir a ramal/externo o engine origina `Local/<destino>@tenant-<slug>/n` com `app=ura-engine`, `appArgs=dial,<channelId>` e faz bridge.

## Gravações
Caminho: `RECORDINGS_DIR/<tenantId>/<YYYYMMDD>/<UNIQUEID>.wav`. O engine lê `URA_RECFILE` e cria `Recording` + vincula em `Call.recordingId`. A API serve via `/recordings/:id/stream`.

## Eventos AMI tratados pela API
`QueueCallerJoin`, `QueueCallerLeave`, `QueueCallerAbandon`, `AgentConnect`, `AgentComplete`, `QueueMemberStatus`, `QueueMemberPause`, `ContactStatus`, `Registry`, `PeerStatus`, `DeviceStateChange`, `Hangup`. Tenant resolvido pelo prefixo `t<slug>-` do nome da fila/endpoint ou pela variável `URA_TENANT`.
