export * from './types.js';
export { MetaWhatsappProvider, EvolutionWhatsappProvider, ZapiWhatsappProvider } from './providers.js';

import { WhatsappError, type WhatsappProvider, type WhatsappProviderOptions } from './types.js';
import { MetaWhatsappProvider, EvolutionWhatsappProvider, ZapiWhatsappProvider } from './providers.js';

/** Instancia o provedor de WhatsApp configurado no painel. */
export function createWhatsappProvider(opts: WhatsappProviderOptions): WhatsappProvider {
  switch (opts.provider) {
    case 'meta':
      return new MetaWhatsappProvider(opts as ConstructorParameters<typeof MetaWhatsappProvider>[0]);
    case 'evolution':
      return new EvolutionWhatsappProvider(opts as ConstructorParameters<typeof EvolutionWhatsappProvider>[0]);
    case 'zapi':
      return new ZapiWhatsappProvider(opts as ConstructorParameters<typeof ZapiWhatsappProvider>[0]);
    default:
      throw new WhatsappError(`Provedor WhatsApp nao suportado: ${String(opts.provider)}`);
  }
}
