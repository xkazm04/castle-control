import type { Tier } from '@castle-control/contract';
import type { DrawShape } from './model.ts';

export interface DrawTemplate {
  readonly id: string;
  readonly shape: DrawShape;
  readonly winner_count_by_tier: Readonly<Record<Tier, number>>;
}

/**
 * Original data from the Castle Control plan (D3 / WP 2.3), not copied code.
 * The plan fixes 3/7/15 counts but not their four-tier mapping. Chosen mapping:
 * Hearth (s) = 3, Hall (m) = 7, Courtyard (l) = 15, Tourney field (xl) = 15.
 * The two largest rooms share the upper count. This configures a draw BEFORE
 * sealing; it must never truncate, resample or otherwise alter a verified cast.
 * No renderer branch tests this id: every template uses the same scene builder.
 */
export const OVERLORD_URN_TEMPLATE = Object.freeze({
  id: 'overlord-urn',
  shape: 'urn',
  winner_count_by_tier: Object.freeze({ s: 3, m: 7, l: 15, xl: 15 }),
} as const satisfies DrawTemplate);
