import { expect, test } from 'vitest';
import * as skeleton from './index.js';

test('foundation exports no contract identifiers', () => {
  expect(Object.keys(skeleton)).toEqual([]);
});
