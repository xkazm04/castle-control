import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import * as root from './index.js';
import * as steward from './generated/steward-validation.js';
import { parseJson } from './door.mjs';

// Generated simulated fixtures shared with Rust; no recorded chat or live calls.
const input: unknown = parseJson(readFileSync(new URL('../../../crates/cc-types/tests/fixtures/steward.json', import.meta.url), 'utf8'));
if (!Array.isArray(input) || !input.length) throw new Error('Expected simulated writ fixtures');
const writs = input.map((value: unknown) => root.parseWrit(JSON.stringify(value)));

test('Steward subpath exposes only three method handles and the writ event validator', () => {
  expect(import.meta.resolve('@castle-control/contract')).toBe(new URL('./index.ts', import.meta.url).href);
  expect(import.meta.resolve('@castle-control/contract/steward'))
    .toBe(new URL('./generated/steward-validation.ts', import.meta.url).href);
  expect(Object.keys(steward).sort()).toEqual([
    'stewardAsk', 'stewardEventPayload', 'stewardWritSeal', 'stewardWritTear',
  ]);
});

const methods = ['stewardAsk', 'stewardWritSeal', 'stewardWritTear'] as const;
for (const name of methods) {
  test(`${name} root and lazy params/results accept and reject the same simulated fixtures`, () => {
    const eager = root[name], lazy = steward[name];
    expect(lazy.method).toBe(eager.method);
    expect(lazy.params).not.toBe(eager.params);
    expect(lazy.result).not.toBe(eager.result);
    for (const writ of writs) {
      const params = name === 'stewardAsk'
        ? { chamber: writ.chamber, prompt: 'Simulated Steward request' } : { writ_id: writ.writ_id };
      const result = { writ };
      for (const [key, positive] of [['params', params], ['result', result]] as const) {
        for (const value of [positive, { ...positive, extra: true }, null, [], '', 0, {}]) {
          expect(lazy[key](value)).toBe(eager[key](value));
        }
        expect(lazy[key](positive)).toBe(true);
        expect(lazy[key]({ ...positive, extra: true })).toBe(false);
      }
    }
  });
}

test('Steward writ event has independent root/subpath validators with the same strict schema', () => {
  const eager = root.stewardEventPayload, lazy = steward.stewardEventPayload;
  expect(lazy).not.toBe(eager);
  for (const writ of writs) {
    const positive = { kind: 'steward.writ', payload: writ };
    for (const value of [positive, { ...positive, extra: true }, { ...positive, kind: 'unknown' },
      { ...positive, payload: { ...writ, extra: true } }, { ...positive, payload: null }, null, {}]) {
      expect(lazy(value)).toBe(eager(value));
    }
    expect(lazy(positive)).toBe(true);
    expect(lazy({ ...positive, extra: true })).toBe(false);
    expect(lazy({ ...positive, payload: { ...writ, extra: true } })).toBe(false);
  }
});
