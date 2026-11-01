/// <reference types="node" />
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
// @ts-expect-error Build configuration is native JavaScript, outside the TS product tree.
import { tiltyardInputs } from '../vite-tiltyard.config.mjs';

test('dedicated tiltyard runtime is current, self-contained and under 24 KiB', () => {
  const hash = createHash('sha256');
  for (const file of tiltyardInputs as readonly string[]) {
    hash.update(readFileSync(new URL(file, new URL('../vite-tiltyard.config.mjs', import.meta.url)), 'utf8').replaceAll('\r\n', '\n'));
  }
  const bytes = readFileSync(new URL('../../../apps/overlay/tiltyard.js', import.meta.url));
  expect(bytes.byteLength).toBeLessThanOrEqual(24_576);
  const source = bytes.toString('utf8');
  expect(source).toContain(`Castle Control Tiltyard source SHA-256: ${hash.digest('hex')}`);
  expect(source).toContain('tiltyard.render.snapshot');
  expect(source).not.toMatch(/\beval\s*\(|new\s+Function\s*\(|\bimport\s*\(/);
  expect(source).not.toContain('beacons.render.snapshot');
  expect(source).not.toContain('cc-cast');
});
