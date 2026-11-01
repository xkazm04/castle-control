import { parseError } from '@castle-control/contract';
import type { DrawId, ObsConnectParams, RehearsalScenarioParams, RehearsalStatus, Visual, VisualId } from '@castle-control/contract';
import { streamPresets } from '../stream/setup-model.js';
import { createRehearsalPort, methods } from './rehearsal-core.js';
import type { RehearsalConnection, RehearsalShell } from './rehearsal-core.js';
import { rehearsalCopy as copy } from './rehearsal-copy.js';

export type RehearsalPreset = keyof typeof streamPresets;
export type RehearsalRow = Readonly<{
  id: string; name: string; preset: RehearsalPreset; phase: 'idle' | 'added' | 'unavailable' | 'coming';
  kind: 'lot' | 'vote' | 'beacon' | 'duel'; visual_id?: VisualId; draw_id?: DrawId; notice: string;
}>;
export type RehearsalState = Readonly<{
  phase: 'checking' | 'outside' | 'inside'; busy: boolean; status: RehearsalStatus | undefined;
  obs: 'unknown' | 'connected' | 'disconnected'; scene_ready: boolean; notice: string;
  connection_notice: string; scene_notice: string; scenario_notice: string;
  rows: readonly RehearsalRow[]; visuals: readonly Visual[]; visual_id: VisualId | ''; crowd: number;
}>;
type Options = { mode: 'fixture' | 'core'; connection?: RehearsalConnection; shell?: RehearsalShell };
const initialRow = (id: string, name: string, kind: RehearsalRow['kind']): RehearsalRow => ({
  id, name, kind, preset: '1080p', phase: kind === 'lot' ? 'unavailable' : kind === 'duel' ? 'coming' : 'idle',
  notice: kind === 'lot' ? copy.fill_first : kind === 'duel' ? copy.duel_coming : copy.hold,
});
function message(error: unknown): string {
  try { return parseError(JSON.stringify(error)).message; }
  catch { return copy.failed; }
}

export function createRehearsalModel(options: Options) {
  const call = options.mode === 'core' && options.connection ? createRehearsalPort(options.connection) : undefined;
  let state: RehearsalState = Object.freeze({ phase: call ? 'checking' : 'outside', busy: false, status: undefined,
    obs: 'unknown', scene_ready: false, notice: call ? copy.checking : '', connection_notice: '', scene_notice: '', scenario_notice: '',
    rows: [], visuals: [], visual_id: '', crowd: 0 });
  const listeners = new Set<() => void>();
  let closed = false;
  let generation = 0;
  let mutation = 0;
  let reading = false;
  let dirty = false;
  // rehearsal.start is the idempotent status read and emits one invalidation.
  // Consume that echo rather than recursively calling start for our own event.
  let status_echoes = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending_crowd: number | undefined;
  function publish(change: Partial<RehearsalState>) {
    if (closed) return;
    state = Object.freeze({ ...state, ...change });
    for (const listener of listeners) listener();
  }
  async function status() {
    if (!call) throw new Error(copy.unavailable);
    status_echoes++;
    try { return await call(methods.rehearsalStart, {}); }
    catch (error) { status_echoes = Math.max(0, status_echoes - 1); throw error; }
  }
  function acceptStatus(next: RehearsalStatus) {
    publish({ phase: 'inside', status: next, crowd: pending_crowd === undefined ? next.crowd_per_minute : state.crowd,
      obs: next.obs.connected ? 'connected' : 'disconnected', scene_ready: next.scene_name === copy.scene_name, notice: '' });
  }
  async function outputs(run: number) {
    if (!call) return;
    const [lots, beacons, duel] = await Promise.allSettled([
      call(methods.lotsDrawList, {}), call(methods.beaconsVisualList, {}), call(methods.tiltyardSourceUrl, {}),
    ]);
    if (closed || run !== generation) return;
    const draw = lots.status === 'fulfilled' ? lots.value.draws.filter(draw => draw.draw_id.startsWith('simulated-rehearsal-')).at(-1) : undefined;
    const visuals = beacons.status === 'fulfilled' ? beacons.value.visuals : state.visuals;
    const next: RehearsalRow[] = [
      { ...initialRow('lot', copy.lot_plate, 'lot'), ...(draw ? { draw_id: draw.draw_id, phase: 'idle', notice: copy.hold } as const : {}) },
      initialRow('vote', copy.vote_bar, 'vote'),
      ...visuals.map(visual => ({ ...initialRow(`beacon:${visual.visual_id}`, visual.name, 'beacon'), visual_id: visual.visual_id })),
      { ...initialRow('duel', copy.duel_output, 'duel'), ...(duel.status === 'fulfilled' ? { phase: 'idle', notice: copy.hold } as const
        : !unavailable(duel.reason) ? { phase: 'unavailable', notice: message(duel.reason) } as const : {}) },
    ];
    const rows = next.map<RehearsalRow>(row => {
      const prior = state.rows.find(item => item.id === row.id);
      return Object.freeze({ ...row, ...(prior ? { preset: prior.preset } : {}),
        ...(prior?.phase === 'added' && prior.draw_id === row.draw_id ? { phase: prior.phase, notice: prior.notice } : {}) });
    });
    const failure = [lots, beacons, duel].find(result => result.status === 'rejected'
      && !(result === duel && unavailable(result.reason)));
    publish({ rows: Object.freeze(rows), visuals, visual_id: visuals.some(item => item.visual_id === state.visual_id)
      ? state.visual_id : visuals[0]?.visual_id ?? '', ...(failure?.status === 'rejected' ? { notice: message(failure.reason) } : {}) });
  }
  function unavailable(error: unknown) {
    try { return parseError(JSON.stringify(error)).code === 'unavailable'; }
    catch { return false; }
  }
  async function refresh() {
    if (!call || closed) return;
    dirty = true;
    if (reading || state.busy) return;
    reading = true;
    const run = generation;
    try {
      while (dirty && !state.busy && !closed && run === generation) {
        dirty = false;
        const before = mutation;
        try {
          const next = await status();
          if (closed || run !== generation) return;
          if (before !== mutation) { dirty = true; continue; }
          acceptStatus(next);
          await outputs(run);
        } catch (error) {
          if (run === generation && before === mutation) publish({ phase: state.phase === 'checking' ? 'outside' : state.phase,
            status: undefined, obs: 'unknown', scene_ready: false, notice: unavailable(error) ? '' : message(error) });
        }
      }
    } finally {
      reading = false;
      if (dirty && !closed && run !== generation) void refresh();
    }
  }
  async function perform(work: () => Promise<void>, field: 'notice' | 'connection_notice' | 'scene_notice' | 'scenario_notice') {
    if (!call || closed || state.busy || state.phase !== 'inside') return;
    mutation++;
    publish({ busy: true, [field]: '' });
    try { await work(); }
    catch (error) { publish({ [field]: message(error) }); }
    finally { publish({ busy: false }); if (dirty) void refresh(); }
  }
  function sendCrowd() {
    timer = undefined;
    if (closed || !call || pending_crowd === undefined || !state.status?.active) return;
    if (state.busy || reading) { timer = setTimeout(sendCrowd, 300); return; }
    const per_minute = pending_crowd;
    void perform(async () => {
      try {
        const next = await call(methods.rehearsalCrowdSet, { per_minute });
        if (pending_crowd === per_minute) pending_crowd = undefined;
        acceptStatus(next);
      } catch (error) {
        pending_crowd = undefined;
        publish({ crowd: state.status?.crowd_per_minute ?? 0 });
        throw error;
      }
    }, 'scenario_notice');
  }
  const canAdd = (id: string) => {
    const row = state.rows.find(item => item.id === id);
    return Boolean(row && row.phase === 'idle' && state.phase === 'inside' && state.scene_ready && state.obs === 'connected' && !state.busy);
  };
  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    shell_available: options.mode === 'core' && Boolean(options.shell),
    async switchMode() {
      if (!options.shell || options.mode !== 'core' || state.busy) return;
      publish({ busy: true });
      try { await options.shell(state.phase === 'inside' ? 'leave_rehearsal' : 'enter_rehearsal'); }
      catch { publish({ notice: copy.shell_unavailable }); }
      finally { publish({ busy: false }); }
    },
    start() {
      closed = false;
      status_echoes = 0;
      const unsubscribe = options.mode === 'core' ? options.connection?.subscribeEvents(kind => {
        if (kind === 'rehearsal.status' && status_echoes > 0) { status_echoes--; return; }
        if (kind === 'rehearsal.status' || kind === 'obs.status' || kind.startsWith('lots.') || kind === 'resync') void refresh();
      }) : undefined;
      void refresh();
      return () => { closed = true; generation++; dirty = false; status_echoes = 0; clearTimeout(timer); timer = undefined; pending_crowd = undefined; unsubscribe?.(); };
    },
    refresh, canAdd,
    async connect(params: ObsConnectParams) {
      await perform(async () => {
        if (!call) return;
        try {
          const result = await call(methods.obsConnect, params);
          publish({ obs: result.connected ? 'connected' : 'disconnected', connection_notice: result.connected ? copy.connected : copy.disconnected });
        } catch (error) { publish({ obs: 'disconnected', scene_ready: false }); throw error; }
      }, 'connection_notice');
    },
    async ensureScene() {
      if (state.obs !== 'connected') return;
      await perform(async () => {
        if (!call) return;
        await call(methods.obsSceneEnsure, { scene_name: copy.scene_name });
        publish({ scene_ready: true, scene_notice: copy.scene_ready });
      }, 'scene_notice');
    },
    setPreset(id: string, value: string) {
      if (state.busy || !Object.hasOwn(streamPresets, value)) return false;
      publish({ rows: state.rows.map(row => row.id === id ? { ...row, preset: value as RehearsalPreset } : row) }); return true;
    },
    setVisual(id: string) {
      // The catalog was parsed at the RPC door; retain its branded ID, never the DOM string.
      const visual = state.visuals.find(visual => visual.visual_id === id);
      if (visual) publish({ visual_id: visual.visual_id });
    },
    async add(id: string) {
      const row = state.rows.find(item => item.id === id);
      if (!row || !canAdd(id)) return;
      await perform(async () => {
        if (!call) return;
        const source = row.kind === 'lot' ? await call(methods.lotsSourceUrl, { draw_id: row.draw_id })
          : row.kind === 'vote' ? await call(methods.gatehouseSourceUrl, {})
            : row.kind === 'duel' ? await call(methods.tiltyardSourceUrl, {})
              : await call(methods.beaconsSourceUrl, { visual_id: row.visual_id });
        await call(methods.obsSourceCreate, { scene_name: copy.scene_name, source_name: `Castle Control · ${row.name}`,
          url: source.url, ...streamPresets[row.preset] });
        publish({ rows: state.rows.map<RehearsalRow>(item => item.id === id ? { ...item, phase: 'added', notice: copy.added } : item) });
      }, 'scene_notice');
    },
    async clear() {
      if (state.obs !== 'connected') return;
      await perform(async () => {
        if (!call) return;
        const result = await call(methods.obsRehearsalClear, {});
        publish({ scene_notice: copy.removed(result.removed), scene_ready: false,
          rows: state.rows.map<RehearsalRow>(row => row.phase === 'added' ? { ...row, phase: 'idle', notice: copy.hold } : row) });
        dirty = true;
      }, 'scene_notice');
    },
    async scenario(scenario: RehearsalScenarioParams['scenario']) {
      if (!state.status?.active || (scenario === 'beacon_fire' && !state.visual_id)) return;
      await perform(async () => {
        if (!call) return;
        const result = await call(methods.rehearsalScenarioRun, { scenario,
          ...(scenario === 'beacon_fire' ? { visual_id: state.visual_id } : {}) });
        publish({ scenario_notice: result.accepted ? copy.accepted : copy.inactive });
        dirty = true;
      }, 'scenario_notice');
    },
    setCrowd(per_minute: number) {
      if (!call || !state.status?.active || !Number.isInteger(per_minute) || per_minute < 0 || per_minute > 600) return false;
      clearTimeout(timer);
      pending_crowd = per_minute;
      publish({ crowd: per_minute });
      timer = setTimeout(sendCrowd, 300);
      return true;
    },
  };
}
export type RehearsalModel = ReturnType<typeof createRehearsalModel>;
