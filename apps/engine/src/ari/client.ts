import ari from 'ari-client';
import { env } from '../config/env.js';
import { logger } from '../logger.js';

export async function startAriClient() {
  try {
    const client = await ari.connect(env.ARI_URL, env.ARI_USER, env.ARI_PASSWORD);
    logger.info('Conectado ao ARI');
    await client.start(env.ARI_APP);
    client.on('StasisStart', (event, channel) => {
      logger.info({ channelId: channel.id, args: channel.dialplan?.exten }, 'StasisStart');
      void channel.answer();
    });
    client.on('StasisEnd', (_event, channel) => {
      logger.info({ channelId: channel.id }, 'StasisEnd');
    });
    client.on('ChannelHangupRequest', (_event, channel) => {
      void channel.hangup().catch(() => undefined);
    });
  } catch (err) {
    logger.error(err, 'Falha ao conectar no ARI');
    setTimeout(() => process.exit(1), 5000);
  }
}
