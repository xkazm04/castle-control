import { describe, expect, it } from 'vitest';
import type { LotsVerifiedCast } from '@castle-control/contract';
import {
  ballotBoxDraw, buildDrawScene, createDrawPlayback, deckDraw, urnDraw, wheelDraw,
} from './scenes.ts';
import { TWITCH_DRAW_DISCLAIMER } from './disclaimer.ts';

const shapes = [urnDraw, wheelDraw, deckDraw, ballotBoxDraw];
const labels = ['drand-quicknet', 'streamer-controlled'] as const;
// Generated simulated handles, never real chat or a network draw.
function simulatedCast(seed: number): LotsVerifiedCast {
  return {
    seal: '0'.repeat(64), label: labels[seed % labels.length]!,
    winners: Array.from({ length: seed % 40 + 1 }, (_, i) => `sim_${seed}_${(i * 17) % 41}`),
  };
}

describe('cast-only draw scenes', () => {
  it.each(shapes)('%s preserves all winners in order across 1000 generated casts and both motion modes', (shape) => {
    for (let seed = 0; seed < 1000; seed++) {
      const cast = simulatedCast(seed);
      const original = structuredClone(cast);
      for (const reduced_motion of [false, true]) {
        const scene = shape(cast, { content: 'prize', disclaimer: true, reduced_motion });
        const player = createDrawPlayback(scene);
        expect(player.advanceTo(-1).revealed_winners).toEqual([]);
        for (const event of scene.events) {
          const revealed = player.advanceTo(event.at_ms).revealed_winners;
          expect(revealed).toEqual(cast.winners.slice(0, revealed.length));
        }
        expect(player.advanceTo(Infinity).revealed_winners).toEqual(cast.winners);
        expect(player.advanceTo(-Infinity).revealed_winners).toEqual([]);
        expect(player.advanceTo(Infinity).revealed_winners).toEqual(cast.winners);
        expect(scene.layers.find((layer) => layer.kind === 'cast_label')?.text).toBe(cast.label);
      }
      expect(cast).toEqual(original);
    }
  });

  it.each(shapes)('%s refuses prize scenes with an absent or disabled disclaimer', (shape) => {
    const cast = simulatedCast(2);
    expect(() => shape(cast, { content: 'prize' })).toThrow(/disclaimer/i);
    expect(() => shape(cast, { content: 'prize', disclaimer: false })).toThrow(/disclaimer/i);
    expect(() => shape(cast, { content: 'question' })).not.toThrow();
  });

  it.each(shapes)('%s keeps the disclaimer and accurate cast label visible before, during and after reveals', (shape) => {
    for (const label of labels) {
      const scene = shape({ ...simulatedCast(3), label }, { content: 'prize', disclaimer: true });
      const player = createDrawPlayback(scene);
      for (const at_ms of [-1, 0, scene.duration_ms / 2, scene.duration_ms, Infinity]) {
        const overlay = player.advanceTo(at_ms).layers.find((layer) => layer.kind === 'disclaimer');
        expect(overlay).toMatchObject({ text: TWITCH_DRAW_DISCLAIMER, cast_label: label });
      }
    }
  });

  it.each(shapes)('%s reveals immediately and remains static under reduced motion', (shape) => {
    const cast = simulatedCast(15);
    const scene = shape(cast, { content: 'prize', disclaimer: true, reduced_motion: true });
    expect(scene.duration_ms).toBe(0);
    expect(scene.motions).toEqual([]);
    expect(scene.events.every((event) => event.at_ms === 0)).toBe(true);
    const player = createDrawPlayback(scene);
    const still = player.advanceTo(0);
    expect(still.revealed_winners).toEqual(cast.winners);
    expect(player.advanceTo(60_000)).toBe(still);
  });

  it('supplies distinct vector artwork and decorative motions for all four shapes', () => {
    const scenes = shapes.map((shape) => shape(simulatedCast(1), { content: 'idea' }));
    expect(scenes.map((scene) => scene.shape)).toEqual(['urn', 'wheel', 'deck', 'ballot_box']);
    expect(new Set(scenes.map((scene) => JSON.stringify(scene.layers[0]))).size).toBe(4);
    expect(new Set(scenes.map((scene) => scene.motions[0]?.property)).size).toBe(3);
    for (const scene of scenes) {
      expect(scene.events[0]?.at_ms).toBeGreaterThan(0);
      expect(scene.motions.every((motion) => motion.easing === 'cubic-bezier(.2,.8,.2,1)')).toBe(true);
    }
  });

  it('snapshots and freezes outcomes, descriptions and playback state', () => {
    const cast = simulatedCast(4);
    const expected = [...cast.winners];
    const scene = urnDraw(cast, { content: 'prize', disclaimer: true });
    cast.winners.reverse();
    cast.winners.push('sim_late');
    cast.label = 'streamer-controlled';
    const player = createDrawPlayback(scene);
    expect(player.advanceTo(Infinity).revealed_winners).toEqual(expected);
    expect(Object.isFrozen(scene)).toBe(true);
    expect(Object.isFrozen(scene.events)).toBe(true);
    expect(Object.isFrozen(scene.events[0])).toBe(true);
    expect(Object.isFrozen(scene.layers)).toBe(true);
    expect(Object.isFrozen(scene.layers[0])).toBe(true);
    expect(Object.isFrozen(scene.motions[0])).toBe(true);
    expect(Object.isFrozen(player.scene.revealed_winners)).toBe(true);
    expect(createDrawPlayback(scene).advanceTo(-1).revealed_winners).toEqual([]);
  });

  it('rejects an unsupported shape instead of silently substituting artwork', () => {
    expect(() => buildDrawScene('invalid' as 'urn', simulatedCast(1), { content: 'seat' })).toThrow();
  });
});
