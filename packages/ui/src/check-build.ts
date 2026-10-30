import { readFileSync, statSync } from 'node:fs';
import { checkTokenDefinitions } from '@castle-control/tokens/check-build';

const directory = new URL('../dist/', import.meta.url);
const html = readFileSync(new URL('index.html', directory), 'utf8');
const paths = new Set([...html.matchAll(/(?:src|href)="([^"]+\.(?:js|css))"/g)].map(match => match[1]));
if (paths.size === 0) throw new Error('Kit budget refuses an empty asset inventory');
let bytes = 0;
let css = '';
for (const path of paths) {
  if (!path || !/^\/assets\/[\w.-]+\.(js|css)$/.test(path)) throw new Error('Unexpected kit asset path');
  bytes += statSync(new URL(path.slice(1), directory)).size;
  if (path.endsWith('.css')) css += readFileSync(new URL(path.slice(1), directory), 'utf8');
}
checkTokenDefinitions(css, 'Kit');
const limit = 256 * 1024;
console.log(`[kit first-load budget] walked ${paths.size} files; ${bytes}/${limit} uncompressed JS+CSS bytes`);
if (bytes > limit) throw new Error('Kit first-load budget exceeded');
