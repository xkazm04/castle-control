import { verifyDecodedWrit } from './index.ts';

type Sample = Readonly<{ writ: unknown; chain: unknown; label: string }>;
declare const bundledSamples: readonly Sample[];

const output = document.querySelector('output');
const details = document.querySelector('pre');
if (!output || !details) throw new Error('Missing verifier controls');

async function show(sample: Sample | undefined): Promise<void> {
  if (!output || !details) throw new Error('Missing verifier output');
  output.textContent = 'Checking seal and cast…';
  details.textContent = '';
  try {
    if (!sample) throw new Error('Missing bundled writ');
    const result = await verifyDecodedWrit(sample.writ, sample.chain);
    output.textContent = `${result.status.toUpperCase()} · ${result.label}`;
    details.textContent = `${sample.label}\n${result.reason}\n\nSeal: ${result.seal}\nRecomputed winners: ${result.computed_winners.join(', ')}`;
  } catch (error) {
    output.textContent = 'REJECTED';
    details.textContent = error instanceof Error ? error.message : 'Verification failed';
  }
}
const controls = [['#fallback', 1], ['#beacon', 0], ['#round-1', 2], ['#round-2', 3], ['#round-1000', 4]] as const;
for (const [selector, index] of controls) {
  const button = document.querySelector(selector);
  if (!button) throw new Error('Missing verifier control');
  button.addEventListener('click', () => { void show(bundledSamples[index]); });
}
