import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { proposalQueue, SimulatedSteward } from '@castle-control/ui/steward';
import * as sealSlot from '../rooms/seal-slot/index.jsx';
import { entryHash, lotterySession } from '../rooms/lottery/session.js';
import { programCandidate, proclaimToSampleProgram, sampleProgram } from './program.js';

beforeEach(() => { for (const proposal of proposalQueue.pending()) proposalQueue.tearUp(proposal.id); proposalQueue.select(); });
afterEach(() => { vi.restoreAllMocks(); });

test('Program chooses the focused draft rather than a newer proposal in the same chamber', async () => {
  const steward = new SimulatedSteward();
  const first = (await steward.ask('draft a question draw', { surface: 'overview' })).proposals[0];
  await steward.ask('draft a question draw', { surface: 'overview' });
  if (!first) throw new Error('Missing draft');
  proposalQueue.select(first.id);
  expect(programCandidate('lottery')?.id).toBe(first.id);
});

test.each(['amend', 'tear'] as const)('%s while a sample roll is being hashed invalidates the pending authorization', async change => {
  const steward = new SimulatedSteward();
  const draft = (await steward.ask('draft a question draw', { surface: 'overview' })).proposals[0];
  if (!draft) throw new Error('Missing draft');
  const before = sampleProgram.getSnapshot();
  let complete: ((value: ArrayBuffer) => void) | undefined;
  const digest = vi.spyOn(crypto.subtle, 'digest').mockImplementation(() => new Promise<ArrayBuffer>(resolve => { complete = resolve; }));
  try {
    const job = proclaimToSampleProgram(draft.id);
    await vi.waitFor(() => expect(complete).toBeDefined());
    if (change === 'amend') await steward.ask('make it 5 winners', { surface: 'overview' });
    else proposalQueue.tearUp(draft.id);
    complete?.(new Uint8Array(32).buffer);
    expect(await job).toContain('Review it and hold again');
    expect(sampleProgram.getSnapshot()).toBe(before);
    expect(proposalQueue.byChamber('lottery').find(item => item.id === draft.id)?.state).toBe(change === 'amend' ? 'amended' : 'torn');
  } finally { digest.mockRestore(); }
});

test('a prize held on Overview is refused with exactly the room guardrail message', async () => {
  const steward = new SimulatedSteward();
  const draft = (await steward.ask('draft a question draw', { surface: 'overview' })).proposals[0];
  if (!draft) throw new Error('Missing draft');
  await steward.ask('prize is a signed print', { surface: 'overview' });
  const before = sampleProgram.getSnapshot();
  const proposal = proposalQueue.pending('lottery').find(item => item.id === draft.id);
  if (!proposal) throw new Error('Missing amended draft');
  let roomMessage = '';
  try { await sealSlot.sealRoomProposal(proposalQueue, proposal); }
  catch (cause) { if (!(cause instanceof Error)) throw cause; roomMessage = cause.message; }
  expect(roomMessage).toBe('Giveaway guardrails block this roll.');
  expect(await proclaimToSampleProgram(draft.id)).toBe(roomMessage);
  expect(sampleProgram.getSnapshot()).toBe(before);
  expect(proposalQueue.pending()[0]?.seal_hash).toBeUndefined();
});

test('Overview hold calls the room seal path and projects its frozen weighted roll hash', async () => {
  const seal = vi.spyOn(sealSlot, 'sealRoomProposal');
  const steward = new SimulatedSteward();
  const draft = (await steward.ask('draft a question draw', { surface: 'overview' })).proposals[0];
  if (!draft) throw new Error('Missing draft');
  await steward.ask('no raiders', { surface: 'overview' });
  const proposal = proposalQueue.pending('lottery').find(item => item.id === draft.id);
  expect(await proclaimToSampleProgram(draft.id)).toContain('Sealed and proclaimed');
  expect(seal).toHaveBeenCalledExactlyOnceWith(proposalQueue, proposal);
  const roll = lotterySession(proposalQueue).rolls.get(draft.id);
  if (!roll) throw new Error('Room did not freeze the roll');
  expect(roll.entries.every(entry => entry.cohort !== 'raider')).toBe(true);
  expect(roll.bytes).toBe(JSON.stringify(roll.entries.map(({ handle, weight }) => ({ handle, weight }))));
  const aired = sampleProgram.getSnapshot().find(item => item.id === draft.id);
  expect(aired?.seal_hash).toBe(await entryHash(roll.bytes));
  expect(aired?.state).toBe('sealed');
});
