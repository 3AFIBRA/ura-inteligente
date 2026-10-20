#!/usr/bin/env bash
set -euo pipefail

# URA Inteligente — script de instalacao para VPS Ubuntu 24.04 LTS
# Uso: curl ... | bash OU copie para a VPS e execute como root.

LOG="/var/log/ura-install.log"
mkdir -p "$(dirname "$LOG")"
exec >>"$LOG" 2>&1

echo "=== URA Inteligente - Instalador VPS ==="

if [[ $EUID -ne 0 ]]; then
  echo "Execute como root." >&2
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y apt-transport-https ca-certificates curl gnupg lsb-release software-properties-common git ufw fail2ban

# Docker
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" > /etc/apt/sources.list.d/docker.list
apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# GitHub CLI (opcional)
curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg
chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages/stable $(lsb_release -cs) main" > /etc/apt/sources.list.d/github-cli.list
apt-get update
apt-get install -y gh

# Firewall
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 443/udp
ufw allow 5060/tcp
ufw allow 5060/udp
ufw allow 5061/tcp
ufw allow 8088/tcp
ufw allow 8089/tcp
ufw allow 5038/tcp
ufw allow 3478/tcp
ufw allow 3478/udp
ufw allow 5349/tcp
ufw allow 10000:20000/udp
ufw allow 49152:65535/udp
ufw --force enable

# Fail2ban
systemctl enable fail2ban
systemctl start fail2ban

# Diretorio do app
APP_DIR="/opt/ura-inteligente"
mkdir -p "$APP_DIR"
cd "$APP_DIR"

if [[ ! -d .git ]]; then
  read -rp "URL do repositorio GitHub (ou deixe em branco para clonar o padrao): " REPO
  if [[ -n "$REPO" ]]; then
    git clone "$REPO" .
  else
    echo "Clone o repositorio manualmente em $APP_DIR" >&2
    exit 1
  fi
fi

# Cria .env se nao existir
if [[ ! -f .env ]]; then
  cp .env.example .env
  echo "Edite $APP_DIR/.env com seus dados antes de iniciar." >&2
fi

# Permissoes
mkdir -p infra/asterisk/tenants
chmod +x infra/asterisk/entrypoint.sh

# Build (sem cache exagerado para nao estourar memoria)
docker compose build --no-cache

echo "=== Instalacao concluida ==="
echo "1. Edite $APP_DIR/.env"
echo "2. Configure DNS apontando para este servidor: $(hostname -I | awk '{print $1}')"
echo "3. Execute: docker compose up -d"
echo "4. Logs: docker compose logs -f"
echo "5. Seed inicial (apenas 1x): docker compose exec api npm run prisma:seed"
