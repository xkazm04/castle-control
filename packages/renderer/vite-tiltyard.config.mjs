// A standalone page runtime keeps the established shared overlay budget intact.
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

export const tiltyardInputs = [
  './src/tiltyard-entry.ts', './src/tiltyard.ts', './vite-tiltyard.config.mjs',
  '../contract/src/generated/tiltyard-render-validation.ts',
  '../contract/src/generated/tiltyard-render-validators.mjs', '../contract/src/door.mjs',
];
const hash = createHash('sha256');
for (const path of tiltyardInputs) hash.update(readFileSync(new URL(path, import.meta.url), 'utf8').replaceAll('\r\n', '\n'));
const banner = `/*! Castle Control Tiltyard source SHA-256: ${hash.digest('hex')} */`;

export default {
  publicDir: false,
  plugins: [{ name: 'tiltyard-source-inventory', generateBundle(_options, bundle) {
    for (const output of Object.values(bundle)) {
      if (output.type === 'chunk') output.code = `${banner}\n${output.code}`;
    }
  } }],
  resolve: { alias: {
    '@castle-control/contract/tiltyard-render': fileURLToPath(new URL('../contract/src/generated/tiltyard-render-validation.ts', import.meta.url)),
  } },
  build: {
    outDir: fileURLToPath(new URL('../../apps/overlay', import.meta.url)),
    emptyOutDir: false, minify: true, sourcemap: false,
    rolldownOptions: {
      input: fileURLToPath(new URL('./src/tiltyard-entry.ts', import.meta.url)),
      output: { entryFileNames: 'tiltyard.js' },
    },
  },
};
