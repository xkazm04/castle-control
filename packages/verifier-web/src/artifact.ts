import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

/** Reproducible source stamp for the single-file artifact, independent of checkout line endings. */
export function sourceFingerprint(): string {
  const files = ['artifact.ts', 'generate.ts', 'page.ts', 'index.ts', 'schema.ts', 'crypto.ts', 'beacon.ts',
    'simulated-writs.json', 'public-writs.json', '../package.json',
    '../../contract/src/door.mjs', '../../contract/src/door.d.mts', '../../contract/package.json'];
  const hash = createHash('sha256');
  for (const file of files) {
    hash.update(file + '\0');
    hash.update(readFileSync(new URL(file, import.meta.url), 'utf8').replaceAll('\r\n', '\n'));
    hash.update('\0');
  }
  return hash.digest('hex');
}
