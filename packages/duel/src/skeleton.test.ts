/// <reference types="node" />
import { expect, test } from 'vitest';
import * as engine from './index.js';
import * as ballots from './ballots.js';

test('both entries export nothing until WP2 and WP3', () => {
  expect(engine.startBracket(engine.SAMPLE.bracket.items.map((item) => item.id))?.seeds).toHaveLength(8);
  expect(ballots.parseBallotPage).toBeTypeOf('function');
});
