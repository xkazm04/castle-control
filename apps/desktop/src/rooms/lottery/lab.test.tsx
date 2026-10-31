import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import type { LotsProofRoll, LotsWrit } from '@castle-control/contract';
import { castWinners, commitmentOf, sealOf } from '../../lots-cast.js';
import { fixtureEntries, fixtureWrit } from '../../lots-fixture.js';
import { applyTamper, defaultTamperIndex, hexBytes, inspectWrit, sealOfRoll, sealPreimage, toHex, traceCast } from './lab-model.js';
import type { LabReport } from './lab-model.js';
import { labVerdict, WritLab, WritLabView } from './lab.jsx';

const statuses = (report: LabReport) => report.steps.map(step => step.status);
// Generated, labelled-simulated values only: no real seed, signature or chat.
const simulatedSeed = 'ab'.repeat(32);
async function simulatedRoll(count = 87, winner_count = 5): Promise<{ roll: LotsProofRoll; seal: string }> {
  const roll: LotsProofRoll = { version: 1, winner_count, sealed_at: '2026-10-31T12:00:00Z', margin_s: 6,
    entries: fixtureEntries(count).map(entry => ({ handle: entry.handle, weight: 1 + entry.number % 5 })),
    randomness: { source: 'streamer_commit', commitment: await commitmentOf(simulatedSeed) } };
  return { roll, seal: await sealOf(roll) };
}
async function simulatedBeaconWrit(): Promise<LotsWrit> {
  const signature = 'cd'.repeat(48);
  const randomness = toHex(new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', hexBytes(signature))));
  const roll: LotsProofRoll = { version: 1, winner_count: 3, sealed_at: '2026-10-31T12:00:00Z', margin_s: 6,
    entries: fixtureEntries(12).map(entry => ({ handle: entry.handle, weight: entry.number })),
    randomness: { source: 'drand_quicknet', chain_hash: '52'.repeat(32), round: '1000' } };
  const seal = await sealOfRoll(roll);
  const { winners } = await traceCast(hexBytes(randomness), seal, roll);
  return { roll, seal, proof: { source: 'drand_quicknet', signature, randomness }, winners: [...winners] };
}

test('lab seal preimage matches the recorded fixture seal and the desktop sealOf', async () => {
  expect(await sealOfRoll(fixtureWrit.roll)).toBe(fixtureWrit.seal);
  expect(await sealOfRoll(fixtureWrit.roll)).toBe(await sealOf(fixtureWrit.roll));
  const { roll, seal } = await simulatedRoll();
  expect(await sealOfRoll(roll)).toBe(seal);
  const { bytes, segments } = sealPreimage(fixtureWrit.roll);
  expect(segments[0]).toEqual({ field: 'domain', start: 0, end: 23 });
  expect(segments.at(-1)?.end).toBe(bytes.length);
});

test('traced cast reproduces castWinners for the fixture and a generated 87-entry roll', async () => {
  const fixture = await traceCast(hexBytes(fixtureWrit.proof.source === 'streamer_commit' ? fixtureWrit.proof.seed : ''), fixtureWrit.seal, fixtureWrit.roll);
  expect(fixture.winners).toEqual(fixtureWrit.winners);
  const { roll, seal } = await simulatedRoll();
  const traced = await traceCast(hexBytes(simulatedSeed), seal, roll);
  expect(traced.winners).toEqual(await castWinners(simulatedSeed, seal, roll));
  expect(traced.trace.filter(pick => pick.accepted).map(pick => pick.handle)).toEqual(traced.winners);
  expect(traced.trace.every(pick => /^[0-9a-f]{16}$/.test(pick.candidate))).toBe(true);
});

test('untampered fixture writ passes all four steps as streamer-controlled', async () => {
  const report = await inspectWrit(fixtureWrit);
  expect(statuses(report)).toEqual(['pass', 'pass', 'pass', 'pass']);
  expect(report.verdict).toBe('verified');
  expect(report.diff).toBeUndefined();
  expect(labVerdict(report)).toBe('Writ verified · every step passes.');
});

test('a weight bumped by one is caught by the seal and blocks later steps', async () => {
  const before = JSON.stringify(fixtureWrit);
  const index = defaultTamperIndex(fixtureWrit);
  const report = await inspectWrit(fixtureWrit, { kind: 'weight', index });
  expect(JSON.stringify(fixtureWrit)).toBe(before);
  expect(statuses(report)).toEqual(['pass', 'fail', 'blocked', 'blocked']);
  expect(report.caught_at).toBe('seal');
  expect(report.diff).toMatchObject({ field: 'entry_weight', entry: index, before: 21, after: 22 });
  expect(labVerdict(report)).toContain('Tamper caught at step 2: SHA-256 seal');
});

test('an altered handle keeps ascending order so only the seal catches it', async () => {
  const report = await inspectWrit(fixtureWrit, { kind: 'handle', index: 1 });
  expect(statuses(report)).toEqual(['pass', 'fail', 'blocked', 'blocked']);
  expect(report.writ.roll.entries[1]?.handle).toBe('simulated_010');
  expect(report.writ.winners[0]).toBe('simulated_010');
  expect(report.diff).toMatchObject({ field: 'entry_length', entry: 1 });
  const { roll, seal } = await simulatedRoll();
  const generated = await inspectWrit({ roll, seal, proof: { source: 'streamer_commit', seed: simulatedSeed },
    winners: [...await castWinners(simulatedSeed, seal, roll)] }, { kind: 'handle', index: 18 });
  expect(statuses(generated)).toEqual(['pass', 'fail', 'blocked', 'blocked']);
  expect(generated.writ.roll.entries[18]?.handle).toBe('simulated_0001_');
  expect(generated.diff).toMatchObject({ field: 'entry_handle', entry: 18 });
});

test('a flipped seed bit passes the seal but fails its commitment', async () => {
  const report = await inspectWrit(fixtureWrit, { kind: 'seed' });
  expect(statuses(report)).toEqual(['pass', 'pass', 'fail', 'blocked']);
  expect(report.steps[2]?.reason).toBe('commitment_mismatch');
  expect(report.diff).toBeUndefined();
});

test('a moved commitment changes the sealed bytes', async () => {
  const report = await inspectWrit(fixtureWrit, { kind: 'plan' });
  expect(statuses(report)).toEqual(['pass', 'fail', 'blocked', 'blocked']);
  expect(report.diff?.field).toBe('commitment');
});

test('swapped recorded winners pass three steps and fail derivation', async () => {
  const report = await inspectWrit(fixtureWrit, { kind: 'winners' });
  expect(statuses(report)).toEqual(['pass', 'pass', 'pass', 'fail']);
  expect(report.steps[3]?.reason).toBe('cast_mismatch');
  expect(report.computed_winners).toEqual(fixtureWrit.winners);
});

test('tampers return frozen copies and never mutate the frozen roll', () => {
  const frozen = applyTamper(fixtureWrit, { kind: 'weight', index: 0 });
  expect(Object.isFrozen(frozen.roll.entries[0])).toBe(true);
  expect(fixtureWrit.roll.entries[0]?.weight).toBe(14);
  expect(frozen.roll.entries[0]?.weight).toBe(15);
});

test('a simulated beacon writ verifies seal and winners but stays unverified without BLS', async () => {
  const writ = await simulatedBeaconWrit();
  const report = await inspectWrit(writ);
  expect(statuses(report)).toEqual(['pass', 'pass', 'unverified', 'pass']);
  expect(report.verdict).toBe('unverified');
  expect(report.round).toBe('1000');
  const signature = await inspectWrit(writ, { kind: 'seed' });
  expect(statuses(signature)).toEqual(['pass', 'pass', 'fail', 'blocked']);
  expect(signature.steps[2]?.reason).toBe('randomness_mismatch');
  const round = await inspectWrit(writ, { kind: 'plan' });
  expect(statuses(round)).toEqual(['pass', 'fail', 'blocked', 'blocked']);
  expect(round.diff?.field).toBe('round');
});

test('lab view stamps every step, marks the tampered byte and announces the catch', async () => {
  const report = await inspectWrit(fixtureWrit, { kind: 'weight', index: defaultTamperIndex(fixtureWrit) });
  const html = renderToStaticMarkup(<WritLabView writ={fixtureWrit} simulated tamper={{ kind: 'weight', index: 1 }}
    report={report} on_tamper={() => undefined} />);
  expect(html).toContain('Writ Lab');
  expect(html.match(/class="lottery-lab-step"/g)).toHaveLength(4);
  expect(html).toContain('data-status="fail"');
  expect(html.match(/data-status="blocked"/g)).toHaveLength(2);
  expect(html).toContain('Mismatch');
  expect(html).toContain('data-changed="true"');
  expect(html).toContain('data-tampered="true"');
  expect(html).toContain('{&quot;handle&quot;:&quot;simulated_01&quot;,&quot;weight&quot;:22}');
  expect(html).toMatch(/aria-pressed="true"[^>]*>Weight \+1</);
  expect(html).toMatch(/role="status"[^>]*>Tamper caught at step 2/);
  expect(html).toContain('download="castle-control-writ.json"');
  expect(html).toContain(encodeURIComponent(JSON.stringify(fixtureWrit)).replaceAll('&', '&amp;'));
  expect(html).toContain('Simulated');
});

test('lab first renders a pending recompute and the restore control disabled', () => {
  const html = renderToStaticMarkup(<WritLab writ={fixtureWrit} simulated={false} />);
  expect(html).toMatch(/role="status"[^>]*>Recomputing the proof locally/);
  expect(html.match(/data-status="pending"/g)).toHaveLength(4);
  expect(html).toMatch(/disabled=""[^>]*>Restore canonical writ/);
  expect(html).toContain('Proof bundle from the local core');
});

test('lab styles stay token-only and respect reduced motion', () => {
  const css = readFileSync(new URL('./lab.css', import.meta.url), 'utf8');
  expect(css).not.toMatch(/#[\da-f]{3,8}\b|\brgba?\(|\bhsla?\(|\b\d+(?:\.\d+)?px\b/i);
  expect(css).toContain('prefers-reduced-motion: reduce');
  expect(css).toContain('@keyframes lottery-lab-stamp');
});
