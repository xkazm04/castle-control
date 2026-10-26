import { describe, expect, it } from 'vitest';
import {
  buildContributionMeterScene, parseContributionMeter, CONTRIBUTION_METER_TEMPLATE,
} from './contribution-meter.ts';

describe('contribution-meter renderer-local data (simulated)', () => {
  it('maps progress to a clamped fill without changing input or influencing another template', () => {
    for (const [current, fill_fraction] of [[-5, 0], [0, 0], [25, 0.25], [100, 1], [200, 1]]) {
      const data = { current, goal: 100, image_path: 'assets/meter.svg' };
      const scene = buildContributionMeterScene(data);
      expect(scene).toEqual({ ...data, fill_fraction });
      expect(data).not.toHaveProperty('fill_fraction');
      expect(Object.isFrozen(scene)).toBe(true);
      expect(buildContributionMeterScene(data)).toEqual(scene);
    }
    expect(buildContributionMeterScene(CONTRIBUTION_METER_TEMPLATE).fill_fraction).toBe(0);
    expect(buildContributionMeterScene({ current: Number.MAX_VALUE, goal: Number.MIN_VALUE })
      .fill_fraction).toBe(1);
    expect(Object.isFrozen(CONTRIBUTION_METER_TEMPLATE)).toBe(true);
  });

  it('refuses nonfinite current and nonpositive or nonfinite goals', () => {
    for (const current of [NaN, Infinity, -Infinity, '25', undefined]) {
      expect(() => parseContributionMeter({ current, goal: 100 })).toThrow(/current/);
    }
    for (const goal of [0, -1, NaN, Infinity, -Infinity, '100', undefined]) {
      expect(() => buildContributionMeterScene({ current: 0, goal })).toThrow(/goal/);
    }
  });

  it('denies all unknown fields including Bits pricing', () => {
    for (const key of ['bits', 'cost', 'unexpected']) {
      expect(() => buildContributionMeterScene({ ...CONTRIBUTION_METER_TEMPLATE, [key]: 1 }))
        .toThrow(/unknown/i);
    }
  });

  it('refuses remote and nonlocal meter images', () => {
    for (const image_path of ['http://host/a', 'https://host/a', 'data:image/png,x',
      'javascript:alert(1)', '//host/a', '/a', '../a', 'a/../b', 'C:/a', 'a\\b', '', undefined]) {
      expect(() => parseContributionMeter({ ...CONTRIBUTION_METER_TEMPLATE, image_path })).toThrow();
    }
  });
});
