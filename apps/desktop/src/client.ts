import { createCoreSource } from './core-source.js';
import type { CoreLaunch, Network } from './core-source.js';
import { createReadModel } from './model.js';
import { createSimulatedSource } from './simulated.js';
import type { Snapshot } from './model.js';
import type { CoreLotsPort, LotsNetwork } from './lots-core.js';
import type { CoreGatehousePort, GatehouseNetwork } from './gatehouse-core.js';
import type { CoreBeaconsPort, BeaconsNetwork } from './beacons-core.js';
import type { StewardTransport } from '@castle-control/ui/steward';
import type { StreamConnection } from './stream/obs-core.js';

const streamConnections = new WeakMap<Snapshot, StreamConnection>();
export function coreStreamConnection(snapshot: Snapshot) { return streamConnections.get(snapshot); }

type LotsConnection = { launch: CoreLaunch; transport?: LotsNetwork; port?: CoreLotsPort };
const lotsConnections = new WeakMap<Snapshot, LotsConnection>();
/** In-memory only, per client. Keep capabilities out of snapshots and preserve lazy rooms. */
export function coreLotsConnection(snapshot: Snapshot) { return lotsConnections.get(snapshot); }
type GatehouseConnection = { launch: CoreLaunch; transport?: GatehouseNetwork; port?: CoreGatehousePort };
const gatehouseConnections = new WeakMap<Snapshot, GatehouseConnection>();
export function coreGatehouseConnection(snapshot: Snapshot) { return gatehouseConnections.get(snapshot); }

type BeaconsConnection = { launch: CoreLaunch; transport?: BeaconsNetwork; port?: CoreBeaconsPort };
const beaconsConnections = new WeakMap<Snapshot, BeaconsConnection>();
export function coreBeaconsConnection(snapshot: Snapshot) { return beaconsConnections.get(snapshot); }

export type StewardConnection = { launch: CoreLaunch; live: boolean; reachable: () => boolean; transport?: StewardTransport };
const stewardConnections = new WeakMap<Snapshot, StewardConnection>();
/** Ready core reads prove reachability; capabilities never enter the serializable read model. */
export function coreStewardConnection(snapshot: Snapshot) {
  return snapshot.phase === 'ready' ? stewardConnections.get(snapshot) : undefined;
}

export type Launch = { mode: 'fixture' } | (CoreLaunch & { steward: 'live' | 'simulated' });

// The shell injects an object in memory before loading main.tsx. Never use URL
// parameters, storage, logs or environment variables for the session capability.
export function parseLaunch(value: unknown): Launch {
  if (typeof value !== 'object' || value === null) throw new Error('Missing shell launch');
  if ('mode' in value && value.mode === 'fixture' && Object.keys(value).length === 1) return { mode: 'fixture' };
  const steward = 'steward' in value ? value.steward : 'simulated';
  if ('mode' in value && value.mode === 'core'
      && 'endpoint' in value && typeof value.endpoint === 'string'
      && 'session_token' in value && typeof value.session_token === 'string'
      && (steward === 'live' || steward === 'simulated')
      && Object.keys(value).length === ('steward' in value ? 4 : 3)
      && Object.keys(value).every(key => ['mode', 'endpoint', 'session_token', 'steward'].includes(key))) {
    return { mode: 'core', endpoint: value.endpoint, session_token: value.session_token, steward };
  }
  throw new Error('Invalid shell launch');
}

export function createDesktopClient(value: unknown, transport?: Network, lots_transport?: LotsNetwork,
  gatehouse_transport?: GatehouseNetwork, steward_transport?: StewardTransport) {
  const launch = parseLaunch(value);
  // Fixture mode has no endpoint or network dependency, even at runtime.
  const client = createReadModel(launch.mode === 'fixture' ? createSimulatedSource() : createCoreSource(launch, transport));
  if (launch.mode === 'fixture') return client;
  const connection: LotsConnection = { launch, ...(lots_transport ? { transport: lots_transport } : {}) };
  const gatehouse: GatehouseConnection = { launch, ...(gatehouse_transport ? { transport: gatehouse_transport } : {}) };
  const beacons: BeaconsConnection = { launch };
  const stream: StreamConnection = { launch };
  const steward: StewardConnection = { launch, live: launch.steward === 'live',
    reachable: () => client.getSnapshot().phase === 'ready',
    ...(steward_transport ? { transport: steward_transport } : {}) };
  return { ...client, getSnapshot() {
    const snapshot = client.getSnapshot();
    lotsConnections.set(snapshot, connection);
    gatehouseConnections.set(snapshot, gatehouse);
    beaconsConnections.set(snapshot, beacons);
    streamConnections.set(snapshot, stream);
    stewardConnections.set(snapshot, steward);
    return snapshot;
  } };
}
