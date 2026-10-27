import { invokeMethod, parseError, parseMethodParams, parseMethodResult } from '@castle-control/contract';
import type { BeaconsSimulateParams, BeaconsSimulateResult, CurveSetParams, ErrorEnvelope,
  MethodContract, RpcMethods, Visual, VisualId, VisualUpsertParams } from '@castle-control/contract';
import { validateCoreLaunch } from './core-source.js';
import type { CoreLaunch } from './core-source.js';

type BeaconsMethod = 'beacons.visual.list' | 'beacons.visual.upsert' | 'beacons.curve.set' | 'beacons.simulate';
/** Restricted transport seam; launch capabilities never enter read snapshots. */
export type BeaconsNetwork = {
  rpc: <M extends BeaconsMethod>(endpoint: string, session: string, method: M, params: RpcMethods[M]['params']) => Promise<unknown>;
};
export type CoreBeaconsSnapshot = {
  visuals: readonly Visual[]; selected?: VisualId; simulation?: BeaconsSimulateResult;
  busy: boolean; phase: 'idle' | 'loading' | 'ready' | 'error'; notice: string; error?: ErrorEnvelope;
};

function freeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
function safeError(error: unknown): ErrorEnvelope {
  try {
    const envelope = parseError(JSON.stringify(error));
    // Upstream prose and detail may contain secrets; keep only typed code/timing.
    return { code: envelope.code, message: 'Beacons request failed.',
      ...(envelope.retry_after_ms === undefined ? {} : { retry_after_ms: envelope.retry_after_ms }) };
  } catch {
    return { code: 'unavailable', message: 'The result is unavailable or invalid. Refresh before trying again; no preview was substituted.' };
  }
}

export function createCoreBeaconsPort(launch: CoreLaunch, transport?: BeaconsNetwork) {
  const base = validateCoreLaunch(launch);
  let validators: ReturnType<typeof importValidators> | undefined;
  function importValidators() { return import('@castle-control/contract/beacons'); }
  const contracts = () => validators ??= importValidators();
  let snapshot: CoreBeaconsSnapshot = freeze({ visuals: [], busy: false, phase: 'idle', notice: 'Load Beacons from the local core.' });
  const listeners = new Set<() => void>();
  function publish(change: Partial<CoreBeaconsSnapshot>, omit: ('selected' | 'simulation' | 'error')[] = []) {
    const previous = { ...snapshot };
    for (const key of omit) delete previous[key];
    snapshot = freeze({ ...previous, ...change });
    for (const listener of listeners) listener();
  }
  async function call<M extends BeaconsMethod>(contract: MethodContract<M>, value: unknown): Promise<RpcMethods[M]['result']> {
    const params = parseMethodParams(contract, value);
    if (!transport) return invokeMethod(base.href, launch.session_token, contract, params);
    const result = await transport.rpc(base.href, launch.session_token, contract.method, params);
    return parseMethodResult(contract, JSON.stringify(result));
  }
  async function perform(work: () => Promise<void>) {
    if (snapshot.busy) { publish({ notice: 'A Beacons request is in progress. Wait for its result.' }); return; }
    publish({ busy: true, phase: 'loading' }, ['error']);
    try { await work(); publish({ phase: 'ready' }); }
    catch (error: unknown) {
      const safe = safeError(error);
      publish({ phase: 'error', error: safe, notice: `Beacons request failed: ${safe.code}. ${safe.message}${
        safe.retry_after_ms === undefined ? '' : ` Retry after ${safe.retry_after_ms} ms.`}` });
    } finally { publish({ busy: false }); }
  }
  function saved(visual: Visual, expected: VisualId) {
    if (visual.visual_id !== expected) throw new Error('Mismatched visual');
    const visuals = snapshot.visuals.some(item => item.visual_id === expected)
      ? snapshot.visuals.map(item => item.visual_id === expected ? visual : item) : [...snapshot.visuals, visual];
    publish({ visuals, selected: visual.visual_id, notice: 'Visual configuration saved by the core.' }, ['simulation']);
  }
  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    async load() {
      await perform(async () => {
        const selected = snapshot.selected;
        publish({ visuals: [] }, ['selected', 'simulation']);
        const { visuals } = await call((await contracts()).beaconsVisualList, {});
        const current = visuals.find(item => item.visual_id === selected) ?? visuals[0];
        publish({ visuals, ...(current ? { selected: current.visual_id } : {}),
          notice: current ? 'Visual configurations loaded from the core. Live intensity is unavailable.' : 'No visuals configured in the core.' });
      });
    },
    select(id: VisualId) {
      if (snapshot.busy || !snapshot.visuals.some(item => item.visual_id === id)) return;
      publish({ selected: id }, ['simulation']);
    },
    async upsert(params: VisualUpsertParams) {
      const proposed = structuredClone(params);
      await perform(async () => { saved(await call((await contracts()).beaconsVisualUpsert, proposed), proposed.visual.visual_id); });
    },
    async setCurve(params: CurveSetParams) {
      const proposed = structuredClone(params);
      await perform(async () => { saved(await call((await contracts()).beaconsCurveSet, proposed), proposed.visual_id); });
    },
    async simulate(params: BeaconsSimulateParams) {
      const proposed = structuredClone(params);
      await perform(async () => {
        publish({}, ['simulation']);
        const simulation = await call((await contracts()).beaconsSimulate, proposed);
        if (simulation.intensity.visual_id !== proposed.visual_id) throw new Error('Mismatched simulation');
        publish({ simulation, notice: 'Simulated burst computed by the core from an empty state. Saved configuration and live totals are unchanged.' });
      });
    },
  };
}
export type CoreBeaconsPort = ReturnType<typeof createCoreBeaconsPort>;
