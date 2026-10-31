/// <reference types="node" />
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
// @ts-expect-error Build configuration is native JavaScript, outside the TS product tree.
import { voteBarInputs } from '../vite-vote-bar.config.mjs';

test('dedicated vote-bar runtime is current, self-contained and under 16 KiB', () => {
  const hash = createHash('sha256');
  for (const file of voteBarInputs as readonly string[]) {
    hash.update(readFileSync(new URL(file, new URL('../vite-vote-bar.config.mjs', import.meta.url)), 'utf8').replaceAll('\r\n', '\n'));
  }
  const bytes = readFileSync(new URL('../../../apps/overlay/vote-bar.js', import.meta.url));
  expect(bytes.byteLength).toBeLessThanOrEqual(16_384);
  const source = bytes.toString('utf8');
  expect(source).toContain(`Castle Control vote bar source SHA-256: ${hash.digest('hex')}`);
  expect(source).toContain('gatehouse.render.snapshot');
  expect(source).not.toMatch(/\beval\s*\(|new\s+Function\s*\(|\bimport\s*\(/);
  expect(source).not.toContain('beacons.render.snapshot');
  expect(source).not.toContain('cc-cast');
});
