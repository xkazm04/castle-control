import { beforeEach, expect, test, vi } from 'vitest';
import { proposalQueue, SimulatedSteward } from '@castle-control/ui/steward';
import { programCandidate, proclaimToSampleProgram, sampleProgram } from './program.js';

beforeEach(() => { for (const proposal of proposalQueue.pending()) proposalQueue.tearUp(proposal.id); proposalQueue.select(); });

test('Program chooses the focused draft rather than a newer proposal in the same chamber', async () => {
  const steward = new SimulatedSteward();
  const first = (await steward.ask('draft a question draw', { surface: 'overview' })).proposals[0];
  await steward.ask('draft a question draw', { surface: 'overview' });
  if (!first) throw new Error('Missing draft');
  proposalQueue.select(first.id);
  expect(programCandidate('lottery')?.id).toBe(first.id);
});

test('amending while a sample roll is being hashed invalidates the pending authorization', async () => {
  const steward = new SimulatedSteward();
  const draft = (await steward.ask('draft a question draw', { surface: 'overview' })).proposals[0];
  if (!draft) throw new Error('Missing draft');
  const before = sampleProgram.getSnapshot();
  let complete: ((value: ArrayBuffer) => void) | undefined;
  const digest = vi.spyOn(crypto.subtle, 'digest').mockImplementation(() => new Promise<ArrayBuffer>(resolve => { complete = resolve; }));
  try {
    const job = proclaimToSampleProgram(draft.id);
    await steward.ask('make it 5 winners', { surface: 'overview' });
    complete?.(new Uint8Array(32).buffer);
    expect(await job).toContain('Review it and hold again');
    expect(sampleProgram.getSnapshot()).toBe(before);
    expect(proposalQueue.pending()[0]?.state).toBe('amended');
  } finally { digest.mockRestore(); }
});

test('a prize amendment cannot bypass room policy checks through the monitor', async () => {
  const steward = new SimulatedSteward();
  const draft = (await steward.ask('draft a question draw', { surface: 'overview' })).proposals[0];
  if (!draft) throw new Error('Missing draft');
  await steward.ask('prize is a signed print', { surface: 'overview' });
  const before = sampleProgram.getSnapshot();
  expect(await proclaimToSampleProgram(draft.id)).toContain('policy checks');
  expect(sampleProgram.getSnapshot()).toBe(before);
  expect(proposalQueue.pending()[0]?.seal_hash).toBeUndefined();
});
