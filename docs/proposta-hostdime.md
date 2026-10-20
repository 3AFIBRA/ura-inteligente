# Roteiro técnico — Proposta HostDime (servidor dedicado João Pessoa)

Objetivo: contratar um servidor dedicado para rodar a **URA Inteligente** (plataforma de telefonia VoIP multi-tenant: Asterisk 20 + Docker + painel web). Antes de fechar, enviar as perguntas abaixo ao especialista da HostDime junto com a solicitação de proposta.

---

## 1. Configuração desejada (base para a proposta)

| Item | Solicitação |
|---|---|
| Processador | Intel Xeon Silver 4114 (10C/20T) — mínimo aceitável |
| RAM | 32 GB |
| Armazenamento | 2x 480 GB **NVMe** (All Flash) — não SSD SATA |
| Backup | Acronis Cyber Protect, ~1 TB de espaço |
| Link | 1 Gbps, tráfego ilimitado |
| IPs | Bloco /29 (com opção de expansão futura) |
| IPv6 | Sim, se incluso |
| SO | Ubuntu Server 24.04 LTS (instalação limpa, sem painel de controle) |
| Data center | João Pessoa (JPA) |

Pedir também, para comparação: **cotação da linha Cloud/VPS da HostDime** com especificação equivalente (4–8 vCPU, 16–32 GB, NVMe) — pode sair bem mais em conta que o dedicado para a fase inicial.

---

## 2. Perguntas essenciais (definem se o VoIP funciona lá)

### Rede e VoIP
1. **O tráfego VoIP (protocolo SIP/RTP) é permitido sem restrições?** A página cita limite para "streaming" — existe qualquer política similar para voz? Existe volume razoável de tráfego de voz (ex.: até ~5 TB/mês) sem throttling/shaping?
2. **O IP público é configurado direto na interface do servidor (sem NAT do provedor)?** Isso simplifica radicalmente a configuração do Asterisk (SDP/RTP corretos sem NAT traversal).
3. **Podemos liberar as seguintes portas no firewall?**
   - 22/TCP (SSH), 80/443 TCP+UDP (painel, API, WSS)
   - 5060/UDP+TCP (SIP), 5061/TCP (SIP-TLS)
   - 10000–20000/UDP (RTP — áudio das chamadas)
   - 3478/UDP+TCP e 5349/TCP (TURN/STUN para WebRTC)
   - 49152–65535/UDP (relay TURN)
4. **Quem administra o firewall?** Se contratarmos o firewall físico/virtual: como solicitamos abertura/alteração de regras e qual o prazo? Podemos optar por gerenciar nosso próprio firewall via `ufw/iptables` no servidor?
5. **É possível configurar PTR (DNS reverso) do IP?** Importante para entrega e reputação junto a operadoras SIP.
6. **A política de uso aceita rodar um PBX/Asterisk com troncos SIP de operadoras?** (alguns provedores barram SIP residencial/comercial por padrão)
7. **Existe IP ou looking glass para testarmos latência/packet loss antes da contratação?** (queremos medir de nossas operadoras SIP e da base de clientes no Nordeste)

### Sistema e acesso
8. **Acesso root completo via SSH?** Instalamos Docker, Asterisk e todo o stack nós mesmos.
9. **Existe acesso a IPMI/iKVM/console out-of-band** para recuperação em caso de travamento?
10. **Podemos reinstalar o SO quantas vezes precisarmos** (durante homologação) e há custo por reinstalação?
11. **Upgrade posterior de RAM/disco/IPs** — é permitido no mesmo servidor? Qual prazo e se gera downtime?

### Comercial e SLA
12. **Preço final mensal** da configuração acima, com e sem os add-ons (backup, firewall, IPv6). Existe taxa de setup?
13. **Contrato:** mínimo de meses? Fidelidade? Mês-a-mês é possível? Condições de rescisão.
14. **SLA de 99,9%:** qual a penalidade em caso de descumprimento? Histórico de uptime do DC de João Pessoa?
15. **Tempo de provisionamento** do dedicado após a assinatura?
16. **LGPD:** a HostDime assina DPA (acordo de tratamento de dados)? A plataforma armazena dados pessoais de clientes finais (CPF/CNPJ, boletos) que precisam permanecer no Brasil.

### Backup
17. O backup Acronis cobre o servidor **completo** (SO + volumes Docker + gravações de chamadas)? Retenção configurável? Como funciona a restauração (autoatendimento ou via suporte)?

---

## 3. E-mail pronto para enviar

> **Assunto:** Solicitação de proposta — servidor dedicado em João Pessoa (aplicação VoIP)
>
> Olá,
>
> Vamos hospedar uma plataforma de telefonia VoIP (PBX Asterisk 20 em Docker, URA de atendimento multi-tenant) e o data center de João Pessoa é forte candidato pela baixa latência para nossos clientes no Nordeste.
>
> Configuração inicial desejada: Xeon Silver 4114, 32 GB RAM, 2x 480 GB NVMe, link 1 Gbps, bloco /29 + IPv6, Ubuntu Server 24.04 LTS limpo, com backup Acronis (~1 TB).
>
> Antes de avançar, precisamos confirmar alguns pontos técnicos:
> 1. Tráfego VoIP (SIP/RTP, ~até 5 TB/mês) é permitido sem shaping? Há qualquer restrição a PBX/Asterisk?
> 2. O IP público fica direto na interface do servidor, sem NAT do provedor?
> 3. Liberação de portas: 5060 UDP/TCP, 5061 TCP, 10000–20000/UDP (RTP), 3478/5349 (TURN) e 49152–65535/UDP — há algum impedimento? O firewall é gerenciado por nós ou por vocês?
> 4. Acessamos root via SSH e há IPMI/iKVM disponível?
> 5. Podemos configurar PTR (DNS reverso)?
> 6. Há IP/looking glass para testarmos latência de nossas operadoras antes de contratar?
> 7. Podem enviar junto uma cotação da linha Cloud/VPS com 8 vCPU / 32 GB / NVMe para comparação?
> 8. Preço final mensal (com e sem add-ons), taxa de setup, prazo mínimo de contrato e tempo de provisionamento?
>
> Sobre LGPD: a plataforma armazena dados pessoais de clientes finais (CPF/CNPJ e boletos). Vocês assinam acordo de tratamento de dados (DPA)?
>
> Obrigado.

---

## 4. Critérios de decisão (comparar com Contabo/Hetzner)

| Critério | Peso | Nota mínima aceitável |
|---|---|---|
| Latência < 40 ms para operadoras SIP e clientes | Alto | Medir antes de contratar |
| SIP/RTP liberado sem restrição | Eliminatório | Sim |
| IP público sem NAT | Alto | Sim (ou NAT 1:1 documentado) |
| Custo mensal total (com backup) | Alto | Comparar R$/mês vs. valor da operação |
| Suporte 24x7 em português | Médio | Sim |
| SLA com penalidade | Médio | 99,9% |
| LGPD / dados no Brasil | Médio | DPA disponível |
