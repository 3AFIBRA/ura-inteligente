; ============ Transportes ============
[transport-udp]
type = transport
protocol = udp
bind = 0.0.0.0:5060
external_media_address = ${PUBLIC_IP}
external_signaling_address = ${PUBLIC_IP}
local_net = 10.0.0.0/8
local_net = 172.16.0.0/12
local_net = 192.168.0.0/16
local_net = 127.0.0.0/8
allow_reload = yes
tos = cs3
cos = 3

[transport-tcp]
type = transport
protocol = tcp
bind = 0.0.0.0:5060
external_media_address = ${PUBLIC_IP}
external_signaling_address = ${PUBLIC_IP}
local_net = 10.0.0.0/8
local_net = 172.16.0.0/12
local_net = 192.168.0.0/16
local_net = 127.0.0.0/8
allow_reload = yes

[transport-tls]
type = transport
protocol = tls
bind = 0.0.0.0:5061
cert_file = /etc/asterisk/keys/asterisk.crt
priv_key_file = /etc/asterisk/keys/asterisk.key
method = tlsv1_2
external_media_address = ${PUBLIC_IP}
external_signaling_address = ${PUBLIC_IP}
local_net = 10.0.0.0/8
local_net = 172.16.0.0/12
local_net = 192.168.0.0/16
local_net = 127.0.0.0/8
allow_reload = yes

[transport-wss]
type = transport
protocol = wss
bind = 0.0.0.0
external_media_address = ${PUBLIC_IP}
external_signaling_address = ${PUBLIC_IP}
local_net = 10.0.0.0/8
local_net = 172.16.0.0/12
local_net = 192.168.0.0/16
local_net = 127.0.0.0/8

[transport-ws]
type = transport
protocol = ws
bind = 0.0.0.0
external_media_address = ${PUBLIC_IP}
external_signaling_address = ${PUBLIC_IP}
local_net = 10.0.0.0/8
local_net = 172.16.0.0/12
local_net = 192.168.0.0/16
local_net = 127.0.0.0/8

; ============ Templates ============
; Ramal SIP tradicional (softphone/ATA/telefone IP)
[tpl-sip-endpoint](!)
type = endpoint
transport = transport-udp
disallow = all
allow = ulaw
allow = alaw
allow = g722
allow = opus
direct_media = no
rtp_symmetric = yes
force_rport = yes
rewrite_contact = yes
ice_support = no
dtmf_mode = rfc4733
send_pai = yes
send_rpid = yes
device_state_busy_at = 1
language = pt_BR
tone_zone = br
allow_subscribe = yes
inband_progress = no
trust_id_inbound = yes

; Ramal WebRTC (softphone no navegador)
[tpl-webrtc-endpoint](!)
type = endpoint
transport = transport-wss
disallow = all
allow = opus
allow = ulaw
allow = alaw
webrtc = yes
direct_media = no
rtp_symmetric = yes
force_rport = yes
rewrite_contact = yes
ice_support = yes
use_avpf = yes
media_encryption = dtls
dtls_auto_generate_cert = yes
media_use_received_transport = yes
rtcp_mux = yes
dtmf_mode = rfc4733
device_state_busy_at = 1
language = pt_BR
tone_zone = br
allow_subscribe = yes

[tpl-auth](!)
type = auth
auth_type = userpass

[tpl-aor](!)
type = aor
max_contacts = 3
remove_existing = yes
qualify_frequency = 60
qualify_timeout = 5

; Tronco de operadora
[tpl-trunk-endpoint](!)
type = endpoint
transport = transport-udp
disallow = all
allow = ulaw
allow = alaw
allow = g729
direct_media = no
rtp_symmetric = yes
force_rport = yes
rewrite_contact = yes
dtmf_mode = rfc4733
send_pai = yes
trust_id_inbound = yes
language = pt_BR

; ============ Tenants (gerado pela API) ============
#include tenants/pjsip-all.conf
