// Uses the already-installed desktop Vite CLI. No new workspace/dependency.
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const inputs = [
  './src/overlay-entry.ts', './src/overlay.ts', './src/bindings.ts',
  '../tokens/src/generated.css', './src/overlay.css',
  '../contract/src/generated/beacons-render-validation.ts',
  '../contract/src/generated/beacons-render-validators.mjs', '../contract/src/door.mjs',
  './vite-overlay.config.mjs',
];
const source_hash = createHash('sha256');
for (const path of inputs) source_hash.update(readFileSync(new URL(path, import.meta.url), 'utf8').replaceAll('\r\n', '\n'));
const banner = `/*! Castle Control overlay source SHA-256: ${source_hash.digest('hex')} */`;
export default {
  // This output has no public assets; never copy the desktop's public tree.
  publicDir: false,
  // Embed CSS because the native host intentionally serves only index + bundle.
  // Reading build inputs adds no runtime package or cross-package source import.
  define: { __CC_OVERLAY_STYLES__: JSON.stringify(
    readFileSync(new URL('../tokens/src/generated.css', import.meta.url), 'utf8')
      .replaceAll('\r\n', '\n') + '\n' + readFileSync(new URL('./src/overlay.css', import.meta.url), 'utf8').replaceAll('\r\n', '\n')) },
  plugins: [{ name: 'overlay-source-inventory', generateBundle(_options, bundle) {
    for (const output of Object.values(bundle)) {
      if (output.type === 'chunk') output.code = `${banner}\n${output.code}`;
    }
  } }],
  configLoader: 'native',
  resolve: { alias: {
    '@castle-control/contract/beacons-render': fileURLToPath(new URL('../contract/src/generated/beacons-render-validation.ts', import.meta.url)),
  } },
  build: {
    outDir: fileURLToPath(new URL('../../apps/overlay', import.meta.url)),
    emptyOutDir: false,
    minify: true,
    sourcemap: false,
    rolldownOptions: {
      input: fileURLToPath(new URL('./src/overlay-entry.ts', import.meta.url)),
      output: { entryFileNames: 'bundle.js' },
    },
  },
};
