import { parseJson } from '@castle-control/contract/door';
import { verifyDecodedWrit } from './index.ts';

type Sample = Readonly<{ writ: unknown; chain: unknown; label: string }>;
declare const bundledSamples: readonly Sample[];

const output = document.querySelector('output');
const details = document.querySelector('pre');
const fileInput = document.querySelector<HTMLInputElement>('#writ-file');
if (!output || !details || !fileInput) throw new Error('Missing verifier controls');
const max_bytes = 2 * 1024 * 1024;
let selection = 0;

async function show(load: () => Promise<Sample | undefined>): Promise<void> {
  if (!output || !details) throw new Error('Missing verifier output');
  const current = ++selection;
  output.textContent = 'Checking seal and cast…';
  details.textContent = '';
  try {
    const sample = await load();
    if (!sample) throw new Error('Missing bundled writ');
    // verifyDecodedWrit enters schema.ts before recomputing any seal or cast.
    const result = await verifyDecodedWrit(sample.writ, sample.chain);
    if (current !== selection) return;
    output.textContent = `${result.status.toUpperCase()} · ${result.label}`;
    details.textContent = `${sample.label}\n${result.reason}\n\nSeal: ${result.seal}\nRecomputed winners: ${result.computed_winners.join(', ')}`;
  } catch (error) {
    if (current !== selection) return;
    output.textContent = 'REJECTED';
    details.textContent = error instanceof Error ? error.message : 'Verification failed';
  }
}
const controls = [['#fallback', 1], ['#beacon', 0], ['#round-1', 2], ['#round-2', 3], ['#round-1000', 4]] as const;
for (const [selector, index] of controls) {
  const button = document.querySelector(selector);
  if (!button) throw new Error('Missing verifier control');
  button.addEventListener('click', () => { void show(async () => bundledSamples[index]); });
}
fileInput.addEventListener('change', () => {
  const file = fileInput.files?.[0];
  void show(async () => {
    if (!file) throw new Error('Choose a writ file');
    if (file.size > max_bytes) throw new Error('Writ file exceeds the 2 MiB limit');
    const writ = parseJson(await file.text(), { max_bytes });
    // Use the independently bundled official quicknet anchor, never data from the file.
    return { writ, chain: bundledSamples[2]?.chain, label: 'Imported writ' };
  });
});
