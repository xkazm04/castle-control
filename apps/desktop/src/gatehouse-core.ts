import { invokeMethod, parseError, parseMethodParams, parseMethodResult } from '@castle-control/contract';
import { parseJson } from '@castle-control/contract/door';
import { gatehouseRulesList, gatehouseRulesUpsert, gatehouseBanConfirm, gatehouseBanDismiss,
  gatehouseDecisionUndo, gatehousePetitionResolve, gatehouseRecordingImport, gatehouseDrillRun,
  gatehouseDrillDiff, gatehouseConsensusGet, gatehouseChatList, gatehouseHistoryList, gatehouseLiveRunGet } from '@castle-control/contract/gatehouse';
import type { ConsensusGetParams, ConsensusGetResult, Decision, DecisionParams, DrillDiffParams, DrillDiffResult,
  DrillConfiguration, DrillRunParams, DrillRunResult, MethodContract, PetitionResolveParams, RecordingImportResult, Rule,
  GatehouseChatResult, GatehouseHistoryResult, GatehouseLiveCapture, GatehouseLiveRunItem, GatehouseLiveRunResult,
  RpcMethods, RulesUpsertParams } from '@castle-control/contract';
import { moderationCopy as copy } from './moderation-copy.js';
import { validateCoreLaunch } from './core-source.js';
import type { CoreLaunch } from './core-source.js';

type GatehouseMethod = 'gatehouse.rules.list' | 'gatehouse.rules.upsert' | 'gatehouse.ban.confirm'
  | 'gatehouse.ban.dismiss' | 'gatehouse.decision.undo' | 'gatehouse.petition.resolve'
  | 'gatehouse.recording.import' | 'gatehouse.drill.run' | 'gatehouse.drill.diff' | 'gatehouse.consensus.get'
  | 'gatehouse.chat.list' | 'gatehouse.history.list' | 'gatehouse.liveRun.get';
/** Test seam restricted to existing core methods; capabilities never enter read snapshots. */
export type GatehouseNetwork = {
  rpc: <M extends GatehouseMethod>(endpoint: string, session: string, method: M, params: RpcMethods[M]['params']) => Promise<unknown>;
};
export type CoreGatehouseSnapshot = {
  rules: readonly Rule[]; consensus?: ConsensusGetResult; last_decision?: Decision;
  // Accumulated read pages, each parsed separately at the contract door.
  chat?: GatehouseChatResult; history?: GatehouseHistoryResult;
  recording?: RecordingImportResult; drill?: DrillRunResult; diff?: DrillDiffResult;
  baseline?: DrillConfiguration; baseline_recording?: string;
  live_runs?: GatehouseLiveRunResult;
  selected_capture?: Extract<GatehouseLiveRunItem, { coverage: 'retained' }>;
  replay_capture?: GatehouseLiveCapture;
  busy: boolean; phase: 'idle' | 'loading' | 'ready' | 'error'; notice: string;
};

export function captureCanReplay(item: GatehouseLiveRunItem): item is Extract<GatehouseLiveRunItem, { coverage: 'retained' }> {
  return item.coverage === 'retained' && item.capture.replay_gap === undefined && item.capture.gaps.length === 0;
}

function freeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
function errorNotice(error: unknown): string {
  try {
    const envelope = parseError(JSON.stringify(error));
    // Never render upstream prose, which may contain credentials or private details.
    return `Gatehouse request failed: ${envelope.code}.${envelope.retry_after_ms === undefined ? '' : ` Retry after ${envelope.retry_after_ms} ms.`}`;
  } catch {
    return 'Gatehouse request failed. The result is unavailable or invalid. Refresh before trying again; no preview was substituted.';
  }
}

export function createCoreGatehousePort(launch: CoreLaunch, transport?: GatehouseNetwork) {
  const base = validateCoreLaunch(launch);
  let snapshot: CoreGatehouseSnapshot = freeze({ rules: [], busy: false, phase: 'idle', notice: 'Load Gatehouse data from the local core.' });
  const listeners = new Set<() => void>();
  type OptionalResult = 'consensus' | 'last_decision' | 'recording' | 'drill' | 'diff' | 'chat' | 'history'
    | 'live_runs' | 'selected_capture' | 'replay_capture';
  function publish(change: Partial<CoreGatehouseSnapshot>, omit: OptionalResult[] = []) {
    const previous = { ...snapshot };
    for (const key of omit) delete previous[key];
    snapshot = freeze({ ...previous, ...change });
    for (const listener of listeners) listener();
  }
  async function call<M extends GatehouseMethod>(contract: MethodContract<M>, value: unknown): Promise<RpcMethods[M]['result']> {
    const params = parseMethodParams(contract, value);
    if (!transport) return invokeMethod(base.href, launch.session_token, contract, params);
    const result = await transport.rpc(base.href, launch.session_token, contract.method, params);
    return parseMethodResult(contract, JSON.stringify(result));
  }
  async function perform(work: () => Promise<void>) {
    if (snapshot.busy) { publish({ notice: 'A Gatehouse request is in progress. Wait for its result.' }); return; }
    publish({ busy: true, phase: 'loading' });
    try { await work(); publish({ phase: 'ready' }); }
    catch (error: unknown) { publish({ phase: 'error', notice: errorNotice(error) }); }
    finally { publish({ busy: false }); }
  }
  async function decide(contract: MethodContract<'gatehouse.ban.confirm' | 'gatehouse.ban.dismiss'
    | 'gatehouse.decision.undo' | 'gatehouse.petition.resolve'>, params: DecisionParams | PetitionResolveParams) {
    await perform(async () => {
      publish({}, ['last_decision']);
      const last_decision = await call(contract, params);
      publish({ last_decision, notice: 'Decision received from the core. No automatic retry was sent.' });
    });
  }
  async function importRecording(value: unknown) {
    publish({}, ['recording', 'drill', 'diff', 'selected_capture', 'replay_capture']);
    const recording = await call(gatehouseRecordingImport, value);
    publish({ recording, notice: 'Recording imported by the core. Replays remain simulated and separate from live decisions.' });
  }
  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    async loadLiveRuns() {
      await perform(async () => {
        publish({}, ['live_runs', 'selected_capture', 'replay_capture', 'drill', 'diff']);
        const live_runs = await call(gatehouseLiveRunGet, { limit: 100 });
        publish({ live_runs, notice: copy.captures_loaded });
      });
    },
    async moreLiveRuns() {
      const cursor = snapshot.live_runs?.next_cursor;
      if (!cursor) return;
      await perform(async () => {
        const live_runs = await call(gatehouseLiveRunGet, { limit: 100, cursor });
        // Keep just one bounded page. The selected snapshot remains separate.
        publish({ live_runs, notice: copy.captures_loaded });
      });
    },
    selectCapture(decision_id?: string) {
      if (snapshot.busy) return;
      const item = snapshot.live_runs?.items.find(item => item.decision_id === decision_id);
      publish({}, ['selected_capture', 'replay_capture', 'drill', 'diff']);
      if (item && captureCanReplay(item)) publish({ selected_capture: item, notice: copy.capture_selected });
      else publish({ notice: decision_id ? copy.capture_blocked : copy.manual_selected });
    },
    async runCapture() {
      const item = snapshot.selected_capture;
      if (!item || !captureCanReplay(item)) { publish({ notice: copy.capture_blocked }); return; }
      await perform(async () => {
        publish({}, ['drill', 'diff', 'replay_capture']);
        const drill = await call(gatehouseDrillRun, { recording: item.capture.recording, configuration: item.capture.configuration });
        publish({ drill, replay_capture: item.capture, notice: copy.capture_replayed });
      });
    },
    async compareCapture(candidate: DrillConfiguration) {
      const item = snapshot.selected_capture;
      if (!item || !captureCanReplay(item)) { publish({ notice: copy.capture_blocked }); return; }
      await perform(async () => {
        publish({}, ['drill', 'diff', 'replay_capture']);
        const diff = await call(gatehouseDrillDiff, { recording: item.capture.recording,
          baseline: item.capture.configuration, candidate });
        publish({ diff, replay_capture: item.capture, notice: copy.capture_compared });
      });
    },
    async load() {
      await perform(async () => {
        publish({ rules: [] }, ['consensus', 'chat', 'history']);
        const { rules } = await call(gatehouseRulesList, {});
        publish({ rules });
        const consensus = await call(gatehouseConsensusGet, { filter: { kind: 'all' }, window_s: 900 });
        publish({ consensus });
        const chat = await call(gatehouseChatList, { limit: 100 });
        publish({ chat });
        const history = await call(gatehouseHistoryList, { limit: 100 });
        publish({ history, notice: 'Rules, chat, history and consensus loaded from the core. Refresh for current data.' });
      });
    },
    async moreChat() {
      const previous = snapshot.chat;
      if (!previous?.next_cursor) return;
      await perform(async () => {
        const page = await call(gatehouseChatList, { limit: 100, cursor: previous.next_cursor });
        publish({ chat: { ...page, items: [...previous.items, ...page.items],
          unavailable_count: previous.unavailable_count + page.unavailable_count }, notice: 'Next chat page loaded.' });
      });
    },
    async moreHistory() {
      const previous = snapshot.history;
      if (!previous?.next_cursor) return;
      await perform(async () => {
        const page = await call(gatehouseHistoryList, { limit: 100, cursor: previous.next_cursor });
        publish({ history: { ...page, items: [...previous.items, ...page.items],
          unavailable_count: previous.unavailable_count + page.unavailable_count }, notice: 'Next history page loaded.' });
      });
    },
    async upsertRule(params: RulesUpsertParams) {
      await perform(async () => {
        const rule = await call(gatehouseRulesUpsert, params);
        if (rule.rule_id !== params.rule.rule_id) throw new Error('Mismatched rule');
        const rules = snapshot.rules.some(item => item.rule_id === rule.rule_id)
          ? snapshot.rules.map(item => item.rule_id === rule.rule_id ? rule : item) : [...snapshot.rules, rule];
        publish({ rules, notice: 'Rule saved by the core.' });
      });
    },
    confirmBan: (params: DecisionParams) => decide(gatehouseBanConfirm, params),
    dismissBan: (params: DecisionParams) => decide(gatehouseBanDismiss, params),
    undoDecision: (params: DecisionParams) => decide(gatehouseDecisionUndo, params),
    resolvePetition: (params: PetitionResolveParams) => decide(gatehousePetitionResolve, params),
    async consensus(params: ConsensusGetParams) {
      await perform(async () => {
        publish({}, ['consensus']);
        const consensus = await call(gatehouseConsensusGet, params);
        if (consensus.window_s !== params.window_s || consensus.filter.kind !== params.filter.kind
            || (consensus.filter.kind === 'emote' && params.filter.kind === 'emote' && consensus.filter.emote !== params.filter.emote)) {
          throw new Error('Mismatched consensus filter');
        }
        publish({ consensus, notice: 'Consensus loaded from the core. This chart never acts on anyone.' });
      });
    },
    async importRecording(value: unknown) { await perform(() => importRecording(value)); },
    async importRecordingJson(text: string) {
      await perform(async () => { await importRecording(parseJson(text, { max_bytes: 2 * 1024 * 1024 })); });
    },
    async saveBaseline(params: DrillRunParams) {
      await perform(async () => {
        const { configuration, recording } = parseMethodParams(gatehouseDrillRun, structuredClone(params));
        publish({ baseline: configuration, baseline_recording: recording,
          notice: 'Comparison baseline saved for this core connection. No replay has run.' });
      });
    },
    async runDrill(params: DrillRunParams) {
      await perform(async () => {
        publish({}, ['drill', 'diff', 'replay_capture']);
        const drill = await call(gatehouseDrillRun, params);
        publish({ drill, notice: 'Simulated replay received from the core; the live ledger is unchanged.' });
      });
    },
    async diffDrill(params: DrillDiffParams) {
      await perform(async () => {
        publish({}, ['diff', 'replay_capture']);
        const diff = await call(gatehouseDrillDiff, params);
        publish({ diff, notice: 'Simulated comparison received. Baseline and candidate instruments are reported separately.' });
      });
    },
  };
}
export type CoreGatehousePort = ReturnType<typeof createCoreGatehousePort>;
