/// <reference types="node" />
import { expect, test } from 'vitest';
import * as engine from './index.js';
import * as ballots from './ballots.js';

test('both public entries expose the engine and the ballot door', () => {
  expect(engine.startBracket(engine.SAMPLE.bracket.items.map((item) => item.id))?.seeds).toHaveLength(8);
  expect(ballots.parseBallotPage).toBeTypeOf('function');
});
