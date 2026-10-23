export * from './types.js';
export * from './base/http-client.js';
export * from './base/mappers.js';
export { SqlGenericConnector, type SqlConnectorDeps } from './connectors/sql-generic.js';
export { SgpApiConnector, SgpDbConnector, SGP_DEFAULT_QUERIES } from './connectors/sgp.js';
export { IxcsoftApiConnector, IxcsoftDbConnector } from './connectors/ixcsoft.js';
export { HubsoftApiConnector } from './connectors/hubsoft.js';

import { ErpError, type ErpConnector, type ErpConnectorOptions } from './types.js';
import { SqlGenericConnector } from './connectors/sql-generic.js';
import { SgpApiConnector, SgpDbConnector } from './connectors/sgp.js';
import { IxcsoftApiConnector, IxcsoftDbConnector } from './connectors/ixcsoft.js';
import { HubsoftApiConnector } from './connectors/hubsoft.js';

/**
 * Instancia o conector de ERP conforme o tipo/modo configurados no painel.
 * ispfy/atlaz/receitanet: usar sql_generic com queries mapeaveis (implementacao dedicada futura).
 */
export function createErpConnector(opts: ErpConnectorOptions): ErpConnector {
  switch (opts.type) {
    case 'sgp':
      return opts.mode === 'database' ? new SgpDbConnector(opts) : new SgpApiConnector(opts);
    case 'ixcsoft':
      return opts.mode === 'database' ? new IxcsoftDbConnector(opts) : new IxcsoftApiConnector(opts);
    case 'hubsoft':
      if (opts.mode === 'database') throw new ErpError('HubSoft: apenas modo API suportado', 'NOT_SUPPORTED');
      return new HubsoftApiConnector(opts);
    case 'sql_generic':
    case 'ispfy':
    case 'atlaz':
    case 'receitanet':
      return new SqlGenericConnector(opts);
    default:
      throw new ErpError(`ERP nao suportado: ${String(opts.type)}`, 'NOT_SUPPORTED');
  }
}
