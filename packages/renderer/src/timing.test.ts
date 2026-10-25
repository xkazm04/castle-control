// Adapted from Shadowrunr OS, packages/stage-kit/src/visuals.test.ts @ 7e4b6f8 (Apache-2.0).
// Kinetic timing cases only, with generated generic text and no show vocabulary.
import { describe, expect, it } from 'vitest';
import { CAPTION_HOLD_MS, captionOpacity, isEmphatic, visibleWords, wordTimings } from './timing.ts';

describe('kinetic caption timing', () => {
  it('gives every word an increasing onset with punctuation pauses', () => {
    const line = wordTimings('Hello, everyone. The countdown... starts');
    expect(line.words.map((word) => word.word)).toEqual(['Hello,', 'everyone.', 'The', 'countdown...', 'starts']);
    const starts = line.words.map((word) => word.start_ms);
    expect(starts[0]).toBe(0);
    for (let i = 1; i < starts.length; i++) expect(starts[i]!).toBeGreaterThan(starts[i - 1]!);
    const plain = wordTimings('everyone The').words[1]!.start_ms;
    expect(starts[2]! - starts[1]!).toBeGreaterThan(plain);
    expect(line.spoken_ms).toBeGreaterThan(starts[4]!);
  });

  it('reveals words over time and fades after the hold', () => {
    const line = wordTimings('one two three');
    expect(visibleWords(line, -1)).toBe(0);
    expect(visibleWords(line, 0)).toBe(1);
    expect(visibleWords(line, line.spoken_ms)).toBe(3);
    expect(captionOpacity(line, line.spoken_ms + CAPTION_HOLD_MS)).toBe(1);
    expect(captionOpacity(line, line.spoken_ms + CAPTION_HOLD_MS + 300)).toBeCloseTo(0.5);
    expect(captionOpacity(line, line.spoken_ms + CAPTION_HOLD_MS + 5000)).toBe(0);
  });

  it('emphasises caps and numbers without show-specific vocabulary', () => {
    for (const word of ['HELLO.', '4%', 'ÉTÉ']) expect(isEmphatic(word)).toBe(true);
    for (const word of ['hello,', 'the', 'I', '—']) expect(isEmphatic(word)).toBe(false);
  });

  it('handles empty text and caps long-word timing', () => {
    expect(wordTimings(' \n\t ')).toEqual({ words: [], spoken_ms: 0 });
    expect(visibleWords(wordTimings(''), 500)).toBe(0);
    expect(wordTimings('x'.repeat(100)).spoken_ms).toBe(wordTimings('x'.repeat(14)).spoken_ms);
  });

  it('distinguishes commas, stops and ellipses even with closing quotes', () => {
    const plain = wordTimings('wait').spoken_ms;
    expect(wordTimings('wait,"').spoken_ms - plain).toBe(170);
    expect(wordTimings('wait!"').spoken_ms - plain).toBe(360);
    expect(wordTimings('wait..."').spoken_ms - plain).toBe(560);
    expect(wordTimings('wait…').spoken_ms - plain).toBe(560);
  });
});
