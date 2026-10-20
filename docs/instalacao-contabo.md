# Instalação na Contabo Cloud VPS 4

Guia passo a passo para subir a URA Inteligente em uma **Contabo Cloud VPS 4** (4 vCPU, 8 GB RAM, 100 GB SSD) rodando Ubuntu 24.04.

## 1. Pedir a VPS na Contabo

1. Acesse [contabo.com](https://contabo.com/) > **VPS** > **Cloud VPS 4**.
2. Escolha a **região**: para o Brasil, a melhor opção da Contabo é **Estados Unidos (East/Central)** — latência ~140–160 ms contra ~200 ms da Europa.
3. **Imagem**: `Ubuntu 24.04 LTS (64 bit)`.
4. Adicionais recomendados:
   - **NVMe upgrade** (100 GB NVMe no lugar do SSD) — opcional, melhora banco e gravações.
   - **Auto Backup** — recomendado (custo extra ~US$ 2–3/mês).
5. Adicione uma **senha root forte** ou chave SSH.
6. Finalize a compra. Em alguns minutos você recebe o e-mail com:
   - IP público da VPS
   - usuário `root` e senha

> A Contabo cobra um valor de setup único na primeira mensalidade. Os próximos meses saem pelo valor promocional (se pagar 12 meses adiantadas, o desconto é maior).

## 2. DNS

Antes de instalar, aponte um subdomínio para o IP da VPS:

```
Tipo   Nome              Valor           TTL
A      ura.seudominio   IP_DA_VPS       3600
```

Aguarde a propagação (pode conferir com `ping ura.seudominio`).

## 3. Primeiro acesso

No seu computador:

```bash
ssh root@IP_DA_VPS
```

Atualize o sistema:

```bash
apt update && apt upgrade -y
timedatectl set-timezone America/Sao_Paulo
```

## 4. Sincronizar horário (importante para TLS e CDR)

O Caddy precisa do relógio correto para emitir certificados:

```bash
apt install -y chrony
systemctl enable --now chrony
```

## 5. Baixar o projeto e instalar

```bash
git clone https://github.com/3AFIBRA/ura-inteligente.git /opt/ura-inteligente
cd /opt/ura-inteligente
```

### 5.1 Gerar as chaves de segurança

Gere os valores seguros antes de editar o `.env`:

```bash
# JWT secrets (64 caracteres hex cada)
openssl rand -hex 32
openssl rand -hex 32

# Chave de criptografia das credenciais (64 caracteres hex)
openssl rand -hex 32

# Senha do ARI e do AMI
openssl rand -hex 16

# Senha do TURN
openssl rand -hex 16
```

Anote todos os valores gerados.

### 5.2 Editar o `.env`

```bash
cp .env.example .env
nano .env
```

Preencha obrigatoriamente:

```env
APP_DOMAIN=ura.seudominio.com.br
PUBLIC_IP=IP_DA_VPS

POSTGRES_PASSWORD=<senha forte qualquer>
DATABASE_URL=postgresql://ura:<mesma senha>@postgres:5432/ura?schema=public

JWT_SECRET=<primeiro openssl rand>
JWT_REFRESH_SECRET=<segundo openssl rand>
SECRETS_ENCRYPTION_KEY=<terceiro openssl rand — 64 chars hex>

SUPERADMIN_EMAIL=voce@suaempresa.com.br
SUPERADMIN_PASSWORD=<senha forte>

ARI_PASSWORD=<senha ari gerada>
AMI_PASSWORD=<senha ami gerada>

TURN_REALM=ura.seudominio.com.br
TURN_PASSWORD=<senha turn gerada>

ACME_EMAIL=voce@suaempresa.com.br
```

> **Atenção ao `PUBLIC_IP`**: confirme o IP real com `curl -4 ifconfig.me` dentro da VPS. Ele é usado na configuração NAT do Asterisk e do TURN — errar esse valor quebra o áudio das chamadas.

### 5.3 Rodar o instalador

```bash
chmod +x scripts/install-vps.sh
./scripts/install-vps.sh
```

O script instala Docker, Docker Compose, UFW (firewall), fail2ban e prepara tudo.

> Se ele pedir URL do repositório, o clone já foi feito no passo 5 — pode interromper e continuar manualmente abaixo.

## 6. Subir a stack

```bash
cd /opt/ura-inteligente
docker compose build
docker compose up -d
```

Acompanhe a subida (o build do Asterisk compila do código-fonte e **pode levar 20–40 minutos na primeira vez** — é normal na VPS de 4 vCPU):

```bash
docker compose logs -f
```

## 7. Migrations e seed

```bash
docker compose exec api npx prisma migrate deploy --schema apps/api/prisma/schema.prisma
docker compose exec api npm run prisma:seed
```

## 8. Verificar

```bash
# Todos os containers no ar
docker compose ps

# API saudável
curl -k https://ura.seudominio.com.br/api/health

# Asterisk respondendo
docker compose exec asterisk asterisk -rx "core show version"

# Troncos SIP registrados
docker compose exec asterisk asterisk -rx "pjsip show contacts"
```

Acesse o painel: `https://ura.seudominio.com.br`

Usuários criados pelo seed:

| Perfil | Login | Senha |
|---|---|---|
| Superadmin | definido em `SUPERADMIN_EMAIL` | definido em `SUPERADMIN_PASSWORD` |
| Admin do tenant demo | `admin@demo.local` | `Demo@123` |
| Agente (WebRTC) | `agente@demo.local` | `Demo@123` |

> Troque todas as senhas no primeiro login.

## 9. Configuração inicial no painel

1. **Tenants** (como superadmin): crie o tenant da sua empresa.
2. **Troncos**: cadastre a operadora VoIP (host, usuário, senha, codecs).
3. **Ramais**: crie um ramal SIP (para softphone tipo Zoiper) e um WebRTC (para o painel).
4. **Rotas**: entrada (DID → URA) e saída (padrão → tronco).
5. **Filas**: cadastre agentes e estratégia.
6. **Fluxos URA**: publique o fluxo padrão e ajuste os textos.
7. **Integrações**: configure ERP e WhatsApp com suas credenciais.

## 10. Teste de chamada rápido

Para validar a telefonia sem cliente real, use um softphone gratuito:

1. Baixe o **Zoiper** (ou Linphone) no seu celular/PC.
2. Cadastre o ramal SIP com os dados de `Ramais > Credenciais`.
3. Ligue para o DID da sua operadora e verifique se a URA atende.
4. Teste também o softphone WebRTC dentro do painel.

## Problemas comuns na Contabo

| Sintoma | Causa provável | Solução |
|---|---|---|
| Sem áudio / áudio cortado | `PUBLIC_IP` errado ou RTP bloqueado | Confirme o IP com `curl -4 ifconfig.me`; verifique UFW (`ufw status`) |
| WebRTC não registra | Certificado ou WSS | Veja `docker compose logs caddy`; teste `wss://ura.seudominio.com.br/ws` |
| Certificado TLS falhou | DNS ainda não propagado ou porta 80 bloqueada | Confirme o DNS e `ufw allow 80/tcp` |
| Asterisk não sobe | Build falhou por memória | Rode `docker compose build asterisk` novamente; feche outros serviços durante o build |
| Latência alta nas chamadas | Datacenter longe | Considere migrar para região EUA ou provedor no Brasil |
| VPS lenta em horário de pico | CPU compartilhada | Monitore com `htop`; se persistir, faça upgrade para Cloud VPS 6 |

## Backups

Programe o backup diário (inclui banco, gravações e configs):

```bash
crontab -e
# adicione:
0 3 * * * /opt/ura-inteligente/scripts/backup.sh >> /var/log/ura-backup.log 2>&1
```

Também ative o **Auto Backup da Contabo** no painel deles para snapshot completo da VPS.

## Custos resumidos

| Item | Valor |
|---|---|
| Cloud VPS 4 (mensal) | ~US$ 5–7/mês |
| Auto Backup (opcional) | ~US$ 2–3/mês |
| NVMe upgrade (opcional) | pequeno adicional |
| Total para testes | ~US$ 5–10/mês |
