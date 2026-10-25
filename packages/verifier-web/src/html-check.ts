import { Script, createContext } from 'node:vm';
import { strict as assert } from 'node:assert';
import publicWrits from './public-writs.json' with { type: 'json' };

type Element = { textContent: string; click?: () => void; addEventListener: (kind: string, fn: () => void) => void };
function load(source: string): Map<string, Element> {
  const elements = new Map<string, Element>();
  for (const selector of ['output', 'pre', '#fallback', '#beacon', '#round-1', '#round-2', '#round-1000']) {
    const element: Element = {
      textContent: '', addEventListener(kind, fn) {
        if (kind !== 'click') throw new Error('Unexpected event');
        element.click = fn;
      },
    };
    elements.set(selector, element);
  }
  const context = createContext({ crypto: globalThis.crypto, TextEncoder,
    document: { querySelector: (s: string) => elements.get(s) } }, { codeGeneration: { strings: false, wasm: false } });
  // The build is one IIFE with no runtime imports. No eval or child process is needed.
  new Script(source).runInContext(context, { timeout: 5000 });
  return elements;
}
async function click(elements: Map<string, Element>, selector: string): Promise<void> {
  const control = elements.get(selector);
  if (!control?.click) throw new Error('Missing click control');
  control.click();
  const deadline = Date.now() + 5000;
  while (elements.get('output')?.textContent === 'Checking seal and cast…' && Date.now() < deadline) {
    await new Promise<void>((resolve) => setTimeout(resolve, 5));
  }
}

export async function checkHtml(html: string): Promise<void> {
  const code = /<script type="module">([\s\S]*?)<\/script>/.exec(html)?.[1];
  if (!code) throw new Error('Missing embedded verifier');
  const elements = load(code);
  for (const [selector, expected] of [
    ['#fallback', 'VERIFIED · streamer-controlled'], ['#beacon', 'VERIFIED · drand-quicknet'],
    ['#round-1', 'VERIFIED · drand-quicknet'], ['#round-2', 'VERIFIED · drand-quicknet'], ['#round-1000', 'VERIFIED · drand-quicknet'],
  ]) {
    if (!selector || !expected) throw new Error('Smoke case');
    await click(elements, selector);
    assert.equal(elements.get('output')?.textContent, expected);
    assert.match(elements.get('pre')?.textContent ?? '', /Recomputed winners: simulated_/);
  }
  const first = publicWrits.cases[0]?.writ.proof;
  const second = publicWrits.cases[1]?.writ.proof;
  if (!first || !second) throw new Error('Missing public signatures');
  const altered = code.replace(first.signature, second.signature).replace(first.randomness, second.randomness);
  assert.notEqual(altered, code);
  const tampered = load(altered);
  await click(tampered, '#round-1');
  assert.equal(tampered.get('output')?.textContent, 'REJECTED');
  assert.match(tampered.get('pre')?.textContent ?? '', /BLS signature/);
}
