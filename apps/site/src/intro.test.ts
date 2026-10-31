import { expect, test } from 'vitest';
import { createIntro } from './intro.ts';
import { initialState, transition } from './machine.ts';

function fixture(active = true) {
  let state = initialState(!active);
  let now = 0, due = 0, calls = 0, focuses = 0;
  let callback: (() => void) | undefined;
  let shown = false, focused = false;
  const intro = createIntro({
    schedule: (run, delay) => { callback = run; due = now + delay; return 1; },
    cancel: () => { callback = undefined; },
    handover: (event) => { state = transition(state, event); calls++; },
    showSkip: (show) => { shown = show; },
    skipFocused: () => focused,
    focusFirst: () => { focuses++; focused = false; },
  }, active);
  return { intro, snapshot: () => ({ state, pending: callback !== undefined, shown, focuses, calls }),
    focusSkip: () => { focused = true; },
    advance: (elapsed: number) => { now += elapsed; if (callback && due <= now) callback(); } };
}

test('unattended intro hands over at exactly 2700 ms and clears its timer', () => {
  const page = fixture();
  page.advance(2699);
  expect(page.snapshot().state.phase).toBe('intro');
  page.advance(1);
  expect(page.snapshot()).toMatchObject({ state: { phase: 'overview' }, pending: false, shown: false, calls: 1 });
  page.advance(4000);
  expect(page.snapshot().calls).toBe(1);
});

test('every key ends printing; Tab retains reachable Skip; native Enter/Space click returns focus', () => {
  for (const activation of ['Enter', ' ']) {
    const page = fixture();
    page.intro.key('Tab', false);
    expect(page.snapshot()).toMatchObject({ state: { phase: 'overview' }, shown: true, pending: false });
    page.focusSkip();
    page.intro.key(activation, true);
    expect(page.snapshot().shown).toBe(true);
    page.intro.skip();
    expect(page.snapshot()).toMatchObject({ shown: false, focuses: 1, pending: false, calls: 1 });
  }
  for (const key of ['x', '1', 'Escape', 'Shift']) {
    const page = fixture(); page.intro.key(key, false);
    expect(page.snapshot()).toMatchObject({ state: { phase: 'overview' }, pending: false });
  }
});

test('Skip survives pointerdown until click; other pointers and room opening cancel the intro', () => {
  const page = fixture(); page.intro.pointer(true);
  expect(page.snapshot().state.phase).toBe('intro');
  expect(page.snapshot().shown).toBe(true);
  page.intro.skip();
  expect(page.snapshot()).toMatchObject({ shown: false, pending: false, focuses: 1 });
  const pointer = fixture(); pointer.intro.pointer(false);
  expect(pointer.snapshot().state.phase).toBe('overview');
  const room = fixture(); room.intro.sync(false);
  expect(room.snapshot()).toMatchObject({ pending: false, shown: false });
});

test('automatic handover returns focused Skip to the first room hit', () => {
  const page = fixture(); page.focusSkip(); page.advance(2700);
  expect(page.snapshot().focuses).toBe(1);
});

test('reduced motion schedules no timer; preference change cancels printing immediately', () => {
  const calm = fixture(false);
  expect(calm.snapshot()).toMatchObject({ state: { phase: 'overview' }, shown: false, pending: false });
  const change = fixture(); change.advance(800); change.intro.reduce();
  expect(change.snapshot()).toMatchObject({ state: { phase: 'overview' }, shown: false, pending: false, calls: 1 });
});
