import { beforeEach, expect, test } from 'vitest';
import { proposalQueue } from '@castle-control/ui/steward';
import { chamberChips, createDockStore, matchIntent, walkFlow } from '@castle-control/ui/steward-flow';
import type { DockStore } from '@castle-control/ui/steward-flow';
import { lotterySession } from './session.js';
import { lotLive } from './live.js';
import { castFlow, demoFlow, lotterySteward, proveFlow, setupFlow } from './steward-flows.js';
import { stewardRegistry } from '../../shell/steward-flows.js';

const snapshot = { mode: 'fixture', phase: 'ready' } as const;
const { port, display } = lotterySession(proposalQueue);
const active = (store: DockStore) => {
  const session = store.getSnapshot().sessions.lottery;
  return session ? walkFlow(session.flow, session.state).active?.step.id : undefined;
};
const publish = () => {
  const state = port.getSnapshot();
  lotLive.publish({ mode: 'fixture', phase: state.started ? 'cast' : state.sealed ? 'sealed' : 'open', draw: state.draw, draws: [],
    entries: state.entries.length, seal: state.sealed_roll?.seal, winners: state.simulated_winners ?? [], writ: Boolean(state.writ) });
};
beforeEach(() => { port.select('hall-questions'); publish(); });

test('Set up a draw walks a prize through its guardrails as steps and seals on the existing path', async () => {
  const store = createDockStore();
  store.open(setupFlow);
  expect(active(store)).toBe('kind');
  for (const answer of ['prize', 'chatters', '3', 'balanced', '25']) store.answer('lottery', answer);
  // Compliance is step guidance, never a stack of red cards: one fix at a time.
  expect(active(store)).toBe('rules');
  store.answer('lottery', 'attach');
  expect(active(store)).toBe('disclaimer');
  store.answer('lottery', 'acknowledge');
  store.answer('lottery', 'wheel');
  expect(store.getSnapshot().drafts.lottery).toMatchObject({ flow: 'lots-setup', simulated: true,
    draft: { shape: 'wheel', draw: { policy: { content: 'prize', official_rules: true, twitch_disclaimer: true } } } });
  expect(port.getSnapshot().sealed).toBe(false);
  store.answer('lottery', 'ok');
  expect(active(store)).toBe('seal');
  await store.seal('lottery');
  const state = port.getSnapshot();
  expect(state.sealed).toBe(true);
  expect(state.draw).toMatchObject({ name: 'Free-entry prize', policy: { content: 'prize', official_rules: true, twitch_disclaimer: true } });
  expect(display.getSnapshot().shape).toBe('wheel');
  const sealed = proposalQueue.byChamber('lottery').at(-1);
  expect(sealed?.state).toBe('sealed');
  expect(sealed?.seal_hash).toMatch(/^[a-f0-9]{64}$/);
  expect(store.getSnapshot().beats.at(-1)).toMatchObject({ sealed: true, simulated: true });
});

test('a paid-weight prize can only reach the seal by removing the paid weight or the prize', () => {
  const store = createDockStore();
  store.open(setupFlow);
  for (const answer of ['paid', 'chatters', '3', 'balanced']) store.answer('lottery', answer);
  expect(active(store)).toBe('paid');
  store.answer('lottery', 'no_prize');
  expect(active(store)).toBe('shape');
  expect(store.getSnapshot().drafts.lottery?.draft).toMatchObject({ draw: { policy: { content: 'question', paid_weight: false } } });
  store.reopen('lottery', 'paid');
  store.answer('lottery', 'remove');
  expect(active(store)).toBe('value');
});

test('Cast the lots offers to seal the sample first when nothing is sealed, then casts and keeps the cast final', async () => {
  const store = createDockStore();
  store.open(castFlow);
  expect(active(store)).toBe('ready');
  for (const answer of ['sample', 'ok', 'hand']) store.answer('lottery', answer);
  expect(active(store)).toBe('cast');
  await store.seal('lottery');
  const state = port.getSnapshot();
  expect(state.started).toBe(true);
  expect(state.simulated_winners).toHaveLength(3);
  expect(display.getSnapshot().by_hand).toBe(true);
  publish();
  store.open(castFlow);
  expect(active(store)).toBe('again');
});

test('Play demo fills, seals, casts and reveals a SIMULATED draw from one hold', async () => {
  const store = createDockStore();
  store.open(demoFlow);
  store.answer('lottery', 'prize');
  expect(active(store)).toBe('guard');
  store.answer('lottery', 'clear');
  expect(active(store)).toBe('roll');
  store.answer('lottery', 'ok');
  await store.seal('lottery');
  const state = port.getSnapshot();
  expect(state).toMatchObject({ sealed: true, started: true });
  expect(state.writ?.winners).toHaveLength(3);
  expect(display.getSnapshot().shape).toBe('wheel');
  const receipt = store.getSnapshot().beats.at(-1);
  expect(receipt).toMatchObject({ sealed: true, simulated: true });
  expect(receipt?.lines?.find(line => line.label === 'Winners')?.value).toBe(state.writ?.winners.join(', '));
});

test('Prove it logs the Writ Lab verdict and catches a forged copy', async () => {
  const store = createDockStore();
  store.open(proveFlow);
  store.answer('lottery', 'specimen');
  store.answer('lottery', 'weight');
  await store.seal('lottery');
  expect(store.getSnapshot().beats.at(-1)?.text).toContain('Tamper caught at step 2');
  store.open(proveFlow);
  store.answer('lottery', 'specimen');
  store.answer('lottery', 'none');
  await store.seal('lottery');
  expect(store.getSnapshot().beats.at(-1)?.text).toBe('Writ verified · every step passes.');
});

test('chips lead with what the draw needs next; free text maps to the flows', () => {
  const steward = lotterySteward(snapshot);
  const labels = () => chamberChips('lottery', steward).map(chip => chip.label);
  lotLive.publish({ ...lotLive.get(), phase: 'open' });
  expect(labels()).toEqual(['Set up a draw', 'Prove it', 'Play demo', 'Catch me up']);
  lotLive.publish({ ...lotLive.get(), phase: 'sealed' });
  expect(labels()).toEqual(['Cast the lots', 'Set up a draw', 'Play demo', 'Catch me up']);
  lotLive.publish({ ...lotLive.get(), phase: 'cast' });
  expect(labels()).toEqual(['Prove it', 'Set up a draw', 'Play demo', 'Catch me up']);
  const registry = stewardRegistry(snapshot);
  expect(matchIntent('start a giveaway', registry, 'lottery')).toMatchObject({ kind: 'flow', flow: 'lots-setup' });
  expect(matchIntent('cast the lots', registry, 'lottery')).toMatchObject({ kind: 'flow', flow: 'lots-cast' });
  expect(matchIntent('prove it', registry, 'lottery')).toMatchObject({ kind: 'flow', flow: 'lots-prove' });
  expect(lotterySteward({ mode: 'core', phase: 'ready' }).demo).toBeUndefined();
});
