import type { DrawCheckResult, LotsDraw, LotsDrawPolicy, LotsHandle, LotsSealedRoll, LotsWrit } from '@castle-control/contract';
import { fixtureCooldown, fixtureDraws, fixturePool, fixtureWrit } from './lots-fixture.js';
import type { FixtureEntry } from './lots-fixture.js';
import { lotsCopy as copy } from './lots-copy.js';
import { freezeFixture, prepareFixtureRoll, rehearsalClock, rehearsalSeed, respectsCaps, simulateCast } from './rooms/lottery/simulation.js';
import { castWinners, verifyWrit } from './lots-cast.js';

export type Shape = typeof copy.shapes[number]['value'];
export type LotsPreview = {
  draw: LotsDraw; entries: readonly FixtureEntry[]; paused: boolean; sealed: boolean; started: boolean;
  shape: Shape; lookup: string; nested: boolean; notice: string; recomputing: boolean;
  simulated_winners?: readonly LotsHandle[];
  sealed_roll?: LotsSealedRoll; writ?: LotsWrit; casting?: boolean;
};
export type LotsPort<State = LotsPreview> = {
  getSnapshot: () => State; subscribe: (listener: () => void) => () => void;
  select: (id: string) => void; edit: (draw: LotsDraw) => void; lookup: (handle: string) => void;
  pause: () => void; seal: (entries?: readonly FixtureEntry[], prepared?: LotsSealedRoll) => Promise<void>; start: () => Promise<void>; shape: (shape: Shape) => void;
  nested: (show: boolean) => void; recompute: (reference?: boolean) => Promise<void>;
};

/** Fixture-only mirror of cc-lots::check_draw. Reasons use the strings documented
 * by cc-types::DrawCheckResult, not new wire identifiers. No live authority. */
export function checkFixturePolicy(policy: LotsDrawPolicy): DrawCheckResult {
  if (policy.content !== 'prize') return { result: 'ok', reasons: [] };
  const rules: readonly [boolean, keyof typeof copy.reasons, boolean][] = [
    [policy.paid_entry, 'paid_entry', true], [policy.paid_weight, 'paid_weight', true],
    [policy.prize_value_usd_cents > 500_000 && !policy.registration_confirmed, 'prize_value_over_cap', true],
    [policy.subscriber_only, 'subscriber_only', false], [policy.channel_points && !policy.free_entry_equal_odds, 'points_without_free_path', false],
    [policy.minimum_age === undefined, 'missing_age', false], [!policy.regions.length || policy.regions.some(region => !region.trim()), 'missing_region', false],
    [!policy.official_rules, 'missing_rules', true], [!policy.twitch_disclaimer, 'missing_disclaimer', true],
  ];
  const active = rules.filter(([condition]) => condition);
  return { result: active.some(([, , blocked]) => blocked) ? 'blocked' : active.length ? 'warn' : 'ok', reasons: active.map(([, reason]) => reason) };
}
export function lookupFixture(snapshot: LotsPreview): string {
  const handle = snapshot.lookup.trim().replace(/^@/, '').toLowerCase();
  if (!handle) return copy.lookup_empty;
  if (fixtureCooldown.includes(handle)) return copy.lookup_cooldown;
  const entry = snapshot.entries.find(entry => entry.handle === handle);
  return entry ? `${copy.lookup_found} ${entry.number} · ${copy.cohorts[entry.cohort]}` : copy.lookup_missing;
}
export function fixtureWeightNotice(snapshot: LotsPreview): string {
  const curve = snapshot.draw.rules.weight_curve;
  if (snapshot.draw.rules.free_join_equal_odds || curve.kind === 'equal') return copy.equal;
  const heaviest = Math.max(0, ...snapshot.entries.map(entry => entry.weight));
  return copy.journey.weight_summary(curve.max_units, heaviest);
}
function validDraw(draw: LotsDraw, count: number): boolean {
  const cap = draw.rules.cohort_caps[0];
  return Boolean(draw.name.trim()) && Number.isInteger(draw.rules.winner_count) && draw.rules.winner_count >= 1
    && draw.rules.winner_count <= Math.max(1, count) && Number.isInteger(draw.rules.cooldown_s) && draw.rules.cooldown_s >= 0
    && Number.isSafeInteger(draw.policy.prize_value_usd_cents) && draw.policy.prize_value_usd_cents >= 0
    && (draw.policy.minimum_age === undefined || Number.isInteger(draw.policy.minimum_age) && draw.policy.minimum_age >= 0 && draw.policy.minimum_age <= 120)
    && (!cap || Number.isInteger(cap.numerator) && cap.numerator >= 0 && cap.numerator <= cap.denominator)
    && (draw.rules.pool.kind !== 'keyword' || /^\S+$/.test(draw.rules.pool.keyword));
}
export function createLotsPreview(count = 87, clock = rehearsalClock): LotsPort {
  const first = fixtureDraws[0];
  if (!first) throw new Error(copy.empty);
  let snapshot: LotsPreview = { draw: first, entries: fixturePool(first, count), paused: false, sealed: false, started: false,
    shape: 'urn', lookup: '', nested: false, notice: copy.notice, recomputing: false, casting: false };
  const listeners = new Set<() => void>();
  const publish = (change: Partial<LotsPreview>) => { snapshot = { ...snapshot, ...change }; for (const listener of listeners) listener(); };
  return {
    getSnapshot: () => snapshot, subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    select(id) {
      const draw = fixtureDraws.find(draw => draw.draw_id === id);
      if (draw) {
        const next = { ...snapshot }; delete next.simulated_winners; delete next.writ; delete next.sealed_roll; snapshot = next;
        publish({ draw, entries: fixturePool(draw, count), paused: false, sealed: false, started: false, nested: false,
          casting: false, recomputing: false, notice: copy.selected });
      }
    },
    edit(draw) {
      if (snapshot.sealed) return;
      if (!validDraw(draw, count)) { publish({ notice: copy.invalid_setup }); return; }
      const accepted = freezeFixture(structuredClone(draw));
      publish({ draw: accepted, entries: fixturePool(accepted, count), notice: copy.changed });
    },
    lookup(lookup) { publish({ lookup }); },
    pause() { if (!snapshot.sealed) publish({ paused: !snapshot.paused }); },
    async seal(entries = snapshot.entries, prepared) {
      if (snapshot.sealed) return;
      if (!entries.length) { publish({ notice: copy.empty }); return; }
      if (checkFixturePolicy(snapshot.draw.policy).result === 'blocked') { publish({ notice: copy.frozen }); return; }
      try { simulateCast(snapshot.draw, entries); }
      catch { publish({ notice: copy.insufficient }); return; }
      const before = snapshot;
      try {
        const sealed_roll = prepared ?? await prepareFixtureRoll(before.draw, entries, clock());
        if (snapshot !== before) return;
        publish({ draw: freezeFixture(structuredClone(snapshot.draw)), entries: freezeFixture(entries.map(entry => ({ ...entry }))),
          sealed_roll, sealed: true, paused: true, notice: copy.sealed_notice });
      } catch { if (snapshot === before) publish({ notice: copy.hash_failed }); }
    },
    async start() {
      if (snapshot.started) { publish({ notice: copy.cast_fixed }); return; }
      if (snapshot.casting) return;
      if (!snapshot.entries.length) { publish({ notice: copy.empty }); return; }
      const sealed = snapshot.sealed_roll;
      if (!sealed || checkFixturePolicy(snapshot.draw.policy).result === 'blocked') { publish({ notice: copy.frozen }); return; }
      const { draw, entries } = snapshot;
      publish({ casting: true });
      try {
        const winners = await castWinners(rehearsalSeed, sealed.seal, sealed.roll);
        if (snapshot.sealed_roll !== sealed) return;
        if (!respectsCaps(draw, entries, winners)) { publish({ casting: false, notice: copy.cast_cap }); return; }
        const writ = freezeFixture({ ...sealed, proof: { source: 'streamer_commit' as const, seed: rehearsalSeed }, winners: [...winners] });
        publish({ started: true, casting: false, writ, simulated_winners: writ.winners, notice: copy.cast_notice });
      } catch { if (snapshot.sealed_roll === sealed) publish({ casting: false, notice: copy.recompute_failed }); }
    },
    shape(shape) { publish({ shape }); }, nested(nested) { publish({ nested }); },
    async recompute(reference = false) {
      if (snapshot.recomputing) return;
      const current = snapshot.writ;
      const writ = reference ? undefined : current;
      publish({ recomputing: true, notice: copy.computing });
      try {
        await verifyWrit(writ ?? fixtureWrit);
        if (snapshot.writ === current) publish({ recomputing: false, notice: writ ? copy.cast_match : copy.recomputed });
      } catch { if (snapshot.writ === current) publish({ recomputing: false, notice: copy.recompute_failed }); }
    },
  };
}

/** The saved corpus vector continues to pin cc-verify v1 byte parity. */
export async function recomputeFixture(): Promise<readonly LotsHandle[]> {
  return verifyWrit(fixtureWrit);
}
