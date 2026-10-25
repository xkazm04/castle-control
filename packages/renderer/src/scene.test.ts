// Adapted from Shadowrunr OS, packages/stage-kit/src/scene.test.ts @ 7e4b6f8 (Apache-2.0).
// Caption queue cases only. All text is simulated and channel-independent.
import { describe, expect, it } from 'vitest';
import { captionAt, enqueueCaption, foldEvents, reduce } from './scene.ts';
import { CAPTION_QUEUE_MAX, QUEUED_HOLD_MS, initialScene } from './sceneModel.ts';
import type { Caption } from './sceneModel.ts';
import { wordTimings } from './timing.ts';

const say = (at_ms: number, text: string): Caption => ({ id: at_ms, at_ms, text });

describe('caption queue', () => {
  it('shows a lone caption when it is said', () => {
    const scene = foldEvents([say(1000, 'Hello.')]);
    expect(captionAt(scene, 999)).toBeUndefined();
    expect(captionAt(scene, 1000)?.text).toBe('Hello.');
    expect(scene.caption?.text).toBe('Hello.');
  });

  it('queues a burst until the preceding caption has revealed and held two seconds', () => {
    const text = 'A simulated caption with enough words to take time to reveal.';
    const scene = foldEvents([say(0, text), say(100, 'Second.'), say(200, 'Third.')]);
    expect(scene.captions.map((caption) => caption.text)).toEqual([text, 'Second.', 'Third.']);
    const [first, second, third] = scene.captions;
    expect(second!.at_ms).toBe(wordTimings(text).spoken_ms + QUEUED_HOLD_MS);
    expect(third!.at_ms).toBe(second!.at_ms + wordTimings('Second.').spoken_ms + QUEUED_HOLD_MS);
    expect(captionAt(scene, first!.spoken_ms - 1)?.text).toBe(text);
    expect(captionAt(scene, second!.at_ms)?.text).toBe('Second.');
    expect(captionAt(scene, third!.at_ms + 10_000)?.text).toBe('Third.');
    expect(scene.caption?.text).toBe('Third.');
    expect(second!.said_at_ms).toBe(100);
  });

  it('does not delay a line said after the preceding reveal and hold', () => {
    const scene = foldEvents([say(0, 'Hello.'), say(60_000, 'Welcome.')]);
    expect(scene.captions.map((caption) => [caption.text, caption.at_ms])).toEqual([
      ['Hello.', 0], ['Welcome.', 60_000],
    ]);
    const later = reduce(scene, say(120_000, 'Next.'));
    expect(later.captions.map((caption) => caption.text)).toEqual(['Welcome.', 'Next.']);
  });

  it('skips the oldest excess waiters, never the showing slot', () => {
    const captions = [say(0, 'One, the showing line, which is long enough to hold.')];
    for (let i = 2; i <= 7; i++) captions.push(say(i, `Line ${i}.`));
    const scene = foldEvents(captions);
    expect(scene.captions.map((caption) => caption.text)).toEqual([
      captions[0]!.text, 'Line 5.', 'Line 6.', 'Line 7.',
    ]);
    expect(scene.captions).toHaveLength(1 + CAPTION_QUEUE_MAX);
    expect(scene.captions[1]!.at_ms).toBe(scene.captions[0]!.spoken_ms + QUEUED_HOLD_MS);
    for (let i = 1; i < scene.captions.length; i++) {
      const prev = scene.captions[i - 1]!;
      expect(scene.captions[i]!.at_ms - prev.at_ms).toBeGreaterThanOrEqual(prev.spoken_ms);
    }
  });

  it('drops captions that have been followed', () => {
    let queue = enqueueCaption([], { id: 1, text: 'A.', at_ms: 0 });
    queue = enqueueCaption(queue, { id: 2, text: 'B.', at_ms: 50_000 });
    queue = enqueueCaption(queue, { id: 3, text: 'C.', at_ms: 50_001 });
    expect(queue.map((caption) => caption.id)).toEqual([2, 3]);
  });

  it('preserves prior state and folds to the requested cutoff', () => {
    const initial = initialScene();
    const first = reduce(initial, say(0, 'A.'));
    const before = structuredClone(first);
    const second = reduce(first, say(100, 'B.'));
    expect(initial).toEqual({ applied: 0, captions: [] });
    expect(first).toEqual(before);
    expect(second).toMatchObject({ first_at_ms: 0, last_at_ms: 100, applied: 2 });
    expect(foldEvents([say(0, 'A.'), say(100, 'B.')], 50)).toEqual(first);
    expect(foldEvents([])).toEqual(initialScene());
  });
});
