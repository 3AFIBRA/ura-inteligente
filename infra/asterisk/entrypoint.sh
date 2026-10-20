#!/bin/sh
set -e

# Renderiza variaveis de ambiente (.env) nos templates *.conf.tpl
for tpl in /etc/asterisk/*.conf.tpl; do
  [ -f "$tpl" ] || continue
  out="${tpl%.tpl}"
  envsubst < "$tpl" > "$out"
done

# Garante os arquivos agregadores gerados pela API
mkdir -p /etc/asterisk/tenants
for f in pjsip-all.conf extensions-all.conf queues-all.conf; do
  [ -f "/etc/asterisk/tenants/$f" ] || touch "/etc/asterisk/tenants/$f"
done

# Certificado TLS para WSS/SIP-TLS: usa o do Caddy (Let's Encrypt) se existir, senao gera auto-assinado
KEYDIR=/etc/asterisk/keys
CADDY_CERT_DIR="/caddy-data/caddy/certificates/acme-v02.api.letsencrypt.org-directory/${APP_DOMAIN}"
if [ -n "$APP_DOMAIN" ] && [ -f "$CADDY_CERT_DIR/${APP_DOMAIN}.crt" ]; then
  cp "$CADDY_CERT_DIR/${APP_DOMAIN}.crt" "$KEYDIR/asterisk.crt"
  cp "$CADDY_CERT_DIR/${APP_DOMAIN}.key" "$KEYDIR/asterisk.key"
elif [ ! -f "$KEYDIR/asterisk.crt" ]; then
  openssl req -x509 -nodes -newkey rsa:2048 -days 3650 \
    -subj "/CN=${APP_DOMAIN:-asterisk.local}" \
    -keyout "$KEYDIR/asterisk.key" -out "$KEYDIR/asterisk.crt" >/dev/null 2>&1 || true
fi
cat "$KEYDIR/asterisk.key" "$KEYDIR/asterisk.crt" > "$KEYDIR/asterisk.pem" 2>/dev/null || true

chown -R asterisk:asterisk /etc/asterisk /var/lib/asterisk /var/spool/asterisk /var/log/asterisk /var/run/asterisk

exec "$@"
