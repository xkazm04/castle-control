import { readFileSync, writeFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import fixture from './simulated-writs.json' with { type: 'json' };

// A tiny build step, using only Node. No code or assets load from the network.
const sources = ['schema.ts', 'index.ts', 'page.ts'].map((name) => {
  const source = readFileSync(new URL(name, import.meta.url), 'utf8')
    .replace(/^import (?:type )?[^\n]+ from '\.\/[^']+';\r?\n/gm, '');
  return stripTypeScriptTypes(source).replace(/^export /gm, '');
});
const samples = fixture.cases.slice(0, 2).map((item) => item.writ);
const literal = JSON.stringify(samples).replaceAll('<', '\\u003c');
const html = `<!doctype html>
<html lang="en"><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; connect-src 'none'; base-uri 'none'; form-action 'none'">
<title>Castle Control · Draw proof verifier</title>
<h1>Draw proof verifier</h1>
<p>Offline preparation · simulated examples only</p>
<p>Compare the seal against the announcement made before the round or reveal.</p>
<p><strong>UNVERIFIED:</strong> Beacon authentication requires a separately trusted quicknet key and the pending browser BLS dependency.</p>
<p>File import unavailable: the public contract JSON parsing door has not been exported. This file demonstrates the seal/cast core using embedded, labelled-simulated writs.</p>
<button id="fallback" type="button">Verify simulated streamer-controlled writ</button>
<button id="beacon" type="button">Recompute simulated beacon writ</button>
<p><output aria-live="polite">Choose a simulated writ</output></p><pre></pre>
<script type="module">
const simulatedSamples = ${literal};
${sources.join('\n')}
</script></html>
`;
writeFileSync(new URL('../index.html', import.meta.url), html);
