import { expect, it } from 'vitest';
import type { Tier } from '@castle-control/contract';
import { OVERLORD_URN_TEMPLATE } from './template.ts';
import { buildDrawScene, createDrawPlayback } from './scenes.ts';

it('describes overlord-urn entirely as data with explicit counts for all four tiers', () => {
  expect(OVERLORD_URN_TEMPLATE).toEqual({
    id: 'overlord-urn', shape: 'urn', winner_count_by_tier: { s: 3, m: 7, l: 15, xl: 15 },
  });
  const tiers: Tier[] = ['s', 'm', 'l', 'xl'];
  for (const tier of tiers) {
    const count = OVERLORD_URN_TEMPLATE.winner_count_by_tier[tier];
    const winners = Array.from({ length: count }, (_, index) => `sim_${tier}_${index}`);
    // The host uses count for configuration BEFORE sealing; the renderer never truncates a cast.
    const scene = buildDrawScene(OVERLORD_URN_TEMPLATE.shape, {
      winners, label: 'streamer-controlled',
    }, { content: 'question', reduced_motion: true });
    expect(createDrawPlayback(scene).advanceTo(0).revealed_winners).toEqual(winners);
    expect([3, 7, 15]).toContain(count);
  }
  expect(Object.isFrozen(OVERLORD_URN_TEMPLATE)).toBe(true);
  expect(Object.isFrozen(OVERLORD_URN_TEMPLATE.winner_count_by_tier)).toBe(true);
});
