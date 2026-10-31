// A standalone page runtime keeps the established shared overlay budget intact.
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

export const voteBarInputs = [
  './src/vote-bar-entry.ts', './src/vote-bar.ts', './vite-vote-bar.config.mjs',
  '../contract/src/generated/vote-bar-validation.ts',
  '../contract/src/generated/vote-bar-validators.mjs', '../contract/src/door.mjs',
];
const hash = createHash('sha256');
for (const path of voteBarInputs) hash.update(readFileSync(new URL(path, import.meta.url), 'utf8').replaceAll('\r\n', '\n'));
const banner = `/*! Castle Control vote bar source SHA-256: ${hash.digest('hex')} */`;

export default {
  publicDir: false,
  plugins: [{ name: 'vote-bar-source-inventory', generateBundle(_options, bundle) {
    for (const output of Object.values(bundle)) {
      if (output.type === 'chunk') output.code = `${banner}\n${output.code}`;
    }
  } }],
  resolve: { alias: {
    '@castle-control/contract/vote-bar': fileURLToPath(new URL('../contract/src/generated/vote-bar-validation.ts', import.meta.url)),
  } },
  build: {
    outDir: fileURLToPath(new URL('../../apps/overlay', import.meta.url)),
    emptyOutDir: false, minify: true, sourcemap: false,
    rolldownOptions: {
      input: fileURLToPath(new URL('./src/vote-bar-entry.ts', import.meta.url)),
      output: { entryFileNames: 'vote-bar.js' },
    },
  },
};
