import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { createSealAuthority, LiveSteward, proposalQueue, SimulatedSteward } from '@castle-control/ui/steward';
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

test.each([true, false])('Overview routes a live visuals writ to the core without projecting sample Program: %s', async succeeds => {
  const writ = { writ_id: succeeds ? '01ARZ3NDEKTSV4RRFFQ69G5FAX' : '01ARZ3NDEKTSV4RRFFQ69G5FAY', chamber: 'beacons', status: 'proposed',
    created_at: '2026-10-27T00:00:00Z', updated_at: '2026-10-27T00:00:01Z',
    proposal: { method: 'beacons.visual.upsert', diff: { after: { visual: {
      visual_id: 'simulated-frame', name: 'Synthetic transport frame', curve: {
        ranges: [{ total: 0, intensity: 0 }, { total: 50, intensity: 1 }], decay: { kind: 'exponential', half_life_s: 300 },
      },
    } } } } };
  const transport = { ask: vi.fn(async () => JSON.stringify({ writ })),
    seal: vi.fn(async () => { if (!succeeds) throw new Error('Synthetic failure'); return JSON.stringify({ writ: { ...writ, status: 'sealed' } }); }),
    tear: vi.fn() };
  const live = new LiveSteward(transport);
  const proposal = (await live.ask('Synthetic frame', { surface: 'room', chamber: 'visuals' })).proposals[0];
  if (!proposal) throw new Error('Missing live visuals draft');
  const local = vi.fn(sealSlot.sealRoomProposal);
  const authority = createSealAuthority({ queue: proposalQueue, live, local });
  const before = sampleProgram.getSnapshot();
  const notice = await proclaimToSampleProgram(proposal.id, authority);
  expect(transport.seal).toHaveBeenCalledExactlyOnceWith({ writ_id: proposal.id });
  expect(local).not.toHaveBeenCalled();
  expect(sampleProgram.getSnapshot()).toBe(before);
  expect(notice).not.toContain('simulated Program');
  expect(notice).toContain(succeeds ? 'core confirmed' : 'could not confirm the seal');
  expect(proposalQueue.byChamber('visuals').find(item => item.id === proposal.id)?.state).toBe(succeeds ? 'proclaimed' : 'drafted');
});

test('a fixture proclamation retains its exact simulated Program notice', async () => {
  const draft = (await new SimulatedSteward().ask('test fire 50 gifts', { surface: 'overview' })).proposals[0];
  if (!draft) throw new Error('Missing simulated visuals draft');
  expect(await proclaimToSampleProgram(draft.id)).toBe('Sealed and proclaimed to simulated Program. No live output or viewer action.');
});
