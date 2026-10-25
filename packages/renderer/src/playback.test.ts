// Adapted from Shadowrunr OS, packages/stage-kit/src/visuals.test.ts @ 7e4b6f8 (Apache-2.0).
// Playback and canvas cases use simulated captions instead of show events.
import { describe, expect, it, vi } from 'vitest';
import { Timeline, fitCanvas } from './playback.ts';
import { foldEvents, reduce } from './scene.ts';
import { initialScene } from './sceneModel.ts';
import type { Caption } from './sceneModel.ts';

const captions: readonly Caption[] = [1000, 2000, 3000, 5000].map((at_ms) => ({
  id: at_ms, at_ms, text: `Simulated caption ${at_ms}.`,
}));
const timeOf = (caption: Caption) => caption.at_ms;
const timeline = () => new Timeline(captions, initialScene, reduce, timeOf);

describe('playback', () => {
  it('names the next onset to wake for and omits it at the end', () => {
    const player = timeline();
    expect(player.next_at_ms).toBe(1000);
    player.advanceTo(2000);
    expect(player.next_at_ms).toBe(3000);
    player.advanceTo(5000);
    expect(player.next_at_ms).toBeUndefined();
  });

  it('advances incrementally and rebuilds on a backward seek', () => {
    const player = timeline();
    expect(player.duration_ms).toBe(4000);
    expect(player.advanceTo(1500)).toEqual(foldEvents(captions, 1500));
    expect(player.advanceTo(3500)).toEqual(foldEvents(captions, 3500));
    expect(player.advanceTo(2500)).toEqual(foldEvents(captions, 2500));
    expect(player.scene.applied).toBe(2);
    expect(player.position_ms).toBe(2500);
    expect(player.finished).toBe(false);
    player.advanceTo(9999);
    expect(player.finished).toBe(true);
  });

  it('letterboxes the canvas into the host window', () => {
    expect(fitCanvas(1920, 1080)).toEqual({ scale: 1, left: 0, top: 0 });
    expect(fitCanvas(960, 1080)).toEqual({ scale: 0.5, left: 0, top: 270 });
    expect(fitCanvas(3000, 1080)).toEqual({ scale: 1, left: 540, top: 0 });
  });

  it('does no reducer work on repeated or event-free forward positions', () => {
    const reducer = vi.fn(reduce);
    const player = new Timeline(captions, initialScene, reducer, timeOf);
    const first = player.advanceTo(1500);
    expect(player.advanceTo(1500)).toBe(first);
    expect(player.advanceTo(1999)).toBe(first);
    expect(reducer).toHaveBeenCalledTimes(1);
    expect(player.advanceTo(-Infinity)).toEqual(initialScene());
    expect(player.next_at_ms).toBe(1000);
  });

  it('handles empty timelines and applies equal-time captions in input order', () => {
    const empty = new Timeline<ReturnType<typeof initialScene>, Caption>([], initialScene, reduce, timeOf);
    expect(empty.duration_ms).toBe(0);
    expect(empty.finished).toBe(true);
    expect(empty.next_at_ms).toBeUndefined();
    expect(empty.advanceTo(Infinity)).toEqual(initialScene());
    const same_time = [{ id: 1, text: 'A.', at_ms: 10 }, { id: 2, text: 'B.', at_ms: 10 }];
    const player = new Timeline(same_time, initialScene, reduce, timeOf);
    expect(player.advanceTo(10).captions.map((caption) => caption.id)).toEqual([1, 2]);
  });

  it('rejects unordered or nonfinite onsets and NaN positions', () => {
    expect(() => new Timeline([...captions].reverse(), initialScene, reduce, timeOf)).toThrow(RangeError);
    for (const at_ms of [NaN, Infinity, -Infinity]) {
      expect(() => new Timeline([{ id: 1, text: '', at_ms }], initialScene, reduce, timeOf)).toThrow(RangeError);
    }
    const player = timeline();
    expect(() => player.advanceTo(NaN)).toThrow(RangeError);
    expect(player.scene).toEqual(initialScene());
  });

  it('snapshots the event array so caller appends cannot alter playback', () => {
    const source = [...captions];
    const player = new Timeline(source, initialScene, reduce, timeOf);
    source.length = 0;
    expect(player.advanceTo(Infinity).applied).toBe(4);
  });
});
