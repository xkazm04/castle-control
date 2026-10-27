/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { expect, it } from 'vitest';

it('ships a local bundle rebuilt from this renderer and the lazy contract door', () => {
  const inputs = [
    './overlay-entry.ts', './overlay.ts', './bindings.ts',
    '../../contract/src/generated/beacons-render-validation.ts',
    '../../contract/src/generated/beacons-render-validators.mjs', '../../contract/src/door.mjs',
    '../vite-overlay.config.mjs',
  ];
  const hash = createHash('sha256');
  for (const path of inputs) hash.update(readFileSync(new URL(path, import.meta.url), 'utf8').replaceAll('\r\n', '\n'));
  const bundle = readFileSync(new URL('../../../apps/overlay/bundle.js', import.meta.url), 'utf8');
  expect(bundle).toContain(`Castle Control overlay source SHA-256: ${hash.digest('hex')}`);
  expect(bundle).toContain('beacons.render.snapshot');
  expect(bundle).not.toMatch(/\beval\s*\(|new\s+Function\s*\(|\bimport\s*\(/);
  const shell = readFileSync(new URL('../../../apps/overlay/index.html', import.meta.url), 'utf8');
  expect(shell).toContain('src="/bundle.js"');
  expect(shell).not.toContain('http:');
  expect(shell).not.toContain('https:');
});
