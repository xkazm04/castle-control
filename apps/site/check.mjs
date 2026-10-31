// Built-output acceptance check; run after Vite, from any working directory.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve, extname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = process.argv[2] === undefined
  ? fileURLToPath(new URL('./dist/', import.meta.url)) : resolve(process.argv[2]);
function walk(root) {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    assert.ok(!entry.isSymbolicLink(), `Unexpected link in build: ${entry.name}`);
    const path = resolve(root, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}
const inventory = walk(directory);
assert.ok(inventory.length > 0, 'Refused empty built inventory');
console.log(`[site built] walked ${inventory.length} files`);
const assets = inventory.filter((path) => ['.html', '.css', '.js'].includes(extname(path)));
assert.ok(assets.length > 0, 'Refused empty first-load inventory');
console.log(`[site first-load] walked ${assets.length} HTML/CSS/JS files`);
for (const path of inventory) assert.ok(!/\.(woff2?|ttf|otf|eot)$/i.test(path), `Font file: ${relative(directory, path)}`);
const content = assets.map((path) => readFileSync(path, 'utf8')).join('\n');
// SVG's XML namespace identifies an element vocabulary, including the shared
// grain data URI; it is not a remote destination and causes no network request.
const destinations = content.replaceAll('http://www.w3.org/2000/svg', 'svg-namespace');
for (const match of destinations.matchAll(/https?:\/\/[^\s"'<>`\\)]+/gi)) {
  const destination = new URL(match[0]);
  assert.ok(destination.protocol === 'https:' && destination.hostname === 'github.com'
    && /^\/xkazm04\/castle-control(?:\/|$)/.test(destination.pathname)
    && destination.username === '' && destination.password === '' && destination.port === '',
  `Unexpected remote destination: ${destination.origin}`);
}
assert.ok(!/@font-face|@import\s+url\s*\(/i.test(content), 'No web fonts or remote styles');
assert.ok(!/\b(?:fetch|XMLHttpRequest|WebSocket|eval)\s*\(|JSON\.parse\s*\(/.test(content), 'No data/network/eval connection');
const html = readFileSync(resolve(directory, 'index.html'), 'utf8');
assert.ok(!/\son\w+\s*=|<script(?![^>]*\bsrc=)/i.test(html), 'No inline scripts or handlers');
for (const match of html.matchAll(/(?:href|src)="([^"#]+)"/g)) {
  const path = match[1];
  if (path.startsWith('https://')) continue;
  assert.ok(path.startsWith('./'), `Build must use relative assets: ${path}`);
  assert.ok(statSync(resolve(directory, path)).isFile(), `Missing built asset ${path}`);
}
for (const label of ['Stylised illustration', 'drawn, not captured', 'Sample data', 'Fictional channel',
  'invented numbers', 'working name', 'Not affiliated with or endorsed by Twitch', 'In development',
  'check releases', 'signing status', 'Public Extension availability awaits Twitch approval and review']) {
  assert.ok(content.includes(label), `Missing honesty label: ${label}`);
}
const bytes = assets.reduce((sum, path) => sum + statSync(path).size, 0);
const budgetBytes = 180 * 1024;
console.log(`[site first-load] ${bytes} / ${budgetBytes} bytes (${(bytes / 1024).toFixed(2)} KiB)`);
if (bytes > budgetBytes) throw new Error(`Site first-load bytes ${bytes} exceed 180 KiB budget (${budgetBytes} bytes)`);
console.log('PASS: built inventory, relative assets, destinations, fonts, offline posture and honesty labels');
