[general]
static = yes
writeprotect = no
clearglobalvars = no

[globals]
ARI_APP = ${ARI_APP}
RECDIR = /var/spool/asterisk/monitor

; Entrada de troncos sem contexto especifico cai aqui (seguranca)
[from-unknown]
exten => _X.,1,NoOp(Chamada de origem desconhecida ${CALLERID(all)} para ${EXTEN})
 same => n,Hangup(21)

[default]
exten => _X.,1,Hangup(21)

; ============ Macros / sub-rotinas compartilhadas ============
; Entrada para a URA via ARI. ARG1 = tenantId, ARG2 = did
[sub-ura]
exten => s,1,NoOp(URA tenant=${ARG1} did=${ARG2} from=${CALLERID(num)})
 same => n,Set(CHANNEL(hangup_handler_push)=sub-hangup,s,1)
 same => n,Set(__URA_TENANT=${ARG1})
 same => n,Set(__URA_DID=${ARG2})
 same => n,Stasis(${ARI_APP},inbound,${ARG1},${ARG2})
 same => n,Hangup()

[sub-hangup]
exten => s,1,NoOp(Hangup handler ${CHANNEL} cause=${HANGUPCAUSE})
 same => n,Return()

; Entra na fila. ARG1 = nome da fila no asterisk, ARG2 = timeout, ARG3 = tenantId
[sub-queue]
exten => s,1,NoOp(Fila ${ARG1} tenant=${ARG3})
 same => n,Set(__URA_QUEUE=${ARG1})
 same => n,Set(CDR(userfield)=queue:${ARG1})
 same => n,Queue(${ARG1},tTkK,,,${ARG2})
 same => n,NoOp(Saiu da fila: ${QUEUESTATUS})
 same => n,Stasis(${ARI_APP},queue-exit,${ARG3},${ARG1},${QUEUESTATUS})
 same => n,Hangup()

; Agente da fila (membro) chamado via Local channel
[queue-agent]
exten => _[A-Za-z0-9].,1,NoOp(Fila -> agente ${EXTEN})
 same => n,Dial(PJSIP/${EXTEN},30,tTkK)
 same => n,Hangup()

; ============ Tenants (gerado pela API) ============
#include tenants/extensions-all.conf
