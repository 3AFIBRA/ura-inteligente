# URA Inteligente

Plataforma web multi-tenant de URA (Unidade de Resposta Audivel) inteligente sobre Asterisk 20, integrada a ERPs de provedores de internet e ao WhatsApp.

## Funcionalidades

- Multi-tenant com isolamento por PostgreSQL Row Level Security.
- URA com DTMF + ASR/TTS/NLU (OpenAI, Google, Azure).
- Conectores ERP: SGP, ISPFY, IXC Soft, Atlaz, HubSoft, ReceitaNet e SQL generico.
- Envio de 2ª via de boleto por WhatsApp (Meta Cloud API, Evolution API, Z-API).
- Cadastro de novos clientes via URA.
- Troncos VoIP de entrada/saida (registro ou autenticacao por IP).
- Ramais SIP tradicionais e WebRTC (softphone embutido no painel).
- Filas de atendimento humano com estrategias, musica de espera, pausa/login.
- Gravacao de chamadas, CDR, relatorios e supervisao em tempo real.

## Requisitos da VPS

- **SO**: Ubuntu Server 24.04 LTS (64 bits).
- **Virtualizacao**: KVM/VMware/bare-metal (evite OpenVZ/LXC).
- **Recursos minimos**: 4 vCPU, 8 GB RAM, 80 GB SSD NVMe.
- **Recomendado para producao**: 8 vCPU, 16 GB RAM, 160 GB+ SSD.
- **Rede**: IP publico fixo (IPv4) e dominio apontado para a VPS.

### Portas de firewall

- 22/TCP (SSH)
- 80, 443/TCP + 443/UDP (painel, API, WebRTC WSS)
- 5060/UDP+TCP, 5061/TCP (SIP/SIP-TLS)
- 10000-20000/UDP (RTP)
- 3478/UDP+TCP, 5349/TCP (TURN)
- 49152-65535/UDP (relay TURN)

## Instalacao rapida na VPS

Como root:

```bash
curl -fsSL https://raw.githubusercontent.com/SEU_USUARIO/SEU_REPO/main/scripts/install-vps.sh | bash
```

Ou manualmente:

```bash
git clone https://github.com/SEU_USUARIO/SEU_REPO.git /opt/ura-inteligente
cd /opt/ura-inteligente
cp .env.example .env
# edite .env com seus dados
./scripts/install-vps.sh
docker compose up -d
docker compose exec api npm run prisma:migrate
docker compose exec api npm run prisma:seed
```

Acesse `https://seu-dominio.com.br`.

> Guia detalhado para instalacao em VPS da Contabo (incluindo escolha da regiao,
> geracao de chaves e troubleshooting): [docs/instalacao-contabo.md](docs/instalacao-contabo.md)

Usuario padrao:
- **superadmin**: `admin@exemplo.com.br` / `Admin@123`
- **demo tenant admin**: `admin@demo.local` / `Demo@123`
- **demo agente**: `agente@demo.local` / `Demo@123`

## Estrutura

```
apps/api        NestJS — API REST, gerador de configs Asterisk, AMI events, relatórios
apps/engine     Node.js + ARI — execucao dos fluxos de URA
apps/web        React + Vite + Tailwind — painel administrativo e softphone WebRTC
packages/shared Tipos, enums, schema do fluxo e criptografia
packages/erp    Conectores ERP
packages/whatsapp Adaptadores WhatsApp
packages/speech Adaptadores ASR/TTS/NLU
infra/asterisk  Dockerfile e configs base do Asterisk
infra/caddy     Proxy reverso TLS automatico
scripts/        install-vps.sh, backup.sh
```

## Variaveis de ambiente importantes

Edite `.env`:

- `APP_DOMAIN` / `PUBLIC_IP`: dominio e IP fixo da VPS.
- `DATABASE_URL`, `REDIS_URL`, `POSTGRES_*`: banco e cache.
- `JWT_SECRET`, `JWT_REFRESH_SECRET`, `SECRETS_ENCRYPTION_KEY`: chaves de seguranca (64 hex para `SECRETS_ENCRYPTION_KEY`).
- `ARI_*` / `AMI_*`: credenciais de ARI e AMI do Asterisk.
- `TURN_*`: credenciais do servidor TURN para WebRTC.
- `OPENAI_API_KEY` / `GOOGLE_*` / `AZURE_*`: chaves de ASR/TTS/NLU.

## Configuracao de troncos e ramais

1. Acesse o painel com um `tenant_admin`.
2. Em **Troncos**, cadastre a operadora (host, usuario, senha, codecs).
3. Em **Ramais**, crie ramais SIP ou WebRTC.
4. Em **Rotas**, configure as rotas de entrada (DID -> URA/ramal/fila) e de saida (padrao -> tronco).
5. Em **Filas**, monte os agentes e estrategias.
6. Em **Fluxos URA**, edite/publice o fluxo de atendimento.
7. Clique em **Aplicar no Asterisk** para gerar e recarregar as configs.

## Configuracao WebRTC / softphone

O softphone embutido usa JsSIP. Para ramais do tipo **webrtc**, o painel mostra as credenciais automaticamente. Certifique-se de que:

- `APP_DOMAIN` aponta para a VPS.
- Caddy obteve certificado TLS valido.
- `transport-wss` esta carregado no Asterisk.
- coturn esta rodando com `TURN_*` corretos.

## Configuracao de ERP e WhatsApp

1. **Integracoes > ERP**: escolha o provedor, modo (API/banco) e preencha credenciais. Use o botao **Testar**.
2. **Integracoes > WhatsApp**: escolha o provedor e insira token/chave. Use **Testar** e **Enviar mensagem de teste**.
3. **Configuracoes > Speech**: selecione provedores de ASR/TTS/NLU e voz.

## Operacao

```bash
# Ver logs
docker compose logs -f

# Reiniciar servicos
docker compose restart

# Backup manual
./scripts/backup.sh

# Shell no banco
docker compose exec postgres psql -U ura -d ura

# Atualizar (depois de git pull)
docker compose build --no-cache api engine web
docker compose up -d
```

## Troubleshooting

- **WebRTC nao registra**: verifique `wss://seu-dominio/ws`, certificado, firewall UDP/TURN e logs do Asterisk.
- **Sem audio**: libere as portas RTP (10000-20000/UDP) e confirme NAT/PUBLIC_IP.
- **ARI nao conecta**: confira `ARI_URL` e `http.conf` do Asterisk.
- **Erros de SQL**: confira as queries mapeadas do conector SQL generico ou os endpoints do ERP.

## Licenca

MIT
