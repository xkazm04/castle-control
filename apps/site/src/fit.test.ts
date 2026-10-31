import { expect, test } from 'vitest';
import { fit } from './fit.ts';

test.each([[1280, 800, 8 / 9], [1440, 900, 1], [2560, 1440, 1.6], [390, 844, 390 / 1440]])('fit at %sx%s preserves the complete stage and continues below 1280', (width, height, scale) => {
  expect(fit(width, height)).toBeCloseTo(scale, 12);
  expect(1440 * fit(width, height)).toBeLessThanOrEqual(width);
  expect(900 * fit(width, height)).toBeLessThanOrEqual(height);
});
