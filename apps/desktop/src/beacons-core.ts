import { invokeMethod, parseError, parseMethodParams, parseMethodResult } from '@castle-control/contract';
import type { ArtGenerateParams, BeaconsSimulateParams, BeaconsSimulateResult, Contribution, ContributionListParams, CurveSetParams, ErrorEnvelope,
  MethodContract, RpcMethods, Visual, VisualId, VisualUpsertParams } from '@castle-control/contract';
import { validateCoreLaunch } from './core-source.js';
import type { CoreLaunch } from './core-source.js';
import type { PreviewEvent } from './beacons-fixture.js';

type BeaconsMethod = 'beacons.visual.list' | 'beacons.visual.upsert' | 'beacons.curve.set' | 'beacons.simulate'
  | 'beacons.source.url' | 'beacons.contribution.list' | 'beacons.art.status' | 'beacons.art.generate';
/** Restricted transport seam; launch capabilities never enter read snapshots. */
export type BeaconsNetwork = {
  rpc: <M extends BeaconsMethod>(endpoint: string, session: string, method: M, params: RpcMethods[M]['params']) => Promise<unknown>;
};
export type CoreBeaconsSnapshot = {
  visuals: readonly Visual[]; selected?: VisualId; simulation?: BeaconsSimulateResult;
  events: readonly PreviewEvent[];
  art_available: boolean; art_busy: boolean;
  contributions: { phase: 'idle' | 'loading' | 'error' } | { phase: 'ready'; items: readonly Contribution[] };
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
  let snapshot: CoreBeaconsSnapshot = freeze({ visuals: [], events: [], art_available: false, art_busy: false, contributions: { phase: 'idle' },
    busy: false, phase: 'idle', notice: 'Load Beacons from the local core.' });
  let event_serial = 0;
  let art_status_serial = 0;
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
  async function perform<T>(work: () => Promise<T>): Promise<T | undefined> {
    if (snapshot.busy) { publish({ notice: 'A Beacons request is in progress. Wait for its result.' }); return; }
    publish({ busy: true, phase: 'loading' }, ['error']);
    try { const result = await work(); publish({ phase: 'ready' }); return result; }
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
    async loadArtStatus() {
      const serial = ++art_status_serial;
      publish({ art_available: false });
      try {
        const { available } = await call((await contracts()).beaconsArtStatus, {});
        if (serial === art_status_serial) publish({ art_available: available });
      } catch {
        // Optional art stays hidden. Never change the room notice or toast.
        if (serial === art_status_serial) publish({ art_available: false });
      }
    },
    async generateArt(params: ArtGenerateParams) {
      if (snapshot.art_busy || !snapshot.art_available) throw { code: 'unavailable', message: 'Art generation is unavailable or already in progress.' };
      publish({ art_busy: true });
      try {
        const proposed = structuredClone(params);
        const result = await call((await contracts()).beaconsArtGenerate, proposed);
        if (result.design_id !== proposed.design_id) throw new Error('Mismatched art design');
        return result;
      } catch (error: unknown) { throw safeError(error); }
      finally { publish({ art_busy: false }); }
    },
    async loadContributions(params: ContributionListParams) {
      if (snapshot.contributions.phase === 'loading') return;
      const proposed = { ...params };
      // This independent read never blocks configuration/simulation or reuses its rows.
      publish({ contributions: { phase: 'loading' } });
      try {
        const { items } = await call((await contracts()).beaconsContributionList, proposed);
        if (items.length > proposed.limit) throw new Error('Contribution page exceeds requested limit');
        publish({ contributions: { phase: 'ready', items } });
      } catch {
        // Discard stale live rows and never expose upstream prose or synthetic inputs.
        publish({ contributions: { phase: 'error' } });
      }
    },
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
      return perform(async () => {
        const visual = await call((await contracts()).beaconsCurveSet, proposed);
        saved(visual, proposed.visual_id);
        return visual;
      });
    },
    async simulate(params: BeaconsSimulateParams) {
      const proposed = structuredClone(params);
      await perform(async () => {
        publish({}, ['simulation']);
        const simulation = await call((await contracts()).beaconsSimulate, proposed);
        if (simulation.intensity.visual_id !== proposed.visual_id) throw new Error('Mismatched simulation');
        // One row per acknowledged test burst, not a reconstructed Twitch event.
        const event: PreviewEvent = { id: `simulated-core-event-${event_serial++}`, at: new Date().toISOString(),
          visual_id: proposed.visual_id, burst: proposed.burst, label: simulation.label };
        publish({ simulation, events: [event, ...snapshot.events],
          notice: 'Simulated burst computed by the core from an empty state. Saved configuration and live totals are unchanged.' });
      });
    },
    async sourceUrl(visual_id: VisualId) {
      return perform(async () => {
        const result = await call((await contracts()).beaconsSourceUrl, { visual_id });
        publish({ notice: 'Browser-source URL received from the core. Rendering remains unavailable in this connection.' });
        return result;
      });
    },
  };
}
export type CoreBeaconsPort = ReturnType<typeof createCoreBeaconsPort>;
