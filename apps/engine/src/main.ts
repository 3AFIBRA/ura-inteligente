import { env } from './config/env.js';
import { startAriClient } from './ari/client.js';
import { logger } from './logger.js';

async function main() {
  logger.info('Iniciando URA Engine');
  await startAriClient();
}

void main();

process.on('unhandledRejection', (err) => {
  logger.error(err, 'Unhandled rejection');
});
process.on('uncaughtException', (err) => {
  logger.error(err, 'Uncaught exception');
  process.exit(1);
});
