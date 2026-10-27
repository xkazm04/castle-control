// Static acceptance checks, runnable from any directory with Node alone.
import assert from 'node:assert/strict';
import { readFileSync, statSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const directory = fileURLToPath(new URL('.', import.meta.url));
const read = (name) => readFileSync(resolve(directory, name), 'utf8');
const html = read('index.html');
const css = read('site.css');
const js = read('site.js');
const art = read('art.svg');
const tokens = read('../../packages/tokens/src/generated.css');
const inventory = readdirSync(directory).filter((name) => /\.(html|css|js|mjs|svg)$/.test(name));
assert.ok(inventory.length > 0);
console.log(`[site static] walked ${inventory.length} files`);
for (const file of inventory) {
  const text = read(file);
  assert.ok(text.trimEnd().split('\n').length <= 400, `${file}: 400-line cap`);
}
assert.ok(!readdirSync(directory).includes('package.json'), 'Static site must not become a workspace member');
assert.ok(html.includes('href="../../packages/tokens/src/generated.css"'), 'Use shared tokens directly');
assert.ok(tokens.includes('--paper:#F4F0E6') && tokens.includes('--gules:#E4472E'));
assert.ok(!/#(?:[0-9a-f]{3}){1,2}\b|\b\d+(?:\.\d+)?px\b/i.test(css), 'No raw colors or px in component styles');
assert.ok(!/https?:|@import|@font-face/.test(css), 'No remote fonts or CSS');
assert.ok(!/\b(?:fetch|XMLHttpRequest|WebSocket|eval)\s*\(|JSON\.parse/.test(js), 'No app, data, or network connection');
assert.ok(!/[\u2014?]/.test(html), 'No em dash or encoding replacement in copy');
assert.ok(!/\son\w+=|<script(?![^>]*\bsrc=)/i.test(html), 'No inline handlers or scripts');
const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
assert.equal(new Set(ids).size, ids.length, 'Unique HTML ids');
const artIds = [...art.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
assert.equal(new Set(artIds).size, artIds.length, 'Unique SVG ids');
for (const [, path, fragment] of html.matchAll(/(?:href|src)="([^"#]*)(?:#([^"]*))?"/g)) {
  if (path.startsWith('https://')) {
    assert.ok(path.startsWith('https://github.com/xkazm04/castle-control'), `Unexpected external destination: ${path}`);
  } else if (path) {
    assert.ok(statSync(resolve(directory, path)).isFile(), `Missing asset ${path}`);
    if (fragment) assert.ok(artIds.includes(fragment), `Missing SVG symbol: ${fragment}`);
  } else if (fragment) {
    const root = fragment.split('/')[0];
    assert.ok(ids.includes(root), `Missing internal link ${root}`);
  }
}
for (const symbol of ['stone','lots','gate','beacons','map','wordmark','wordmark-stacked']) {
  assert.ok(artIds.includes(symbol), `Artwork: ${symbol}`);
}
assert.ok(!/<mask|wmMask/.test(art), 'Wordmark must preserve its complete lower strokes');
assert.ok(art.includes('M0 0H24V76H50V100H0Z'), 'Original L design retains its horizontal foot');
const labels = ['Stylised illustration', 'drawn rather than captured', 'Sample data', 'fictional channel',
  'invented numbers', 'working name', 'Not affiliated with or endorsed by Twitch', 'In development',
  'signing status', 'Twitch policy approval and review'];
for (const label of labels) assert.ok(html.includes(label), `Missing honesty label: ${label}`);
const assets = ['index.html','site.css','site.js','art.svg','../../packages/tokens/src/generated.css'];
const bytes = assets.reduce((sum, name) => sum + statSync(resolve(directory, name)).size, 0);
assert.ok(bytes <= 180 * 1024, `First-load bytes ${bytes} exceed 180 KiB budget`);
assert.ok(css.includes('prefers-reduced-motion:reduce') && css.includes('animation:none !important'));
assert.ok(css.includes('font-size:var(--text-label)'), 'Shared label floor');
console.log(`PASS: links, assets, tokens, copy, wordmark, policy labels; first-load ${bytes} / 184320 bytes`);
