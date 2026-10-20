#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/opt/ura-inteligente"
cd "$APP_DIR"

BACKUP_DIR="/var/backups/ura/$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP_DIR"

echo "Backup iniciado em $BACKUP_DIR"

# PostgreSQL
docker compose exec -T postgres pg_dump -U ura -d ura > "$BACKUP_DIR/ura.sql" || true

# Redis (RDB)
docker compose cp redis:/data/dump.rdb "$BACKUP_DIR/dump.rdb" || true

# Gravacoes
tar czf "$BACKUP_DIR/recordings.tar.gz" -C /var/spool/asterisk monitor || true

# Configs do Asterisk
tar czf "$BACKUP_DIR/asterisk-configs.tar.gz" infra/asterisk/tenants || true

echo "Backup concluido: $BACKUP_DIR"

# Remove backups com mais de 30 dias
find /var/backups/ura -maxdepth 1 -type d -mtime +30 -exec rm -rf {} \; || true
