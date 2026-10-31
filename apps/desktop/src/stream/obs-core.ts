import { beaconsSourceUrl, beaconsVisualList, invokeMethod, obsSourceCreate, obsStatusGet,
  parseMethodParams, parseMethodResult } from '@castle-control/contract';
import type { MethodContract, ObsSourceParams, RpcMethods, VisualId } from '@castle-control/contract';
import { validateCoreLaunch } from '../core-source.js';
import { gatehouseSourceUrl } from '@castle-control/contract/gatehouse';
import type { CoreLaunch } from '../core-source.js';

type ObsMethod = 'obs.status.get' | 'obs.source.create' | 'beacons.visual.list' | 'beacons.source.url' | 'gatehouse.source.url';
export type ObsNetwork = {
  rpc: <M extends ObsMethod>(endpoint: string, session: string, method: M, params: RpcMethods[M]['params']) => Promise<unknown>;
};
export type StreamConnection = { launch: CoreLaunch; transport?: ObsNetwork };

/** Capabilities and resolved URLs stay in the transport, never in read snapshots. */
export function createObsPort(launch: CoreLaunch, transport?: ObsNetwork) {
  const base = validateCoreLaunch(launch);
  async function call<M extends ObsMethod>(contract: MethodContract<M>, value: unknown): Promise<RpcMethods[M]['result']> {
    const params = parseMethodParams(contract, value);
    if (!transport) return invokeMethod(base.href, launch.session_token, contract, params);
    const result = await transport.rpc(base.href, launch.session_token, contract.method, params);
    return parseMethodResult(contract, JSON.stringify(result));
  }
  return {
    status: () => call(obsStatusGet, {}),
    visuals: () => call(beaconsVisualList, {}),
    source: (visual_id: VisualId) => call(beaconsSourceUrl, { visual_id }),
    voteBarSource: () => call(gatehouseSourceUrl, {}),
    add: (params: ObsSourceParams) => call(obsSourceCreate, params),
  };
}
