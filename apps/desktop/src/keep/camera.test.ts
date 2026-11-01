import * as React from 'react';
import { afterEach, expect, test, vi } from 'vitest';
import type { TransitionEvent } from 'react';
import { appOverviewFrame, appOverviewTarget, frameTransform } from '@castle-control/keep-art';
import { dollyMilliseconds, fitDiorama, useKeepCamera } from './camera.js';

vi.mock('react', async original => ({ ...await original<typeof React>() }));
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });

function camera(reduced = false) {
  const element = {};
  const effects: (() => void)[] = [];
  vi.spyOn(React, 'useRef').mockImplementationOnce(() => ({ current: element }));
  vi.spyOn(React, 'useRef').mockImplementation(value => ({ current: value }));
  vi.spyOn(React, 'useEffect').mockImplementation(effect => { const cleanup = effect(); if (cleanup) effects.push(cleanup); });
  const opening = vi.fn();
  vi.spyOn(React, 'useState').mockReturnValue([undefined, opening]);
  const read = vi.fn(() => '1.15s');
  vi.stubGlobal('getComputedStyle', vi.fn(() => ({ getPropertyValue: read })));
  vi.stubGlobal('window', { matchMedia: vi.fn(() => ({ matches: reduced })) });
  const on_open = vi.fn();
  return { ...useKeepCamera(on_open), on_open, opening, read, cleanup: () => effects.forEach(effect => effect()) };
}

test('normal motion reads the token once, waits its full duration, and ignores repeated opens', () => {
  vi.useFakeTimers();
  const control = camera();
  control.open('lottery'); control.open('studio');
  expect(control.opening).toHaveBeenCalledExactlyOnceWith('lottery');
  expect(control.on_open).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1149);
  expect(control.on_open).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1);
  expect(control.on_open).toHaveBeenCalledExactlyOnceWith('lottery');
  expect(control.read).toHaveBeenCalledExactlyOnceWith('--m-dolly');
});

test('only the castle transform transition completes the dolly, once; unmount cancels the fallback', () => {
  vi.useFakeTimers();
  const control = camera();
  control.open('moderator');
  const element = documentElement();
  const transition = (propertyName: string, target = element) => Object.assign({} as TransitionEvent<HTMLDivElement>, { propertyName, target, currentTarget: element });
  control.transitionEnd(transition('opacity'));
  control.transitionEnd(transition('transform', documentElement()));
  expect(control.on_open).not.toHaveBeenCalled();
  control.transitionEnd(transition('transform'));
  vi.runAllTimers();
  expect(control.on_open).toHaveBeenCalledExactlyOnceWith('moderator');
  control.open('visuals'); control.cleanup(); vi.runAllTimers();
  expect(control.on_open).toHaveBeenCalledOnce();
});

function documentElement() { return {} as HTMLDivElement; }

test('reduced motion cuts immediately without setting up a dolly', () => {
  vi.useFakeTimers();
  const control = camera(true);
  control.open('studio');
  expect(control.on_open).toHaveBeenCalledExactlyOnceWith('studio');
  expect(control.opening).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});

test('duration units, fitting, and compensated type preserve the rendered floor at 1280 by 800', () => {
  expect(dollyMilliseconds('1.15s')).toBe(1150);
  expect(dollyMilliseconds('1150ms')).toBe(1150);
  expect(() => dollyMilliseconds('')).toThrow('duration token');
  expect(() => dollyMilliseconds('1.15invalid')).toThrow('duration token');
  expect(fitDiorama(2120, 1396)).toBe(2);
  const scale = fitDiorama(1280 - 48, 800 - 56 - 120 - 24 - 52);
  const camera = frameTransform(appOverviewFrame, appOverviewTarget, 'contain');
  const combined = scale * camera.s;
  expect(Math.max(13, 13 / combined) * combined).toBeCloseTo(13);
  expect(Math.max(17, 15 / combined) * combined).toBeGreaterThanOrEqual(15);
});
