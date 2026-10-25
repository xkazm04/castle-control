import { verifyDecodedWrit } from './index.ts';

declare const simulatedSamples: readonly unknown[];

const output = document.querySelector('output');
const details = document.querySelector('pre');
const fallback = document.querySelector('#fallback');
const beacon = document.querySelector('#beacon');
if (!output || !details || !fallback || !beacon) throw new Error('Missing verifier controls');

async function show(value: unknown): Promise<void> {
  if (!output || !details) throw new Error('Missing verifier output');
  output.textContent = 'Checking seal and cast…';
  details.textContent = '';
  try {
    const result = await verifyDecodedWrit(value);
    output.textContent = `${result.status.toUpperCase()} · ${result.label}`;
    details.textContent = `${result.reason}\n\nSeal: ${result.seal}\nRecomputed winners: ${result.computed_winners.join(', ')}`;
  } catch (error) {
    output.textContent = 'REJECTED';
    details.textContent = error instanceof Error ? error.message : 'Verification failed';
  }
}
fallback.addEventListener('click', () => { void show(simulatedSamples[1]); });
beacon.addEventListener('click', () => { void show(simulatedSamples[0]); });
