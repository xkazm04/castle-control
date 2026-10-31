import { readFileSync, statSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { checkTokenDefinitions } from '@castle-control/tokens/check-build';

const directory = process.argv[2] === undefined
  ? new URL('../dist/', import.meta.url) : pathToFileURL(resolve(process.argv[2]) + sep);
const html = readFileSync(new URL('index.html', directory), 'utf8');
const paths = new Set([...html.matchAll(/(?:src|href)="([^"]+\.(?:js|css))"/g)].map(match => match[1]));
if (!paths.size) throw new Error('Desktop budget refuses empty assets');
let bytes = 0;
let css = '';
for (const path of paths) {
  if (!path || !/^\/assets\/[\w.-]+\.(js|css)$/.test(path)) throw new Error('Unexpected desktop asset');
  bytes += statSync(new URL(path.slice(1), directory)).size;
  if (path.endsWith('.css')) css += readFileSync(new URL(path.slice(1), directory), 'utf8');
}
checkTokenDefinitions(css, 'Desktop');
// Includes React DOM and the contract's generated, standalone schema validators.
const limit = 384 * 1024;
console.log(`[desktop first-load budget, all four routes] walked ${paths.size} files; ${bytes}/${limit} uncompressed JS+CSS bytes`);
if (bytes > limit) throw new Error('Desktop first-load budget exceeded');
