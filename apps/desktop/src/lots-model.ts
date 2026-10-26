import type { DrawCheckResult, LotsDraw, LotsDrawPolicy, LotsHandle } from '@castle-control/contract';
import { fixtureCooldown, fixtureDraws, fixtureEntries, fixtureWrit } from './lots-fixture.js';
import type { FixtureEntry } from './lots-fixture.js';
import { lotsCopy as copy } from './lots-copy.js';

export type Shape = typeof copy.shapes[number]['value'];
export type LotsPreview = {
  draw: LotsDraw; entries: readonly FixtureEntry[]; paused: boolean; sealed: boolean; started: boolean;
  shape: Shape; lookup: string; nested: boolean; notice: string; recomputing: boolean;
};
export type LotsPort = {
  getSnapshot: () => LotsPreview; subscribe: (listener: () => void) => () => void;
  select: (id: string) => void; edit: (draw: LotsDraw) => void; lookup: (handle: string) => void;
  pause: () => void; seal: () => void; start: () => void; shape: (shape: Shape) => void;
  nested: (show: boolean) => void; recompute: () => Promise<void>;
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
function validDraw(draw: LotsDraw, count: number): boolean {
  const cap = draw.rules.cohort_caps[0];
  return Boolean(draw.name.trim()) && Number.isInteger(draw.rules.winner_count) && draw.rules.winner_count >= 1
    && draw.rules.winner_count <= Math.max(1, count) && Number.isInteger(draw.rules.cooldown_s) && draw.rules.cooldown_s >= 0
    && Number.isSafeInteger(draw.policy.prize_value_usd_cents) && draw.policy.prize_value_usd_cents >= 0
    && (draw.policy.minimum_age === undefined || Number.isInteger(draw.policy.minimum_age) && draw.policy.minimum_age >= 0 && draw.policy.minimum_age <= 120)
    && (!cap || Number.isInteger(cap.numerator) && cap.numerator >= 0 && cap.numerator <= cap.denominator)
    && (draw.rules.pool.kind !== 'keyword' || /^\S+$/.test(draw.rules.pool.keyword));
}
export function createLotsPreview(count = 87): LotsPort {
  const first = fixtureDraws[0];
  if (!first) throw new Error(copy.empty);
  let snapshot: LotsPreview = { draw: first, entries: fixtureEntries(count), paused: false, sealed: false, started: false,
    shape: 'urn', lookup: '', nested: false, notice: copy.notice, recomputing: false };
  const listeners = new Set<() => void>();
  const publish = (change: Partial<LotsPreview>) => { snapshot = { ...snapshot, ...change }; for (const listener of listeners) listener(); };
  return {
    getSnapshot: () => snapshot, subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    select(id) { const draw = fixtureDraws.find(draw => draw.draw_id === id); if (draw) publish({ draw, paused: false, sealed: false, started: false, notice: copy.selected }); },
    edit(draw) { if (!snapshot.sealed && validDraw(draw, snapshot.entries.length)) publish({ draw, notice: copy.changed }); },
    lookup(lookup) { publish({ lookup }); },
    pause() { if (!snapshot.sealed) publish({ paused: !snapshot.paused }); },
    seal() { if (!snapshot.sealed && snapshot.entries.length && checkFixturePolicy(snapshot.draw.policy).result !== 'blocked') publish({ sealed: true, paused: true, notice: copy.sealed_notice }); },
    start() {
      if (!snapshot.sealed || snapshot.started || checkFixturePolicy(snapshot.draw.policy).result === 'blocked') { publish({ notice: copy.frozen }); return; }
      publish({ started: true, notice: copy.started });
    },
    shape(shape) { publish({ shape }); }, nested(nested) { publish({ nested }); },
    async recompute() {
      if (snapshot.recomputing) return;
      publish({ recomputing: true, notice: copy.computing });
      try { await recomputeFixture(); publish({ recomputing: false, notice: copy.recomputed }); }
      catch { publish({ recomputing: false, notice: copy.recompute_failed }); }
    },
  };
}

/** Only the built-in, typed fallback vector is accepted. No parser or network.
 * The byte encoding follows cc-verify v1; this never emits a verified wire cast. */
export async function recomputeFixture(): Promise<readonly LotsHandle[]> {
  const writ = fixtureWrit;
  const roll = writ.roll;
  if (writ.proof.source !== 'streamer_commit' || roll.randomness.source !== 'streamer_commit') throw new Error(copy.recompute_failed);
  const text = (value: string) => new TextEncoder().encode(value);
  const number = (value: bigint, size: number) => {
    const bytes = new Uint8Array(size);
    for (let index = size - 1; index >= 0; index--) { bytes[index] = Number(value & 255n); value >>= 8n; }
    return bytes;
  };
  const u32 = (value: number) => number(BigInt(value), 4);
  const hex = (value: string) => Uint8Array.from(value.match(/../g) ?? [], byte => Number.parseInt(byte, 16));
  const join = (...values: Uint8Array[]) => {
    const result = new Uint8Array(values.reduce((size, value) => size + value.length, 0));
    let offset = 0;
    for (const value of values) { result.set(value, offset); offset += value.length; }
    return result;
  };
  const hash = async (...values: Uint8Array[]) => new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', join(...values)));
  const encode = (value: Uint8Array) => Array.from(value, byte => byte.toString(16).padStart(2, '0')).join('');
  const entries = join(...roll.entries.map(entry => join(u32(entry.handle.length), text(entry.handle), u32(entry.weight))));
  const seal = await hash(text('castle-control/seal/v1\0'), u32(roll.entries.length), entries, u32(roll.winner_count),
    text(roll.sealed_at), u32(roll.margin_s), new Uint8Array([1]), hex(roll.randomness.commitment));
  const revealed = hex(writ.proof.seed);
  if (encode(seal) !== writ.seal || encode(await hash(text('castle-control/commit/v1\0'), revealed)) !== roll.randomness.commitment) throw new Error(copy.recompute_failed);
  const seed = await hash(text('castle-control/cast/v1\0'), revealed, seal, entries);
  const pool = [...roll.entries];
  const winners: LotsHandle[] = [];
  let counter = 0n;
  while (winners.length < roll.winner_count) {
    const block = await hash(seed, number(counter++, 8));
    const candidate = new DataView(block.buffer).getBigUint64(0);
    const total = pool.reduce((sum, entry) => sum + BigInt(entry.weight), 0n);
    if (candidate >= ((1n << 64n) / total) * total) continue;
    let target = candidate % total;
    const index = pool.findIndex(entry => { if (target < BigInt(entry.weight)) return true; target -= BigInt(entry.weight); return false; });
    const winner = pool.splice(index, 1)[0];
    if (!winner) throw new Error(copy.recompute_failed);
    winners.push(winner.handle);
  }
  if (winners.length !== writ.winners.length || winners.some((winner, index) => winner !== writ.winners[index])) throw new Error(copy.recompute_failed);
  return winners;
}
