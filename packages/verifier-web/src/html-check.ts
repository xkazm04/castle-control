import { Script, createContext } from 'node:vm';
import { parseJson } from '@castle-control/contract/door';
import { strict as assert } from 'node:assert';
import publicWrits from './public-writs.json' with { type: 'json' };
import fixture from './simulated-writs.json' with { type: 'json' };

type WritFile = { size: number; text: () => Promise<string> };
type Element = {
  textContent: string; value?: string; files?: readonly WritFile[]; click?: () => void; change?: () => void;
  addEventListener: (kind: string, fn: () => void) => void;
};
function load(source: string): Map<string, Element> {
  const elements = new Map<string, Element>();
  for (const selector of ['output', 'pre', '#writ-file', '#fallback', '#beacon', '#round-1', '#round-2', '#round-1000']) {
    const element: Element = {
      textContent: '', addEventListener(kind, fn) {
        if (kind !== 'click' && kind !== 'change') throw new Error('Unexpected event');
        element[kind] = fn;
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
async function settled(elements: Map<string, Element>): Promise<void> {
  const deadline = Date.now() + 5000;
  while (elements.get('output')?.textContent === 'Checking seal and cast…' && Date.now() < deadline) {
    await new Promise<void>((resolve) => setTimeout(resolve, 5));
  }
  assert.notEqual(elements.get('output')?.textContent, 'Checking seal and cast…', 'Verification did not settle');
}
async function click(elements: Map<string, Element>, selector: string): Promise<void> {
  const control = elements.get(selector);
  if (!control?.click) throw new Error('Missing click control');
  control.click();
  await settled(elements);
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

/** Exercise the file control in the actual offline bundle, without a DOM dependency or network. */
export async function checkFileImports(html: string): Promise<void> {
  const code = /<script type="module">([\s\S]*?)<\/script>/.exec(html)?.[1];
  if (!code) throw new Error('Missing embedded verifier');
  const elements = load(code);
  const input = elements.get('#writ-file');
  if (!input?.change) throw new Error('Missing file import control');
  const fallback = fixture.cases[1]?.writ;
  const official = publicWrits.cases[0]?.writ;
  const otherProof = publicWrits.cases[1]?.writ.proof;
  if (!fallback || !official || !otherProof) throw new Error('Missing simulated draw cases');
  async function choose(text: string, size = new TextEncoder().encode(text).byteLength): Promise<void> {
    if (!input?.change) throw new Error('Missing file import control');
    input.files = [{ size, text: async () => text }];
    input.value = 'C:\\fakepath\\writ.json';
    input.change();
    // A browser fires no change event when the same path is chosen again unless the value is cleared.
    assert.equal(input.value, '', 'The file control must reset so the same file can be re-selected');
    await settled(elements);
  }
  for (const [writ, expected] of [[fallback, 'streamer-controlled'], [official, 'drand-quicknet']] as const) {
    await choose(JSON.stringify(writ, null, 2));
    assert.equal(elements.get('output')?.textContent, `VERIFIED · ${expected}`);
    assert.match(elements.get('pre')?.textContent ?? '', /Imported writ/);
  }
  // Each failure follows a successful verification: a stale pass must be cleared.
  for (const text of ['{', 'null', '{}', JSON.stringify({ ...fallback, extra: true }),
    JSON.stringify({ ...fallback, seal: '00'.repeat(32) }), JSON.stringify({ ...fallback, winners: ['simulated_intruder'] }),
    JSON.stringify({ ...official, proof: otherProof })]) {
    await choose(JSON.stringify(fallback));
    assert.equal(elements.get('output')?.textContent, 'VERIFIED · streamer-controlled');
    await choose(text);
    assert.equal(elements.get('output')?.textContent, 'REJECTED');
    assert.ok(elements.get('pre')?.textContent);
  }
  let reads = 0;
  input.files = [{ size: 2 * 1024 * 1024 + 1, text: async () => { reads++; return JSON.stringify(fallback); } }];
  input.change();
  await settled(elements);
  assert.equal(reads, 0, 'Oversized files must be rejected before reading');
  assert.equal(elements.get('output')?.textContent, 'REJECTED');
  assert.match(elements.get('pre')?.textContent ?? '', /2 MiB/);
  await choose(JSON.stringify(fallback).padEnd(2 * 1024 * 1024, ' '));
  assert.equal(elements.get('output')?.textContent, 'VERIFIED · streamer-controlled');
  await choose('"' + 'é'.repeat(1024 * 1024) + '"', 1);
  assert.equal(elements.get('output')?.textContent, 'REJECTED');
  assert.match(elements.get('pre')?.textContent ?? '', /byte limit/);
  input.files = [{ size: 1, text: async () => { throw new Error('Simulated unreadable file'); } }];
  input.change();
  await settled(elements);
  assert.equal(elements.get('output')?.textContent, 'REJECTED');
  input.files = [];
  input.change();
  await settled(elements);
  assert.equal(elements.get('output')?.textContent, 'REJECTED');

  // A slow, previously selected valid file cannot replace a newer malformed-file failure.
  let release: ((text: string) => void) | undefined;
  const delayed = new Promise<string>((resolve) => { release = resolve; });
  input.files = [{ size: 1, text: () => delayed }];
  input.change();
  await choose('{');
  if (!release) throw new Error('Missing simulated read completion');
  release(JSON.stringify(fallback));
  await new Promise<void>((resolve) => setTimeout(resolve, 100));
  assert.equal(elements.get('output')?.textContent, 'REJECTED');
}

/** Put a simulated-chain sample where the official one used to sit. */
function swapped(samples: unknown[]): unknown[] {
  const copy = [...samples];
  [copy[0], copy[2]] = [copy[2], copy[0]];
  return copy;
}

/** An imported writ must verify against the named official chain, not whichever sample sits at a magic index. */
export async function checkImportAnchorIndependence(html: string): Promise<void> {
  const code = /<script type="module">([\s\S]*?)<\/script>/.exec(html)?.[1];
  const match = code ? /const bundledSamples = (\[[\s\S]*?\]);\n/.exec(code) : null;
  if (!code || !match?.[1]) throw new Error('Missing embedded verifier samples');
  const reordered = code.replace(match[1], JSON.stringify(swapped(parseJson(match[1]) as unknown[])));
  assert.notEqual(reordered, code);
  const elements = load(reordered);
  const input = elements.get('#writ-file');
  const official = publicWrits.cases[0]?.writ;
  if (!input?.change || !official) throw new Error('Missing import control');
  const text = JSON.stringify(official);
  input.files = [{ size: new TextEncoder().encode(text).byteLength, text: async () => text }];
  input.change();
  await settled(elements);
  assert.equal(elements.get('output')?.textContent, 'VERIFIED \u00b7 drand-quicknet');
}