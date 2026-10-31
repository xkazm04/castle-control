import { expect, test } from 'vitest';
import { ProposalQueue } from '@castle-control/ui/steward';
import { draftRoll, lotterySession, sealLotteryProposal } from './session.js';

test('lots-07 a paused eligibility edit cannot seal the proposal ahead of its held roll', async () => {
  const queue = new ProposalQueue(); const { port } = lotterySession(queue);
  const entries = port.getSnapshot().entries; const draw = port.getSnapshot().draw;
  port.pause(); port.edit({ ...draw, rules: { ...draw.rules, pool: { kind: 'subscribers' } } });
  draftRoll(queue); const proposal = queue.pending('lottery')[0];
  if (!proposal) throw new Error('Missing simulated proposal');
  await expect(sealLotteryProposal(queue, proposal)).rejects.toThrow('Resume intake');
  expect(queue.pending('lottery')[0]?.state).toBe('drafted');
  expect(port.getSnapshot().entries).toBe(entries); expect(port.getSnapshot().sealed).toBe(false);
  port.pause(); await sealLotteryProposal(queue, proposal);
  expect(port.getSnapshot().sealed).toBe(true); expect(queue.byChamber('lottery')[0]?.state).toBe('sealed');
});

test('lots-07 pausing alone still permits closing and sealing the current roll', async () => {
  const queue = new ProposalQueue(); const { port } = lotterySession(queue);
  const entries = port.getSnapshot().entries;
  port.pause(); draftRoll(queue); const proposal = queue.pending('lottery')[0];
  if (!proposal) throw new Error('Missing simulated proposal');
  await sealLotteryProposal(queue, proposal);
  expect(port.getSnapshot().entries).toEqual(entries); expect(port.getSnapshot().sealed).toBe(true);
});
