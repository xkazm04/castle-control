import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { Vite } from 'vitest/node';
import fixture from './simulated-writs.json' with { type: 'json' };
import publicWrits from './public-writs.json' with { type: 'json' };
import { sourceFingerprint } from './artifact.ts';

// Resolve the existing Vitest toolchain's Vite peer and use its public build API.
// No install, server, network, eval, secondary artifact or runtime import.
const toolchain = createRequire(import.meta.resolve('vitest/node'));
const vite: typeof Vite = await import(pathToFileURL(toolchain.resolve('vite')).href);
const built = await vite.build({
  configFile: false, root: fileURLToPath(new URL('..', import.meta.url)), publicDir: false, logLevel: 'silent',
  build: {
    write: false, minify: true, sourcemap: false, target: 'es2022', reportCompressedSize: false,
    lib: { entry: fileURLToPath(new URL('page.ts', import.meta.url)), name: 'CastleControlVerifier', formats: ['iife'] },
  },
});
const outputs = Array.isArray(built) ? built : [built];
const chunks = outputs.flatMap((result) => 'output' in result ? result.output : []);
const chunk = chunks[0];
if (chunks.length !== 1 || !chunk || chunk.type !== 'chunk' || chunk.imports.length || chunk.dynamicImports.length) {
  throw new Error('Expected exactly one self-contained verifier bundle');
}
const nobleDirectory = dirname(createRequire(import.meta.url).resolve('@noble/curves/bls12-381'));
const hashesDirectory = dirname(createRequire(join(nobleDirectory, 'package.json')).resolve('@noble/hashes/sha2.js'));
const licenses = [nobleDirectory, hashesDirectory].map((directory) => readFileSync(join(directory, 'LICENSE'), 'utf8')).join('\n');
const samples = [
  ...fixture.cases.slice(0, 2).map((item) => ({ writ: item.writ, chain: fixture.chain, label: 'Simulated draw and simulated beacon key' })),
  ...publicWrits.cases.map((item) => ({ writ: item.writ, chain: publicWrits.chain, label: `Simulated draw; official quicknet round ${item.round}` })),
];
const literal = JSON.stringify(samples).replaceAll('<', '\\u003c');
const html = `<!doctype html>
<html lang="en"><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; connect-src 'none'; base-uri 'none'; form-action 'none'">
<title>Castle Control · Draw proof verifier</title>
<!-- source-sha256:${sourceFingerprint()} -->
<h1>Draw proof verifier</h1>
<p>Offline proof checks · entry pools are simulated; the three official quicknet beacons are real public signatures.</p>
<p>Compare the seal against the announcement made before the round or reveal.</p>
<p>Beacon authentication uses a separately bundled trust anchor and local BLS verification. Without an anchor the result stays UNVERIFIED.</p>
<p>File import unavailable by Director decision. This file verifies bundled fixtures and generated writs only; no second JSON decoding door is included.</p>
<button id="fallback" type="button">Verify simulated streamer-controlled writ</button>
<button id="beacon" type="button">Verify simulated beacon writ</button>
<button id="round-1" type="button">Verify official quicknet round 1</button>
<button id="round-2" type="button">Verify official quicknet round 2</button>
<button id="round-1000" type="button">Verify official quicknet round 1000</button>
<p><output aria-live="polite">Choose a bundled writ</output></p><pre></pre>
<!-- Bundled @noble/curves 1.9.7 and @noble/hashes 1.8.0 notices:
${licenses} -->
<script type="module">
const bundledSamples = ${literal};
${chunk.code.replaceAll('</script', '<\\/script')}
</script></html>
`;
writeFileSync(new URL('../index.html', import.meta.url), html);
