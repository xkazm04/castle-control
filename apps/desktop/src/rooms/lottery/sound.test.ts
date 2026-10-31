import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { fixtureEntries } from '../../lots-fixture.js';
import { lotsCopy as copy } from '../../lots-copy.js';
import { createRevealClock } from './playback.js';
import { chimeHz, createCeremonySound, flourishHits } from './sound.js';
import type { SoundContext } from './sound.js';
import { DrawStage } from './stage.jsx';
import { draw_shapes } from './stage-model.js';

type Started = { kind: 'oscillator' | 'noise'; at: number; frequency?: number; type?: string };
function fakeContext() {
  const started: Started[] = [];
  const param = () => ({ value: 0, setValueAtTime: () => undefined, exponentialRampToValueAtTime: () => undefined });
  const connect = () => undefined;
  const context: SoundContext = {
    currentTime: 10, sampleRate: 8000, destination: {},
    createGain: () => ({ connect, gain: param() }),
    createBiquadFilter: () => ({ connect, type: 'lowpass', frequency: param(), Q: param() }),
    createBuffer: (_channels, length) => { const data = new Float32Array(length); return { getChannelData: () => data }; },
    createBufferSource: () => ({ connect, buffer: null, start: (at: number) => { started.push({ kind: 'noise', at }); } }),
    createOscillator: () => {
      let hz = 0;
      const oscillator: ReturnType<SoundContext['createOscillator']> = { connect, type: 'sine',
        frequency: { setValueAtTime: (value: number) => { hz = value; } },
        start: (at: number) => { started.push({ kind: 'oscillator', at, frequency: hz, type: oscillator.type }); }, stop: () => undefined };
      return oscillator;
    },
  };
  return { context, started };
}

test('each shape has its own flourish texture; the wheel ticks slow down as it settles', () => {
  for (const shape of draw_shapes) {
    const hits = flourishHits(shape, 1200);
    expect(hits[0]).toBe(0); expect(hits.every(hit => hit < 1200)).toBe(true);
    expect(hits.every((hit, index) => index === 0 || hit > (hits[index - 1] ?? 0))).toBe(true);
  }
  const wheel = flourishHits('wheel', 1200);
  const gaps = wheel.slice(1).map((hit, index) => hit - (wheel[index] ?? 0));
  expect((gaps.at(-1) ?? 0)).toBeGreaterThan((gaps[0] ?? 0) * 3);
  expect(flourishHits('deck', 1200).length).toBeGreaterThan(flourishHits('ballot_box', 1200).length);
});

test('bells climb a whole tone per winner and fold back after seven', () => {
  expect(chimeHz(1)).toBe(660);
  expect(chimeHz(2)).toBeCloseTo(660 * 2 ** (2 / 12));
  expect(chimeHz(8)).toBe(chimeHz(1));
});

test('the synthesizer schedules after the current time and never throws on a bare context', () => {
  const { context, started } = fakeContext();
  const sound = createCeremonySound(context);
  sound.flourish('wheel', 1200);
  const ticks = started.length;
  expect(ticks).toBeGreaterThan(10);
  expect(started.every(item => item.at >= 10)).toBe(true);
  sound.chime(3);
  expect(started.slice(ticks).map(item => item.frequency)).toContain(chimeHz(3));
  const before = started.length; sound.fanfare();
  expect(started.slice(before).filter(item => item.type === 'triangle')).toHaveLength(4);
});

test('the stage offers an unpressed sound toggle only when the room wires it', () => {
  const props = { shape: 'urn' as const, on_shape: () => undefined, entries: fixtureEntries(12), cast: undefined, content: 'question' as const,
    sealed: false, clock: createRevealClock(), reveal_ms: 1500 };
  expect(renderToStaticMarkup(createElement(DrawStage, props))).not.toContain(copy.stage.sound);
  const html = renderToStaticMarkup(createElement(DrawStage, { ...props, on_sound: () => undefined }));
  expect(html).toMatch(new RegExp(`aria-pressed="false"[^>]*>${copy.stage.sound}<`));
  const on = renderToStaticMarkup(createElement(DrawStage, { ...props, sound: true, on_sound: () => undefined }));
  expect(on).toMatch(new RegExp(`aria-pressed="true"[^>]*>${copy.stage.sound}<`));
});

test('sound stays asset-free: no audio files, no fetch', () => {
  const source = readFileSync(new URL('./sound.ts', import.meta.url), 'utf8');
  expect(source).not.toMatch(/fetch\(|\.mp3|\.wav|\.ogg|new Audio\(/);
});
