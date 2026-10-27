import type { AskParams, WritSealParams, WritTearParams } from '@castle-control/contract';
import type { StewardTransport } from '../live.js';

// Recorded-format synthetic replies only. No real chat, model or service was used.
const base = {
  writ_id: '01ARZ3NDEKTSV4RRFFQ69G5FAV', status: 'proposed',
  created_at: '2026-10-27T00:00:00Z', updated_at: '2026-10-27T00:00:01Z',
} as const;
const curve = { ranges: [{ total: 0, intensity: 0 }, { total: 50, intensity: 1 }],
  decay: { kind: 'exponential', half_life_s: 300 } } as const;

export const recordedWrits = [
  { ...base, chamber: 'lots', proposal: { method: 'lots.draw.upsert', diff: { after: { draw: {
    draw_id: 'simulated-questions', name: 'Simulated questions',
    policy: { content: 'question', paid_entry: false, paid_weight: false, subscriber_only: false,
      channel_points: false, free_entry_equal_odds: true, regions: [], prize_value_usd_cents: 0,
      registration_confirmed: false, official_rules: false, twitch_disclaimer: false },
    rules: { pool: { kind: 'chatters' }, winner_count: 3, cooldown_s: 0, cohort_caps: [],
      weight_curve: { kind: 'equal' }, free_join_equal_odds: true },
  } } } } },
  { ...base, chamber: 'gatehouse', proposal: { method: 'gatehouse.rules.upsert', diff: { after: { rule: {
    rule_id: 'simulated-links', name: 'Simulated links', rule_class: 'pattern', mode: 'shadow',
    action: 'delete', delivery: 'streamer', pattern: 'https?://',
  } } } } },
  { ...base, chamber: 'gatehouse', proposal: { method: 'gatehouse.rules.setMode', diff: {
    before: { rule_id: 'simulated-links', mode: 'shadow' }, after: { rule_id: 'simulated-links', mode: 'shadow' },
  } } },
  { ...base, chamber: 'beacons', proposal: { method: 'beacons.visual.upsert', diff: {
    after: { visual: { visual_id: 'simulated-frame', name: 'Simulated frame', curve } },
  } } },
  { ...base, chamber: 'beacons', proposal: { method: 'beacons.curve.set', diff: {
    before: { visual_id: 'simulated-frame', curve }, after: { visual_id: 'simulated-frame', curve },
  } } },
] as const;

export function reply(value: unknown): string {
  return JSON.stringify({ writ: value });
}

type RecordedCall =
  | { readonly method: 'steward.ask'; readonly params: AskParams }
  | { readonly method: 'steward.writ.seal'; readonly params: WritSealParams }
  | { readonly method: 'steward.writ.tear'; readonly params: WritTearParams };

/** An in-memory transcript; it never opens a socket or grants authorization. */
export class RecordedStewardTransport implements StewardTransport {
  readonly label = 'SIMULATED recorded Steward fixtures';
  readonly calls: RecordedCall[] = [];
  readonly #replies: readonly (string | Error)[];
  #index = 0;

  constructor(replies: readonly (string | Error)[]) { this.#replies = [...replies]; }

  async #read(call: RecordedCall): Promise<string> {
    this.calls.push(call);
    const value = this.#replies[this.#index++];
    if (value === undefined) throw new Error('Simulated fixture transcript exhausted');
    if (value instanceof Error) throw value;
    return value;
  }

  ask(params: AskParams): Promise<string> { return this.#read({ method: 'steward.ask', params }); }
  async seal(params: WritSealParams): Promise<string> {
    this.calls.push({ method: 'steward.writ.seal', params });
    throw new Error('The recorded fixture transport cannot authorize a seal');
  }
  tear(params: WritTearParams): Promise<string> { return this.#read({ method: 'steward.writ.tear', params }); }
}
