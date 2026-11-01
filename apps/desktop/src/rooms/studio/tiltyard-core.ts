import { invokeMethod, maproomStageGet, maproomTurnRun, parseError, parseMethodParams,
  parseMethodResult, tiltyardSourceUrl } from '@castle-control/contract';
import type { EventKind, MethodContract, RpcMethods, TiltyardAction, TiltyardStageResult } from '@castle-control/contract';
import type { DuelEvent } from '@castle-control/duel';
import { validateCoreLaunch } from '../../core-source.js';
import type { CoreLaunch } from '../../core-source.js';
import type { Snapshot } from '../../model.js';

type Method = 'maproom.stage.get' | 'maproom.turn.run' | 'tiltyard.source.url';
export type TiltyardNetwork = {
  rpc: <M extends Method>(endpoint: string, session: string, method: M, params: RpcMethods[M]['params']) => Promise<unknown>;
};
export type TiltyardConnection = {
  launch: CoreLaunch; transport?: TiltyardNetwork;
  subscribeEvents: (listener: (kind: EventKind) => void) => () => void;
  subscribe: (listener: () => void) => () => void;
  getPhase: () => Snapshot['phase'];
};
export type TiltyardCoreState = Readonly<{
  connected: boolean; loading: boolean; busy: boolean;
  stage?: TiltyardStageResult; error?: string; notice?: string;
}>;

/** Only vocabulary translation. No local tally, clock or tournament transition. */
export function coreTurn(event: DuelEvent): Exclude<TiltyardAction, { kind: 'start' }> {
  if (event.kind === 'pick') return { kind: 'pick', side: event.side === 0 ? 'left' : 'right' };
  if (event.kind === 'tick') return { kind: 'tick', ms: event.ms };
  return { kind: event.kind };
}
function errorMessage(error: unknown, fallback: string) {
  try { return parseError(JSON.stringify(error)).message; }
  catch { return fallback; }
}

/** Reuses the shell event socket. Reads drain invalidations; writes are never retried. */
export function createTiltyardCore(connection: TiltyardConnection) {
  const base = validateCoreLaunch(connection.launch);
  let state: TiltyardCoreState = { connected: connection.getPhase() === 'ready', loading: true, busy: false };
  const listeners = new Set<() => void>();
  let active = false;
  let generation = 0;
  let reading = false;
  let dirty = false;
  let poll: ReturnType<typeof setTimeout> | undefined;
  function clearPoll() { clearTimeout(poll); poll = undefined; }
  function schedulePoll() {
    clearPoll();
    // Full authoritative reads also refresh live counts if no turn event arrives.
    // Schedule after completion so slow reads never build up a timer backlog.
    if (active && state.connected && !reading && !state.busy && state.stage?.session?.phase === 'live') {
      poll = setTimeout(() => { poll = undefined; void refresh(); }, 1000);
    }
  }
  function publish(change: Partial<TiltyardCoreState>, clear: ('error' | 'notice')[] = []) {
    const before = { ...state };
    for (const key of clear) delete before[key];
    state = { ...before, ...change };
    for (const listener of listeners) listener();
  }
  async function call<M extends Method>(contract: MethodContract<M>, value: RpcMethods[M]['params']): Promise<RpcMethods[M]['result']> {
    if (!connection.transport) return invokeMethod(base.href, connection.launch.session_token, contract, value);
    const params = parseMethodParams(contract, value);
    const result = await connection.transport.rpc(base.href, connection.launch.session_token, contract.method, params);
    return parseMethodResult(contract, JSON.stringify(result));
  }
  async function refresh() {
    if (!active || !state.connected) return;
    dirty = true;
    if (reading || state.busy) return;
    clearPoll();
    reading = true;
    publish({ loading: true });
    try {
      while (dirty && active && state.connected && !state.busy) {
        dirty = false;
        const run = generation;
        try {
          const stage = await call(maproomStageGet, {});
          if (active && run === generation) publish({ stage }, ['error']);
        } catch (error: unknown) {
          if (active && run === generation) publish({ error: errorMessage(error, 'Duel state unavailable. Refresh to retry.') });
        }
      }
    } finally {
      reading = false;
      if (active) publish({ loading: false });
      schedulePoll();
    }
  }
  function available() {
    if (!active) { publish({ error: 'The duel view is closed. Reopen it before acting.' }); return false; }
    if (!state.connected) { publish({ error: 'Core disconnected. This action was not sent. Reconnect and try again.' }); return false; }
    if (state.busy || reading) { publish({ error: 'Wait for the core to finish, then try this action again.' }); return false; }
    return true;
  }
  async function finish() {
    if (!active) return;
    publish({ busy: false });
    if (dirty) await refresh();
    else schedulePoll();
  }
  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    refresh,
    start() {
      if (active) throw new Error('Tiltyard adapter already started');
      active = true;
      const stop_events = connection.subscribeEvents(kind => {
        if (kind === 'maproom.turn' || kind === 'resync'
          || kind === 'gatehouse.verdict' && state.stage?.session?.phase === 'live') void refresh();
      });
      const stop_status = connection.subscribe(() => {
        const connected = connection.getPhase() === 'ready';
        if (connected === state.connected) return;
        generation++;
        clearPoll();
        publish({ connected, ...(connected ? {} : { error: state.busy
          ? 'Core disconnected during the request. Its outcome is unknown; reconnect to check before trying again.'
          : 'Core disconnected. Reconnect to load the tournament.' }) });
        if (connected) void refresh();
      });
      publish({ connected: connection.getPhase() === 'ready' });
      void refresh();
      return () => { active = false; generation++; dirty = false; clearPoll(); stop_events(); stop_status(); };
    },
    async run(action: TiltyardAction) {
      if (!available()) return;
      const run = generation;
      clearPoll();
      publish({ busy: true }, ['error', 'notice']);
      try {
        const stage = await call(maproomTurnRun, { action });
        if (active && run === generation) publish({ stage });
      } catch (error: unknown) {
        if (active && run === generation) publish({ error: errorMessage(error,
          'The duel action could not be confirmed. Refresh to check its outcome before trying again.') });
      } finally { await finish(); }
    },
    async copySource(write: (url: string) => Promise<void> = url => navigator.clipboard.writeText(url)) {
      if (!available()) return;
      const run = generation;
      clearPoll();
      publish({ busy: true }, ['error', 'notice']);
      try {
        const { url } = await call(tiltyardSourceUrl, {});
        if (!active || run !== generation) return;
        try {
          await write(url);
          if (active && run === generation) publish({ notice: 'Duel browser-source URL copied. Add it in OBS.' });
        } catch {
          if (active && run === generation) publish({ error: 'Clipboard unavailable. Allow clipboard access and try again.' });
        }
      } catch (error: unknown) {
        if (active && run === generation) publish({ error: errorMessage(error, 'Duel source unavailable. Try again.') });
      } finally { await finish(); }
    },
  };
}
export type TiltyardCore = ReturnType<typeof createTiltyardCore>;
