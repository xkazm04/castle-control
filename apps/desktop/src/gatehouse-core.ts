import { invokeMethod, parseError, parseMethodParams, parseMethodResult } from '@castle-control/contract';
import { parseJson } from '@castle-control/contract/door';
import { gatehouseRulesList, gatehouseRulesUpsert, gatehouseBanConfirm, gatehouseBanDismiss,
  gatehouseDecisionUndo, gatehousePetitionResolve, gatehouseRecordingImport, gatehouseDrillRun,
  gatehouseDrillDiff, gatehouseConsensusGet } from '@castle-control/contract/gatehouse';
import type { ConsensusGetParams, ConsensusGetResult, Decision, DecisionParams, DrillDiffParams, DrillDiffResult,
  DrillConfiguration, DrillRunParams, DrillRunResult, MethodContract, PetitionResolveParams, RecordingImportResult, Rule,
  RpcMethods, RulesUpsertParams } from '@castle-control/contract';
import { validateCoreLaunch } from './core-source.js';
import type { CoreLaunch } from './core-source.js';

type GatehouseMethod = 'gatehouse.rules.list' | 'gatehouse.rules.upsert' | 'gatehouse.ban.confirm'
  | 'gatehouse.ban.dismiss' | 'gatehouse.decision.undo' | 'gatehouse.petition.resolve'
  | 'gatehouse.recording.import' | 'gatehouse.drill.run' | 'gatehouse.drill.diff' | 'gatehouse.consensus.get';
/** Test seam restricted to the ten existing core methods; capabilities never enter read snapshots. */
export type GatehouseNetwork = {
  rpc: <M extends GatehouseMethod>(endpoint: string, session: string, method: M, params: RpcMethods[M]['params']) => Promise<unknown>;
};
export type CoreGatehouseSnapshot = {
  rules: readonly Rule[]; consensus?: ConsensusGetResult; last_decision?: Decision;
  recording?: RecordingImportResult; drill?: DrillRunResult; diff?: DrillDiffResult;
  baseline?: DrillConfiguration; baseline_recording?: string;
  busy: boolean; phase: 'idle' | 'loading' | 'ready' | 'error'; notice: string;
};

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
  type OptionalResult = 'consensus' | 'last_decision' | 'recording' | 'drill' | 'diff';
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
    publish({}, ['recording', 'drill', 'diff']);
    const recording = await call(gatehouseRecordingImport, value);
    publish({ recording, notice: 'Recording imported by the core. Replays remain simulated and separate from live decisions.' });
  }
  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    async load() {
      await perform(async () => {
        publish({ rules: [] }, ['consensus']);
        const { rules } = await call(gatehouseRulesList, {});
        publish({ rules });
        const consensus = await call(gatehouseConsensusGet, { filter: { kind: 'all' }, window_s: 900 });
        publish({ consensus, notice: 'Rules and consensus loaded from the core.' });
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
        publish({}, ['drill', 'diff']);
        const drill = await call(gatehouseDrillRun, params);
        publish({ drill, notice: 'Simulated replay received from the core; the live ledger is unchanged.' });
      });
    },
    async diffDrill(params: DrillDiffParams) {
      await perform(async () => {
        publish({}, ['diff']);
        const diff = await call(gatehouseDrillDiff, params);
        publish({ diff, notice: 'Simulated comparison received. Baseline and candidate instruments are reported separately.' });
      });
    },
  };
}
export type CoreGatehousePort = ReturnType<typeof createCoreGatehousePort>;
