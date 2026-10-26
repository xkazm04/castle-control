import { describe, expect, it, vi } from 'vitest';
import { applyLayerBindings, bindLayerBindings, evaluateBinding } from './index.ts';
import type { IntensityBinding, LayerProperties } from './index.ts';

const base: LayerProperties = Object.freeze({
  x: 10, y: -20, width: 320, height: 180, scale: 1, opacity: 0.8,
});
const bindings: readonly IntensityBinding[] = [
  { property: 'opacity', output_range: { at_zero: 0, at_one: 1 } },
  { property: 'scale', output_range: { at_zero: 0, at_one: 4 } },
  { property: 'x', output_range: { at_zero: -100, at_one: 100 } },
  { property: 'y', output_range: { at_zero: 100, at_one: -100 } },
];

describe('design layer bindings (simulated data)', () => {
  it.each([
    ['opacity', 0, 1, 0.25], ['scale', 0, 4, 1],
    ['x', -100, 100, -50], ['y', 100, -100, 50],
  ] as const)('evaluates %s at endpoints and between them', (property, at_zero, at_one, expected) => {
    const binding = { property, output_range: { at_zero, at_one } };
    expect(evaluateBinding(binding, 0)).toBe(at_zero);
    expect(evaluateBinding(binding, 1)).toBe(at_one);
    expect(evaluateBinding(binding, 0.25)).toBe(expected);
    expect(evaluateBinding(binding, -5)).toBe(at_zero);
    expect(evaluateBinding(binding, 5)).toBe(at_one);
  });

  it.each(['opacity', 'scale', 'x', 'y'] as const)('supports descending %s ranges', (property) => {
    expect(evaluateBinding({ property, output_range: { at_zero: 1, at_one: 0 } }, 0.25)).toBe(0.75);
    expect(evaluateBinding({ property, output_range: { at_zero: 0.4, at_one: 0.4 } }, 0.8)).toBe(0.4);
  });

  it('keeps opacity and scale inside their domains over clamped inputs', () => {
    for (let step = -10; step <= 110; step++) {
      for (const [at_zero, at_one] of [[0, 1], [1, 0], [0.1, 0.9]] as const) {
        const output_range = { at_zero, at_one };
        const opacity = evaluateBinding({ property: 'opacity', output_range }, step / 100);
        const scale = evaluateBinding({ property: 'scale', output_range }, step / 100);
        expect(opacity).toBeGreaterThanOrEqual(0);
        expect(opacity).toBeLessThanOrEqual(1);
        expect(scale).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('interpolates extreme finite endpoints without intermediate overflow', () => {
    const limit = Number.MAX_VALUE;
    expect(evaluateBinding({ property: 'x', output_range: { at_zero: -limit, at_one: limit } }, 0.5)).toBe(0);
    expect(evaluateBinding({ property: 'scale', output_range: { at_zero: limit, at_one: limit } }, 0.5)).toBe(limit);
  });

  it('applies bindings without changing base properties or unbound dimensions', () => {
    expect(applyLayerBindings(base, bindings, 0.25)).toEqual({
      x: -50, y: 50, width: 320, height: 180, scale: 1, opacity: 0.25,
    });
    expect(base).toEqual({ x: 10, y: -20, width: 320, height: 180, scale: 1, opacity: 0.8 });
    expect(applyLayerBindings(base, [], 0.3)).toEqual(base);
    expect(applyLayerBindings(base, [], 0.3)).not.toBe(base);
    expect(applyLayerBindings(base, [
      { property: 'x', output_range: { at_zero: 1, at_one: 2 } },
      { property: 'x', output_range: { at_zero: 3, at_one: 4 } },
    ], 0)).toEqual({ ...base, x: 3 });
  });

  it.each([NaN, Infinity, -Infinity])('rejects nonfinite intensity %s, even without bindings', (input) => {
    for (const binding of bindings) expect(() => evaluateBinding(binding, input)).toThrow(RangeError);
    expect(() => applyLayerBindings(base, [], input)).toThrow(RangeError);
    const setProperty = vi.fn();
    expect(() => bindLayerBindings({ style: { setProperty } }, base, bindings)(input)).toThrow(RangeError);
    expect(setProperty).not.toHaveBeenCalled();
  });

  it('rejects invalid binding endpoints before any DOM write', () => {
    const invalid: IntensityBinding[] = [
      { property: 'opacity', output_range: { at_zero: -0.1, at_one: 1 } },
      { property: 'opacity', output_range: { at_zero: 0, at_one: 1.1 } },
      { property: 'scale', output_range: { at_zero: -1, at_one: 1 } },
      { property: 'x', output_range: { at_zero: Infinity, at_one: 0 } },
      { property: 'y', output_range: { at_zero: 0, at_one: NaN } },
    ];
    for (const binding of invalid) {
      expect(() => evaluateBinding(binding, 0.5)).toThrow(RangeError);
      const setProperty = vi.fn();
      expect(() => bindLayerBindings({ style: { setProperty } }, base, [binding])(0.5)).toThrow(RangeError);
      expect(setProperty).not.toHaveBeenCalled();
    }
  });

  it('writes only custom properties and skips identical effective intensities', () => {
    const setProperty = vi.fn();
    const replaceChildren = vi.fn();
    const writeMarkup = vi.fn();
    const root = { style: { setProperty }, replaceChildren,
      set innerHTML(value: string) { writeMarkup(value); },
    };
    const update = bindLayerBindings(root, base, bindings);
    expect(update(0.25)).toBe(true);
    expect(setProperty.mock.calls).toEqual([
      ['--x', '-50'], ['--y', '50'], ['--width', '320'], ['--height', '180'],
      ['--scale', '1'], ['--opacity', '0.25'],
    ]);
    setProperty.mockClear();
    expect(update(0.25)).toBe(false);
    expect(setProperty).not.toHaveBeenCalled();
    expect(update(-1)).toBe(true);
    setProperty.mockClear();
    expect(update(0)).toBe(false);
    expect(setProperty).not.toHaveBeenCalled();
    expect(update(2)).toBe(true);
    setProperty.mockClear();
    expect(update(1)).toBe(false);
    expect(setProperty).not.toHaveBeenCalled();
    expect(replaceChildren).not.toHaveBeenCalled();
    expect(writeMarkup).not.toHaveBeenCalled();
  });

  it('snapshots configuration and keeps independent per-root caches', () => {
    const first = vi.fn();
    const second = vi.fn();
    const properties = { ...base };
    const output_range = { at_zero: 0, at_one: 1 };
    const list: IntensityBinding[] = [{ property: 'opacity', output_range }];
    const a = bindLayerBindings({ style: { setProperty: first } }, properties, list);
    const b = bindLayerBindings({ style: { setProperty: second } }, base, []);
    properties.width = 999;
    output_range.at_one = 0;
    list.length = 0;
    a(0.5);
    b(0.5);
    expect(first).toHaveBeenCalledWith('--width', '320');
    expect(first).toHaveBeenCalledWith('--opacity', '0.5');
    expect(second).toHaveBeenCalledWith('--opacity', '0.8');
    expect(a(0.5)).toBe(false);
    expect(b(0.5)).toBe(false);
  });

  it('does not cache an update until all CSS writes succeed', () => {
    const setProperty = vi.fn().mockImplementationOnce(() => { throw new Error('simulated CSS failure'); });
    const update = bindLayerBindings({ style: { setProperty } }, base, bindings);
    expect(() => update(0.4)).toThrow('simulated CSS failure');
    expect(update(0.4)).toBe(true);
    expect(update(0.4)).toBe(false);
    expect(setProperty).toHaveBeenCalledTimes(7);
    expect(() => update(NaN)).toThrow(RangeError);
    expect(update(0.4)).toBe(false);
  });
});
