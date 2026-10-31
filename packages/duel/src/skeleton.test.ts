/// <reference types="node" />
import { expect, test } from 'vitest';
import * as engine from './index.js';
import * as ballots from './ballots.js';

test('both entries export nothing until WP2 and WP3', () => {
  expect(Object.keys(engine)).toEqual([]);
  expect(Object.keys(ballots)).toEqual([]);
});
