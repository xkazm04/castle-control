import { afterEach, expect, test, vi } from 'vitest';
import { chambers } from '@castle-control/ui';
import { chipFlow, createDockStore, stewardDock } from '@castle-control/ui/steward-flow';
import { stewardRegistry } from '../shell/steward-flows.js';
import { keepTourFlow, offerTourDemos, tourDemoChips } from './steward-flows.js';

afterEach(() => { vi.useRealTimers(); });

test('every tour chip opens its own chamber with that chamber\'s Play demo ready', () => {
  const registry = stewardRegistry({ mode: 'fixture', phase: 'ready' });
  const chips = tourDemoChips();
  expect(chips.map(chip => chip.action)).toEqual(chambers.map(chamber => ({ kind: 'demo', chamber: chamber.id })));
  for (const chip of chips) {
    const flow = chipFlow(registry, chip.action);
    expect(flow, chip.label).toBeDefined();
    expect(flow?.chamber).toBe(chip.action.chamber);
    expect(flow?.simulated).toBe(true);
    // Ready: opening it lands on its first step in its own chamber.
    const store = createDockStore();
    if (flow) store.open(flow);
    expect(store.getSnapshot().sessions[chip.action.chamber]?.flow.id).toBe(flow?.id);
  }
});

test('the tour walks four beats, lights each room, and its seal offers the demo chips after its own line', async () => {
  vi.useFakeTimers();
  const store = createDockStore();
  store.open(keepTourFlow);
  const lit: string[] = [];
  for (const answer of ['lottery', 'moderator', 'visuals', 'studio']) {
    store.answer('keep', answer);
    const draft = store.getSnapshot().drafts.keep?.draft as { lit?: string } | undefined;
    if (draft?.lit) lit.push(draft.lit);
  }
  expect(lit).toEqual(['lottery', 'moderator', 'visuals', 'studio']);
  const before = stewardDock.getSnapshot().beats.length;
  await store.seal('keep');
  expect(store.getSnapshot().beats.at(-1)?.text).toMatch(/^Tour done/);
  expect(stewardDock.getSnapshot().beats.length).toBe(before);
  vi.runAllTimers();
  const offer = stewardDock.getSnapshot().beats.at(-1);
  expect(offer).toMatchObject({ chamber: 'keep', who: 'steward', simulated: true });
  expect(offer?.chips?.map(chip => chip.label)).toEqual(chambers.map(chamber => `Play the ${chamber.name} demo`));
});

test('the Map Room beat speaks of chat duels, not a sand table', () => {
  const beat = keepTourFlow.steps.find(step => step.id === 'beacons');
  expect(beat?.prompt).toMatch(/chat duels/); expect(beat?.prompt).not.toMatch(/sand table/i);
  const store = { say: vi.fn() };
  vi.useFakeTimers(); offerTourDemos(store); vi.runAllTimers();
  expect(store.say).toHaveBeenCalledOnce();
});
