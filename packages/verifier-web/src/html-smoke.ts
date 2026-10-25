import { readFileSync } from 'node:fs';
import { SourceTextModule, createContext } from 'node:vm';
import { strict as assert } from 'node:assert';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const code = /<script type="module">([\s\S]*?)<\/script>/.exec(html)?.[1];
if (!code) throw new Error('Missing embedded verifier');
type Element = { textContent: string; click?: () => void; addEventListener: (kind: string, fn: () => void) => void };
const elements = new Map<string, Element>();
for (const selector of ['output', 'pre', '#fallback', '#beacon']) {
  const element: Element = {
    textContent: '', addEventListener(kind, fn) {
      if (kind !== 'click') throw new Error('Unexpected event');
      element.click = fn;
    },
  };
  elements.set(selector, element);
}
const context = createContext({ crypto: globalThis.crypto, TextEncoder, document: { querySelector: (s: string) => elements.get(s) } });
const module = new SourceTextModule(code, { context });
await module.link(() => { throw new Error('HTML must be self-contained'); });
await module.evaluate();
for (const [selector, expected] of [['#fallback', 'VERIFIED · streamer-controlled'], ['#beacon', 'UNVERIFIED · drand-quicknet']]) {
  if (!selector || !expected) throw new Error('Smoke case');
  elements.get(selector)?.click?.();
  const deadline = Date.now() + 5000;
  while (elements.get('output')?.textContent === 'Checking seal and cast…' && Date.now() < deadline) {
    await new Promise<void>((resolve) => setTimeout(resolve, 5));
  }
  assert.equal(elements.get('output')?.textContent, expected);
  assert.match(elements.get('pre')?.textContent ?? '', /Recomputed winners: simulated_/);
}
console.log('self_contained_html_runs_both_examples: PASS');
