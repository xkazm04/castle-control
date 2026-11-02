import { coreGatehouseConnection } from '../../client.js';
import { createCoreGatehousePort } from '../../gatehouse-core.js';
import type { CoreGatehousePort } from '../../gatehouse-core.js';
import type { Snapshot } from '../../model.js';

/** The one core Gatehouse port for a snapshot, shared by the room and the Steward's flows. */
export function gatehousePort(snapshot: Snapshot): CoreGatehousePort | undefined {
  const connection = coreGatehouseConnection(snapshot);
  if (!connection) return undefined;
  connection.port ??= createCoreGatehousePort(connection.launch, connection.transport);
  return connection.port;
}
