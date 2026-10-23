import ari from 'ari-client';
import type { Client as AriClient } from 'ari-client';
import type { Channel } from 'ari-client';
import { PrismaClient } from '@prisma/client';
import { env } from '../config/env.js';
import { logger } from '../logger.js';
import { CallSession, FlowExecutor, loadFlowForDid } from '../call/session.js';

const prisma = new PrismaClient();
const sessions = new Map<string, CallSession>();

async function handleInbound(client: AriClient, channel: Channel, tenantId: string, did: string) {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) {
    logger.warn({ tenantId }, 'Tenant desconhecido na entrada da chamada');
    void channel.hangup().catch(() => undefined);
    return;
  }
  const loaded = await loadFlowForDid(tenantId, did);
  if (!loaded) {
    logger.warn({ tenantId, did }, 'Nenhum fluxo publicado para o tenant; desligando');
    try {
      await channel.answer();
      await channel.hangup();
    } catch { /* noop */ }
    return;
  }

  const call = await prisma.call.upsert({
    where: { channelId: channel.id },
    create: {
      tenantId, channelId: channel.id, linkedId: channel.id,
      direction: 'inbound', status: 'ringing',
      callerId: channel.caller.number ?? '', callerName: channel.caller.name ?? undefined,
      did, flowId: loaded.flowId,
    },
    update: { status: 'answered', answeredAt: new Date(), did, flowId: loaded.flowId },
  });

  const session = new CallSession(client, channel, tenantId, tenant.name, tenant.slug, did);
  session.vars = {
    ...((call.variables ?? {}) as Record<string, unknown>),
    call: { callerId: channel.caller.number ?? '', did, channel: channel.name },
    tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug },
  };
  session.callRowId = call.id;
  sessions.set(channel.id, session);

  await channel.answer();
  await prisma.call.update({ where: { id: call.id }, data: { status: 'answered', answeredAt: new Date() } }).catch(() => undefined);

  const startNode = loaded.flow.nodes.find((n) => n.type === 'start');
  if (!startNode) {
    logger.error('Fluxo sem no start');
    await channel.hangup().catch(() => undefined);
    return;
  }
  const executor = new FlowExecutor(session, loaded.flow, prisma);
  executor.run(startNode.id).catch((err) => {
    logger.error({ err: String(err) }, 'Erro na execucao do fluxo');
  });
}

/** Retorno de fila (sub-queue -> Stasis queue-exit): retoma o fluxo se houver no de continuação. */
async function handleQueueExit(client: AriClient, channel: Channel, tenantId: string, queueName: string, status: string) {
  const call = await prisma.call.findUnique({ where: { channelId: channel.id } });
  if (!call) { void channel.hangup().catch(() => undefined); return; }
  const stored = (call.variables ?? {}) as Record<string, unknown>;
  const resumeNode = typeof stored.__resume === 'string' ? stored.__resume : null;
  if (!resumeNode) {
    logger.info({ queueName, status }, 'Fila finalizada sem no de retomada; desligando');
    void channel.hangup().catch(() => undefined);
    return;
  }
  const loaded = await loadFlowForDid(tenantId, call.did ?? '');
  if (!loaded) { void channel.hangup().catch(() => undefined); return; }
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
  const session = new CallSession(client, channel, tenantId, tenant.name, tenant.slug, call.did ?? '');
  session.vars = { ...stored, call: { ...(stored.call as object), queueStatus: status, queueName }, tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug }, __lastQueueStatus: status };
  delete session.vars.__resume;
  session.callRowId = call.id;
  sessions.set(channel.id, session);
  const executor = new FlowExecutor(session, loaded.flow, prisma);
  executor.run(resumeNode).catch((err) => {
    logger.error({ err: String(err) }, 'Erro na retomada do fluxo pos-fila');
  });
}

export async function startAriClient() {
  try {
    const client = await ari.connect(env.ARI_URL, env.ARI_USER, env.ARI_PASSWORD);
    logger.info({ url: env.ARI_URL }, 'Conectado ao ARI');
    await client.start(env.ARI_APP);

    client.on('StasisStart', (event, channel) => {
      const appArgs = (event.args ?? []) as string[];
      logger.info({ channelId: channel.id, args: appArgs }, 'StasisStart');
      if (appArgs[0] === 'inbound' && appArgs[1]) {
        void handleInbound(client, channel, appArgs[1], appArgs[2] ?? 's');
      } else if (appArgs[0] === 'queue-exit' && appArgs[1]) {
        void handleQueueExit(client, channel, appArgs[1], appArgs[2] ?? '', appArgs[3] ?? '');
      } else {
        logger.warn({ channelId: channel.id }, 'StasisStart sem args conhecidos; ignorando');
      }
    });

    client.on('StasisEnd', (_event, channel) => {
      logger.info({ channelId: channel.id }, 'StasisEnd');
      const session = sessions.get(channel.id);
      if (session) {
        session.close();
        sessions.delete(channel.id);
      }
    });

    client.on('ChannelDtmfReceived', (event, channel) => {
      sessions.get(channel.id)?.onDtmf(event.digit);
    });

    client.on('ChannelHangupRequest', (_event, channel) => {
      void channel.hangup().catch(() => undefined);
    });
  } catch (err) {
    logger.error({ err: String(err) }, 'Falha ao conectar no ARI');
    setTimeout(() => process.exit(1), 5000);
  }
}
