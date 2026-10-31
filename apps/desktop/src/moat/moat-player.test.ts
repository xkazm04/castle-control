import { expect, test, vi } from 'vitest';
import { browserClock, createMoatPlayer, manualClock } from './moat-player.js';

test('a finished replay is the resting state and play runs it again from the start', () => {
  const clock = manualClock();
  const player = createMoatPlayer(10000, clock);
  expect(player.getSnapshot()).toMatchObject({ playhead_ms: 10000, playing: false, speed: 8 });
  player.play();
  expect(player.getSnapshot()).toMatchObject({ playhead_ms: 0, playing: true });
  expect(clock.running()).toBe(true);
});

test('the playhead moves at the chosen speed and stops itself at the end', () => {
  const clock = manualClock();
  const player = createMoatPlayer(10000, clock, { start: 'start' });
  player.play();
  clock.advance(100);
  expect(player.getSnapshot().playhead_ms).toBe(800);
  player.setSpeed(1);
  clock.advance(100);
  expect(player.getSnapshot().playhead_ms).toBe(900);
  player.setSpeed(60);
  for (let frame = 0; frame < 40; frame += 1) clock.advance(100);
  expect(player.getSnapshot()).toMatchObject({ playhead_ms: 10000, playing: false });
  expect(clock.running()).toBe(false);
});

test('pause and seek hold the playhead and never leave the run', () => {
  const clock = manualClock();
  const player = createMoatPlayer(5000, clock, { start: 'start' });
  player.play();
  clock.advance(50);
  player.pause();
  expect(clock.running()).toBe(false);
  const held = player.getSnapshot().playhead_ms;
  clock.advance(500);
  expect(player.getSnapshot().playhead_ms).toBe(held);
  player.seek(-10);
  expect(player.getSnapshot().playhead_ms).toBe(0);
  player.seek(99999);
  expect(player.getSnapshot().playhead_ms).toBe(5000);
  expect(player.getSnapshot().playing).toBe(false);
});

test('a stalled frame cannot throw the playhead forward', () => {
  const clock = manualClock();
  const player = createMoatPlayer(100000, clock, { start: 'start', speed: 1 });
  player.play();
  clock.advance(60000);
  expect(player.getSnapshot().playhead_ms).toBe(250);
});

test('play twice starts one clock, and subscribers hear each change until they leave', () => {
  const clock = manualClock();
  const frames = vi.spyOn(clock, 'frames');
  const player = createMoatPlayer(10000, clock, { start: 'start' });
  const heard = vi.fn();
  const leave = player.subscribe(heard);
  player.play(); player.play();
  expect(frames).toHaveBeenCalledTimes(1);
  clock.advance(16);
  const count = heard.mock.calls.length;
  expect(count).toBeGreaterThanOrEqual(2);
  leave();
  clock.advance(16);
  expect(heard).toHaveBeenCalledTimes(count);
});

test('the heartbeat rests at the end, then runs again', () => {
  const clock = manualClock();
  const player = createMoatPlayer(1000, clock, { start: 'start', loop: { rest_ms: 200 }, speed: 8 });
  player.play();
  clock.advance(125);
  expect(player.getSnapshot().playhead_ms).toBe(1000);
  clock.advance(100);
  expect(player.getSnapshot().playhead_ms).toBe(1000);
  clock.advance(100);
  expect(player.getSnapshot().playhead_ms).toBe(0);
  expect(player.getSnapshot().playing).toBe(true);
  clock.advance(50);
  expect(player.getSnapshot().playhead_ms).toBe(400);
});

test('a throttled player publishes less often but covers the same time', () => {
  const clock = manualClock();
  const player = createMoatPlayer(100000, clock, { start: 'start', speed: 1, min_frame_ms: 50 });
  const heard = vi.fn();
  player.subscribe(heard);
  player.play();
  heard.mockClear();
  for (let frame = 0; frame < 10; frame += 1) clock.advance(16);
  expect(heard.mock.calls.length).toBeLessThanOrEqual(4);
  expect(heard.mock.calls.length).toBeGreaterThanOrEqual(2);
  clock.advance(100);
  expect(player.getSnapshot().playhead_ms).toBeGreaterThanOrEqual(240);
  expect(player.getSnapshot().playhead_ms).toBeLessThanOrEqual(260);
});

test('the browser clock stays stopped when a tick stops it from inside, so a later seek cannot restart the replay unseen', () => {
  const frames = new Map<number, () => void>(); let issued = 0; let now = 0;
  vi.stubGlobal('requestAnimationFrame', (callback: () => void) => { issued += 1; frames.set(issued, callback); return issued; });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => { frames.delete(id); });
  vi.stubGlobal('performance', { now: () => now });
  try {
    const frame = () => { const [id, callback] = [...frames][0] ?? []; if (id === undefined) return false; frames.delete(id); now += 16; callback?.(); return true; };
    const player = createMoatPlayer(1000, browserClock, { start: 'start', speed: 60 });
    player.play();
    while (player.getSnapshot().playing && frame()) { /* run frames until the replay ends */ }
    expect(player.getSnapshot()).toMatchObject({ playhead_ms: 1000, playing: false });
    // The loop that ended itself books no further frame.
    expect(frames.size).toBe(0);
    player.seek(0);
    expect(frame()).toBe(false);
    expect(player.getSnapshot()).toMatchObject({ playhead_ms: 0, playing: false });
  } finally { vi.unstubAllGlobals(); }
});
