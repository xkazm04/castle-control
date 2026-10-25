import { describe, expect, it, vi } from 'vitest';
import { bindIntensity } from './intensity.ts';

describe('CSS intensity binding (simulated root)', () => {
  it('writes CSS properties once and performs zero DOM writes for an identical update', () => {
    const setProperty = vi.fn();
    const replaceChildren = vi.fn();
    const writeMarkup = vi.fn();
    const root = {
      style: { setProperty },
      replaceChildren,
      set innerHTML(value: string) { writeMarkup(value); },
    };
    const update = bindIntensity(root, ['--intensity', '--glow']);
    expect(update(0.6)).toBe(true);
    expect(setProperty.mock.calls).toEqual([['--intensity', '0.6'], ['--glow', '0.6']]);
    setProperty.mockClear();
    expect(update(0.6)).toBe(false);
    expect(setProperty).not.toHaveBeenCalled();
    expect(replaceChildren).not.toHaveBeenCalled();
    expect(writeMarkup).not.toHaveBeenCalled();
    expect(update(0.8)).toBe(true);
    expect(setProperty.mock.calls).toEqual([['--intensity', '0.8'], ['--glow', '0.8']]);
  });

  it('clamps finite inputs and skips updates with the same effective intensity', () => {
    const setProperty = vi.fn();
    const update = bindIntensity({ style: { setProperty } });
    expect(update(-1)).toBe(true);
    expect(update(0)).toBe(false);
    expect(update(2)).toBe(true);
    expect(update(1)).toBe(false);
    expect(setProperty.mock.calls).toEqual([['--intensity', '0'], ['--intensity', '1']]);
    for (const invalid of [NaN, Infinity, -Infinity]) {
      expect(() => update(invalid)).toThrow(RangeError);
    }
    expect(setProperty).toHaveBeenCalledTimes(2);
  });

  it('keeps roots independent and snapshots a deduplicated property list', () => {
    const first = vi.fn();
    const second = vi.fn();
    const properties: `--${string}`[] = ['--intensity', '--intensity'];
    const a = bindIntensity({ style: { setProperty: first } }, properties);
    const b = bindIntensity({ style: { setProperty: second } });
    properties.push('--later');
    a(0.5);
    b(0.5);
    expect(first.mock.calls).toEqual([['--intensity', '0.5']]);
    expect(second.mock.calls).toEqual([['--intensity', '0.5']]);
    expect(() => bindIntensity({ style: { setProperty: first } }, [])).toThrow();
    expect(() => bindIntensity({ style: { setProperty: first } }, ['--bad name'])).toThrow();
  });

  it('retries after a CSS write fails rather than caching an unapplied intensity', () => {
    const setProperty = vi.fn().mockImplementationOnce(() => { throw new Error('simulated write failure'); });
    const update = bindIntensity({ style: { setProperty } });
    expect(() => update(0.4)).toThrow('simulated write failure');
    expect(update(0.4)).toBe(true);
    expect(update(0.4)).toBe(false);
    expect(setProperty).toHaveBeenCalledTimes(2);
  });
});
