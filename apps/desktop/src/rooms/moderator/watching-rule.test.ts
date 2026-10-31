import { afterEach, expect, test, vi } from 'vitest';
import { ProposalQueue } from '@castle-control/ui/steward';
import { fixtureRules } from '../../moderation-fixture.js';
import { proposeWatchingRule } from './watching-rule.jsx';
import { moderationSession, sealModerationProposal } from './session.js';
import { startSimulatedChat } from './playback.jsx';

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

test('watching edits are validated proposals and only a seal updates the local rule', () => {
  const queue = new ProposalQueue(); const rule = fixtureRules.rules[0];
  if (!rule) throw new Error('Missing generated rule');
  const network = vi.spyOn(globalThis, 'fetch');
  proposeWatchingRule(queue, rule, 'Links for review', 'https?://');
  expect(moderationSession(queue).port.getSnapshot().rules[0]?.name).toBe('Links');
  const proposal = queue.pending('moderator')[0]; if (!proposal) throw new Error('Missing proposal');
  sealModerationProposal(queue, proposal);
  expect(moderationSession(queue).port.getSnapshot().rules[0]?.name).toBe('Links for review');
  expect(moderationSession(queue).port.getSnapshot().rules.every(item => item.mode === 'shadow')).toBe(true);
  for (const pattern of ['', '[']) expect(() => proposeWatchingRule(queue, rule, 'Name', pattern)).toThrow();
  expect(() => proposeWatchingRule(queue, rule, ' ', 'x')).toThrow();
  expect(() => proposeWatchingRule(queue, { ...rule, mode: 'armed' }, 'Name', 'x')).toThrow();
  expect(network).not.toHaveBeenCalled();
});

test('simulated playback advances once a second, pauses cleanly and ends at its bounded bank', () => {
  vi.useFakeTimers(); const port = moderationSession(new ProposalQueue()).port; const ended = vi.fn();
  const stop = startSimulatedChat(port, ended);
  vi.advanceTimersByTime(2000); expect(port.getSnapshot().replay_count).toBe(422);
  stop(); vi.advanceTimersByTime(1000); expect(port.getSnapshot().replay_count).toBe(422);
  startSimulatedChat(port, ended); vi.advanceTimersByTime(4200 * 1000);
  expect(port.getSnapshot().replay_count).toBe(4200); expect(ended).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(0);
});
