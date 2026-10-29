import { invokeMethod, parseError, parseMethodParams, parseMethodResult } from '@castle-control/contract';
import { lotsDrawList, lotsDrawUpsert, lotsDrawCheck, lotsRollLookup, lotsRollSeal, lotsCast, lotsWritGet } from '@castle-control/contract/lots';
import type { CastResult, DrawCheckResult, LotsDraw, LotsProofEntry, LotsWrit,
  MethodContract, RollLookupResult, RollSealResult, RpcMethods } from '@castle-control/contract';
import { validateCoreLaunch } from './core-source.js';
import type { CoreLaunch } from './core-source.js';
import type { LotsPort, LotsPreview } from './lots-model.js';

type LotsMethod = 'lots.draw.list' | 'lots.draw.upsert' | 'lots.draw.check' | 'lots.roll.lookup'
  | 'lots.roll.seal' | 'lots.cast' | 'lots.writ.get';
/** Test seam: only the seven existing Lots methods, with no socket dependency. */
export type LotsNetwork = {
  rpc: <M extends LotsMethod>(endpoint: string, session: string, method: M, params: RpcMethods[M]['params']) => Promise<unknown>;
};
export type CoreLotsSnapshot = Omit<LotsPreview, 'draw' | 'entries'> & {
  draw?: LotsDraw; draws: readonly LotsDraw[]; entries: readonly LotsProofEntry[];
  check?: DrawCheckResult; lookup_result?: RollLookupResult; seal_result?: RollSealResult;
  cast_result?: CastResult; writ?: LotsWrit; busy: boolean; locked: boolean;
};

/** Labels use the existing core status and accepted seal; no launch flag is
 * treated as proof that a live source exists. Verification remains in core. */
export function lotsRoundLabel(simulated: boolean | undefined, sealed: RollSealResult | undefined): string {
  if (simulated === true || sealed?.sealed.roll.sealed_at === '2023-08-23T15:09:28Z') return 'Recorded · simulated round source';
  if (simulated === undefined) return 'Round source unknown · wait for core status';
  if (!sealed) return 'Live mode · trusted quicknet needs the local opt-in; no round selected';
  const plan = sealed.sealed.roll.randomness;
  if (plan.source === 'streamer_commit') return 'Streamer-controlled · commit/reveal';
  if (plan.chain_hash !== '52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971') return 'Round source unknown · unexpected chain';
  return `Live-trusted quicknet · target round ${plan.round}`;
}

const questionDraw = {
  draw_id: 'questions', name: 'Questions for the hall · no prize',
  policy: { content: 'question', paid_entry: false, paid_weight: false, subscriber_only: false,
    channel_points: false, free_entry_equal_odds: true, regions: [], prize_value_usd_cents: 0,
    registration_confirmed: false, official_rules: false, twitch_disclaimer: false },
  rules: { pool: { kind: 'keyword', keyword: '!join' }, winner_count: 1, cooldown_s: 0,
    cohort_caps: [], weight_curve: { kind: 'equal' }, free_join_equal_odds: true },
} as const;

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
    // Upstream prose can contain secrets. Display only validated codes and retry timing.
    return `Draw request failed: ${envelope.code}.${envelope.retry_after_ms === undefined ? '' : ` Retry after ${envelope.retry_after_ms} ms.`}`;
  } catch {
    return 'Draw request failed. The result is unavailable or invalid; no preview was substituted.';
  }
}

export function createCoreLotsPort(launch: CoreLaunch, transport?: LotsNetwork) {
  const base = validateCoreLaunch(launch);
  let snapshot: CoreLotsSnapshot = freeze({ draws: [], entries: [], paused: false, sealed: false, started: false,
    shape: 'urn', lookup: '', nested: false, notice: 'Load draws from the local core.', recomputing: false, busy: false, locked: false });
  const listeners = new Set<() => void>();
  function publish(change: Partial<CoreLotsSnapshot>, omit: ('draw' | 'check' | 'lookup_result')[] = []) {
    const previous = { ...snapshot };
    for (const key of omit) delete previous[key];
    snapshot = freeze({ ...previous, ...change });
    for (const listener of listeners) listener();
  }
  async function call<M extends LotsMethod>(contract: MethodContract<M>, value: unknown): Promise<RpcMethods[M]['result']> {
    const params = parseMethodParams(contract, value);
    if (!transport) return invokeMethod(base.href, launch.session_token, contract, params);
    const result = await transport.rpc(base.href, launch.session_token, contract.method, params);
    return parseMethodResult(contract, JSON.stringify(result));
  }
  async function perform(work: () => Promise<void>) {
    if (snapshot.busy) { publish({ notice: 'A draw request is in progress. Wait for its result.' }); return; }
    publish({ busy: true });
    try { await work(); }
    catch (error: unknown) { publish({ notice: errorNotice(error) }); }
    finally { publish({ busy: false }); }
  }
  function editable() {
    if (!snapshot.locked) return true;
    publish({ notice: 'The roll is locked. Its setup and entries cannot change; an uncertain seal must be reconciled in the core.' });
    return false;
  }
  function currentDraw() {
    if (!snapshot.draw) throw new Error('No draw selected');
    return snapshot.draw;
  }
  async function check(draw: LotsDraw) {
    const result = await call(lotsDrawCheck, { policy: draw.policy });
    publish({ check: result, notice: `Giveaway guardrails: ${result.result}${result.reasons.length ? ` · ${result.reasons.join(', ')}` : ''}.` });
    return result;
  }
  async function readWrit() {
    const cast = snapshot.cast_result;
    if (!cast) throw new Error('No cast available');
    const writ = await call(lotsWritGet, { writ_id: cast.writ_id });
    if (writ.seal !== cast.cast.seal || JSON.stringify(writ.winners) !== JSON.stringify(cast.cast.winners)) throw new Error('Writ does not match this cast');
    publish({ writ, notice: 'Proof bundle loaded from the core. Use an independent verifier to check it.' });
  }
  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    async load() {
      if (!editable()) return;
      await perform(async () => {
        const { draws } = await call(lotsDrawList, {});
        const draw = draws.find(item => item.draw_id === snapshot.draw?.draw_id) ?? draws[0];
        // Replace rather than merge: an empty service list cannot retain a stale selection.
        publish({ draws, ...(draw ? { draw } : {}), notice: draw ? 'Core draw selected.' : 'No draws configured in the core.' }, ['draw', 'check', 'lookup_result']);
        if (draw) await check(draw);
      });
    },
    async select(id: string) {
      if (!editable()) return;
      await perform(async () => {
        const draw = snapshot.draws.find(item => item.draw_id === id);
        if (!draw) throw new Error('Unknown draw');
        publish({ draw, lookup: '', notice: 'Core draw selected.' }, ['check', 'lookup_result']);
        await check(draw);
      });
    },
    async edit(draw: LotsDraw) {
      if (!editable()) return;
      const proposed = structuredClone(draw);
      await perform(async () => {
        const saved = await call(lotsDrawUpsert, { draw: proposed });
        const draws = [...snapshot.draws.filter(item => item.draw_id !== saved.draw_id), saved];
        publish({ draw: saved, draws }, ['check', 'lookup_result']);
        await check(saved);
      });
    },
    async createQuestionDraw() {
      // The same schema door as every other configuration. No fixture is used.
      const { draw } = parseMethodParams(lotsDrawUpsert, { draw: questionDraw });
      await this.edit(draw);
    },
    async check() { await perform(async () => { await check(currentDraw()); }); },
    async lookup(user_id: string) {
      await perform(async () => {
        const draw = currentDraw();
        publish({ lookup: user_id }, ['lookup_result']);
        const result = await call(lotsRollLookup, { draw_id: draw.draw_id, user_id });
        if (result.draw_id !== draw.draw_id) throw new Error('Lookup returned a different draw');
        publish({ lookup: user_id, lookup_result: result, notice: result.entry ? 'Eligible entry found in the core.' : 'No currently eligible entry for this Twitch user ID.' });
      });
    },
    pause() { publish({ notice: 'Pausing live intake is unavailable in the current contract.' }); },
    async seal() {
      if (!editable()) return;
      await perform(async () => {
        const draw = currentDraw();
        if ((await check(draw)).result === 'blocked') return;
        // Lock before sending: a lost response must never reopen a potentially sealed roll.
        publish({ locked: true, notice: 'Sealing the roll in the core.' });
        const result = await call(lotsRollSeal, { draw_id: draw.draw_id, source: 'drand_quicknet', margin_s: 6 });
        if (result.draw_id !== draw.draw_id) throw new Error('Seal returned a different draw');
        publish({ sealed: true, paused: true, seal_result: result, entries: result.sealed.roll.entries,
          notice: 'Seal announced through the core event. Native live runs also publish the OBS plate; recorded cores remain simulated.' });
      });
    },
    async start() {
      await perform(async () => {
        const sealed = snapshot.seal_result;
        if (!sealed || snapshot.started) throw new Error('Seal first; a cast cannot be replaced');
        const result = await call(lotsCast, { draw_run_id: sealed.draw_run_id });
        if (result.draw_run_id !== sealed.draw_run_id || result.cast.seal !== sealed.sealed.seal) throw new Error('Cast returned a different roll');
        publish({ started: true, cast_result: result, notice: `Core cast received · ${result.cast.label}.` });
        await readWrit();
      });
    },
    shape(shape: LotsPreview['shape']) { publish({ shape }); },
    nested(nested: boolean) { publish({ nested }); },
    async recompute() {
      await perform(async () => {
        publish({ recomputing: true });
        try { await readWrit(); }
        finally { publish({ recomputing: false }); }
      });
    },
  } satisfies LotsPort<CoreLotsSnapshot> & { load: () => Promise<void>; check: () => Promise<void>; createQuestionDraw: () => Promise<void> };
}
export type CoreLotsPort = ReturnType<typeof createCoreLotsPort>;
