import { beaconsSourceUrl, beaconsVisualList, invokeMethod, obsConnect,
  obsRehearsalClear, obsSceneEnsure, obsSourceCreate, parseMethodParams, parseMethodResult,
  rehearsalCrowdSet, rehearsalScenarioRun, rehearsalStart, tiltyardSourceUrl } from '@castle-control/contract';
import { gatehouseSourceUrl } from '@castle-control/contract/gatehouse';
// Reuse the independent Lots door. Root Lots handles would hoist the full draw
// validators into the boot chunk shared with status.get, despite this lazy route.
import { lotsDrawList, lotsSourceUrl } from '@castle-control/contract/lots';
import type { EventKind, MethodContract, RpcMethods } from '@castle-control/contract';
import { validateCoreLaunch } from '../core-source.js';
import type { CoreLaunch } from '../core-source.js';
import { rehearsalCopy as copy } from './rehearsal-copy.js';

const methods = { obsConnect, obsRehearsalClear, obsSceneEnsure, obsSourceCreate,
  beaconsSourceUrl, beaconsVisualList, lotsDrawList, lotsSourceUrl, gatehouseSourceUrl,
  rehearsalCrowdSet, rehearsalScenarioRun, rehearsalStart, tiltyardSourceUrl };
type RehearsalMethod = (typeof methods)[keyof typeof methods]['method'];
export type RehearsalNetwork = {
  rpc: <M extends RehearsalMethod>(endpoint: string, session: string, method: M, params: RpcMethods[M]['params']) => Promise<unknown>;
};
export type RehearsalConnection = {
  launch: CoreLaunch; transport?: RehearsalNetwork;
  subscribeEvents: (listener: (kind: EventKind) => void) => () => void;
};
export type RehearsalShell = (command: 'enter_rehearsal' | 'leave_rehearsal') => Promise<void>;

/** All RPC input/result parsing is here. No credentials or source URLs enter read snapshots. */
export function createRehearsalPort(connection: RehearsalConnection) {
  const base = validateCoreLaunch(connection.launch);
  return async <M extends RehearsalMethod>(contract: MethodContract<M>, value: unknown): Promise<RpcMethods[M]['result']> => {
    let params: RpcMethods[M]['params'];
    try { params = parseMethodParams(contract, value); }
    catch { throw { code: 'invalid', message: copy.invalid }; }
    if (!connection.transport) return invokeMethod(base.href, connection.launch.session_token, contract, params);
    const result = await connection.transport.rpc(base.href, connection.launch.session_token, contract.method, params);
    return parseMethodResult(contract, JSON.stringify(result));
  };
}
export { methods };
