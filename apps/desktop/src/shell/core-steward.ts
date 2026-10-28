import { createSteward } from '@castle-control/ui/steward';
import type { StewardTransport } from '@castle-control/ui/steward';
import type { StewardConnection } from '../client.js';
import { validateCoreLaunch } from '../core-source.js';

const simulated = createSteward();
type Port = ReturnType<typeof createSteward>;
const ports = new WeakMap<StewardConnection, Port>();
type StewardMethod = 'steward.ask' | 'steward.writ.seal' | 'steward.writ.tear';
type StewardParams = {
  'steward.ask': Parameters<StewardTransport['ask']>[0];
  'steward.writ.seal': Parameters<StewardTransport['seal']>[0];
  'steward.writ.tear': Parameters<StewardTransport['tear']>[0];
};

/** Loaded with the shell, never with initial launch. No new launch parsing or flags. */
export function shellStewardPort(connection?: StewardConnection): Port {
  if (!connection || !connection.reachable()) return simulated;
  const existing = ports.get(connection);
  if (existing) return existing;
  const base = validateCoreLaunch(connection.launch);
  const call = async (work: () => Promise<string>) => {
    if (!connection.reachable()) throw new Error('Core connection unavailable');
    return work();
  };
  // LiveSteward validates request and response text through the contract door.
  // Avoid the generic RPC registry: retaining it would widen the eager bundle.
  async function rpc<M extends StewardMethod>(method: M, params: StewardParams[M]): Promise<string> {
    const response = await fetch(new URL('/rpc', base), {
      method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${connection?.launch.session_token}` },
      body: JSON.stringify({ method, params }), signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error('Steward request unavailable');
    return response.text();
  }
  const transport: StewardTransport = connection.transport ?? {
    ask: params => rpc('steward.ask', params),
    seal: params => rpc('steward.writ.seal', params),
    tear: params => rpc('steward.writ.tear', params),
  };
  const port = createSteward({ live: connection.live, transport: {
    ask: params => call(() => transport.ask(params)),
    seal: params => call(() => transport.seal(params)),
    tear: params => call(() => transport.tear(params)),
  } });
  ports.set(connection, port);
  return port;
}
