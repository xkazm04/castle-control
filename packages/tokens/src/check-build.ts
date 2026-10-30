import { readFileSync } from 'node:fs';

function definitions(css: string): Set<string> {
  return new Set([...css.matchAll(/(?:^|[;{])\s*(--[\w-]+)\s*:/g)].map(match => match[1]).filter(name => name !== undefined));
}

// Build tooling only: this public subpath never imports the browser entry or CSS.
export function checkTokenDefinitions(css: string, label: string): number {
  const expected = definitions(readFileSync(new URL('./generated.css', import.meta.url), 'utf8'));
  if (!expected.size) throw new Error('Token build check refuses an empty generated token inventory');
  const actual = definitions(css);
  const missing = [...expected].filter(name => !actual.has(name));
  const found = expected.size - missing.length;
  console.log(`[${label} tokens] found ${found}/${expected.size} generated token definitions in initial CSS`);
  if (missing.length) throw new Error(`${label} CSS is missing generated token definitions: ${missing.join(', ')}`);
  return found;
}
