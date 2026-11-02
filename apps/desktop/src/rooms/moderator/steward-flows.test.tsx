import { afterEach, expect, test, vi } from 'vitest';
import { proposalQueue } from '@castle-control/ui/steward';
import { answerStep, chamberChips, startFlow, walkFlow } from '@castle-control/ui/steward-flow';
import type { FlowState, StewardFlow } from '@castle-control/ui/steward-flow';
import { fixtureConfirmationMs } from '../../moderation-fixture.js';
import { moderatorSteward } from './steward-flows.js';
import { demoFlow } from './flow-demo.jsx';
import { rulesFlow } from './flow-rules.jsx';
import { voteBarFlow } from './flow-votebar.jsx';
import { moderationSession } from './session.js';

afterEach(() => { vi.useRealTimers(); });
const fixture = { mode: 'fixture', phase: 'ready' } as const;
function walk<D>(flow: StewardFlow<D>, answers: readonly string[]): { state: FlowState; draft: D; ready: boolean } {
  let state = startFlow(flow);
  for (const value of answers) {
    const result = answerStep(flow, state, value);
    expect(result.error).toBeUndefined();
    state = result.state;
  }
  const view = walkFlow(flow, state);
  return { state, draft: view.draft, ready: view.ready };
}

test('the Gatehouse offers two setup chips, Play demo and Catch me up; the demo is SIMULATED', () => {
  const steward = moderatorSteward(fixture);
  expect(chamberChips('moderator', steward).map(chip => chip.label)).toEqual(['Set the rules', 'Vote bar on stream', 'Play demo', 'Catch me up']);
  expect(steward.flows.map(flow => flow.title)).toContain('Practice a drill');
  expect(steward.demo?.simulated).toBe(true);
  expect(steward.catch_up?.().say).toBe('1 held message and 1 pending ban need you.');
  // Core mode has no fixture demo and no fixture-only rule setup.
  const core = moderatorSteward({ mode: 'core', phase: 'ready' });
  expect(core.demo).toBeUndefined();
  expect(core.flows.map(flow => flow.id)).toEqual(['gatehouse-votebar', 'gatehouse-drill']);
});

test('Set the rules acts only on its seal: a watching rule, armed previews and the chat delay', async () => {
  vi.useFakeTimers();
  const { port } = moderationSession(proposalQueue);
  const { draft, ready } = walk(rulesFlow, ['family', '6', 'bar_blocked', 'ok']);
  expect(ready).toBe(true);
  expect(port.getSnapshot().rules.some(rule => rule.name === 'Link questions')).toBe(false);
  const outcome = await rulesFlow.seal(draft);
  expect(outcome.say).toContain('added Link questions');
  expect(port.getSnapshot().rules.find(rule => rule.name === 'Link questions')?.mode).toBe('shadow');
  expect(port.getSnapshot().preview_modes.get('blocked-terms')).toBe('armed');
  vi.advanceTimersByTime(fixtureConfirmationMs);
  expect(port.getSnapshot().delay.value).toBe(6);
  expect(port.getSnapshot().rules.every(rule => rule.mode === 'shadow')).toBe(true);
});

test('Vote bar on stream seals the session preview only in fixture mode', async () => {
  const flow = voteBarFlow(fixture);
  const { output, view } = moderationSession(proposalQueue);
  const { draft } = walk(flow, ['1', 'banner', 'synthwave', 'ok']);
  expect(output.getSnapshot().vote.anchor).toBe('bottom-right');
  const outcome = await flow.seal(draft);
  expect(outcome.say).toContain('No OBS source in fixture mode');
  expect(output.getSnapshot().vote).toMatchObject({ anchor: 'top-left', size: 'L', art_style: 'synthwave' });
  expect(view.getSnapshot().filter).toBe(1);
});

test('Play demo admits a simulated held line and resolves it only on the seal', async () => {
  vi.useFakeTimers();
  const { port, view } = moderationSession(proposalQueue);
  const ledger = port.getSnapshot().ledger.length;
  const { draft, ready } = walk(demoFlow, ['ok', 'pass', 'ok']);
  expect(ready).toBe(true);
  expect(port.getSnapshot().held.some(item => item.message_id === 'simulated-message-4300')).toBe(false);
  await demoFlow.seal(draft);
  expect(port.getSnapshot().held.find(item => item.message_id === 'simulated-message-4300')?.simulated).toBe(true);
  vi.advanceTimersByTime(fixtureConfirmationMs);
  expect(port.getSnapshot().held.some(item => item.message_id === 'simulated-message-4300')).toBe(false);
  expect(port.getSnapshot().ledger).toHaveLength(ledger + 1);
  expect(port.getSnapshot().ledger[0]?.kind).toBe('released');
  expect(view.getSnapshot().demo_moved).toBe(true);
  // A second play admits a fresh simulated line, so the demo can be shown again.
  await demoFlow.seal({ choice: 'bar' });
  expect(port.getSnapshot().held.some(item => item.message_id === 'simulated-message-4301')).toBe(true);
});
