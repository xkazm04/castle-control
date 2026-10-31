import type { DrawId, LotsDraw, LotsHandle, LotsWrit } from '@castle-control/contract';
import { lotsCopy as copy } from './lots-copy.js';

export type FixtureEntry = { handle: LotsHandle; number: number; cohort: keyof typeof copy.cohorts; weight: number };
export const fixtureCooldown: readonly LotsHandle[] = ['simulated_cooldown', 'simulated_cooldown_2', 'simulated_cooldown_3', 'simulated_cooldown_4', 'simulated_cooldown_5'];
export function fixtureEntries(count = 87): readonly FixtureEntry[] {
  return Array.from({ length: Math.min(10_000, Math.max(0, Math.floor(count))) }, (_, index) => ({
    handle: `simulated_${String(index + 1).padStart(5, '0')}`, number: index + 1,
    cohort: index % 7 === 0 ? 'raider' : index % 3 === 0 ? 'subscriber' : 'new_account', weight: 1,
  }));
}

/** Generated facts for rehearsal: all pass moderation; none comes from Twitch.
 * Every third message is a free !join; others say !question. Activity is not money.
 * Weight formula mirrors cc-lots::WeightCurve, including the free-path override. */
export function fixturePool(draw: LotsDraw, count = 87): readonly FixtureEntry[] {
  const { pool, weight_curve, free_join_equal_odds } = draw.rules;
  return fixtureEntries(count).filter(entry => {
    const free_join = entry.number % 3 === 0;
    const eligible = pool.kind === 'chatters' || pool.kind === 'followers' && entry.number % 2 === 0
      || pool.kind === 'subscribers' && entry.cohort === 'subscriber'
      || pool.kind === 'redeemers' && entry.number % 5 === 0
      || pool.kind === 'keyword' && pool.keyword.toLowerCase() === (free_join ? '!join' : '!question');
    return eligible || free_join_equal_odds && free_join;
  }).map(entry => {
    if (free_join_equal_odds || weight_curve.kind === 'equal') return entry;
    const c = weight_curve.max_units; const n = Math.min(entry.number % 5, c);
    return { ...entry, weight: c + n * (2 * c - n + 1) / 2 };
  });
}
// Slugs are minted here for trusted, in-process fixtures only. No unparsed wire data.
const question: LotsDraw = {
  draw_id: 'hall-questions' as DrawId, name: copy.question_name,
  policy: { content: 'question', paid_entry: false, paid_weight: false, subscriber_only: false,
    channel_points: false, free_entry_equal_odds: true, minimum_age: 18, regions: ['CZ'],
    prize_value_usd_cents: 0, registration_confirmed: false, official_rules: false, twitch_disclaimer: false },
  rules: { pool: { kind: 'chatters' }, winner_count: 3, cooldown_s: 600,
    cohort_caps: [{ cohort: 'raider', numerator: 1, denominator: 3 }], weight_curve: { kind: 'equal' }, free_join_equal_odds: true },
};
export const fixtureDraws: readonly LotsDraw[] = [question,
  { ...question, draw_id: 'free-prize' as DrawId, name: copy.prize_name, policy: { ...question.policy, content: 'prize', prize_value_usd_cents: 2500 } },
  { ...question, draw_id: 'paid-prize' as DrawId, name: copy.paid_name, policy: { ...question.policy, content: 'prize', paid_weight: true,
    prize_value_usd_cents: 2500, official_rules: true, twitch_disclaimer: true } },
];

// Fixed generated commit-and-reveal vector from the merged offline verifier's
// simulated-writs corpus. This is separate from the editable 87-entry preview.
export const fixtureWrit: LotsWrit = {
  roll: { version: 1, entries: [{ handle: 'simulated_00', weight: 14 }, { handle: 'simulated_01', weight: 21 },
    { handle: 'simulated_02', weight: 28 }], winner_count: 2, sealed_at: '2026-10-25T12:00:00Z', margin_s: 6,
    randomness: { source: 'streamer_commit', commitment: '22cc2224d3f9a977adcbd805a4fab1f6e128ca215b63eb49d3354a959fa90d32' } },
  seal: '7a3df29d6035aa8ede203967174adfeaad804e9421fc46e2d5cd5f9c40ae403a',
  proof: { source: 'streamer_commit', seed: 'b40711a88c7039756fb8a73827eabe2c0fe5a0346ca7e0a104adc0fc764f528d' },
  winners: ['simulated_01', 'simulated_00'],
};
