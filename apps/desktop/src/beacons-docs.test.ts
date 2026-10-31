import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { beaconsCopy } from './beacons-copy.js';

const guide = readFileSync(new URL('../../../docs/guide/beacons.md', import.meta.url), 'utf8')
  .replace(/\s+/g, ' ');
const preview = readFileSync(new URL('../../../crates/cc-beacons/src/preview.rs', import.meta.url), 'utf8');

test('Beacons runbook names the shared gift test-fire button', () => {
  expect(guide).toContain(`**${beaconsCopy.fire_gifts}**`);
});

test.each([
  { constant: 'PREVIEW_HOLD_S', seconds: 30, claim: 'a no-decay visual holds for' },
  { constant: 'PREVIEW_MAX_S', seconds: 600, claim: 'every test fire ends by' },
])('Beacons runbook matches $constant ($seconds seconds)', ({ constant, seconds, claim }) => {
  const declared = preview.match(new RegExp(`pub const ${constant}: u64 = (\\d+);`));
  expect(declared?.[1], `${constant} in preview.rs`).toBe(String(seconds));
  expect(guide).toContain(`${claim} ${declared?.[1]} s`);
});
