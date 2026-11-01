import { expect, test } from 'vitest';
import { chamberChips, createDockStore, flowChambers, matchIntent } from '@castle-control/ui/steward-flow';
import { keepThemeFlow, keepTonight } from '../keep/steward-flows.js';
import { flowChamber, stewardRegistry } from './steward-flows.js';

const registry = stewardRegistry({ mode: 'fixture', phase: 'ready' });

test('every chamber has a Steward; the Keep offers its theme flow and a simulated catch-up', () => {
  for (const chamber of flowChambers) expect(registry[chamber].greeting.length).toBeGreaterThan(10);
  expect(chamberChips('keep', registry.keep).map(chip => chip.label)).toEqual(["Pick tonight's theme", 'Catch me up']);
  const brief = registry.keep.catch_up?.();
  expect(brief?.simulated).toBe(true);
  expect(brief?.lines?.map(line => line.label)).toEqual(['Lot Chamber', 'Gatehouse', 'Beacons', 'Map Room', 'Chat delay']);
  expect(flowChamber('overview')).toBe('keep');
  expect(flowChamber('rehearsal')).toBe('rehearsal');
});

test('free text opens flows or points at chambers, never seals', () => {
  expect(matchIntent('plan tonight', registry, 'keep')).toMatchObject({ kind: 'flow', flow: 'keep-theme' });
  expect(matchIntent('start a giveaway', registry, 'keep')).toMatchObject({ kind: 'chamber', chamber: 'lottery' });
  expect(matchIntent('set up obs', registry, 'keep')).toMatchObject({ kind: 'chamber', chamber: 'stream' });
});

test('the Keep theme flow publishes a live draft and seals only from the confirm step', async () => {
  const store = createDockStore();
  store.open(keepThemeFlow);
  store.answer('keep', 'lottery');
  expect(store.getSnapshot().drafts.keep).toMatchObject({ flow: 'keep-theme', step: 'dressing', simulated: true, draft: { lead: 'lottery' } });
  store.answer('keep', 'offering-altar');
  await store.seal('keep');
  expect(keepTonight()).toBeUndefined();
  store.answer('keep', 'ok');
  await store.seal('keep');
  expect(keepTonight()).toEqual({ lead: 'lottery', dressing: 'offering-altar' });
  expect(store.getSnapshot().beats.at(-1)?.text).toBe('Sealed. Tonight opens in the Lot Chamber, dressed with the Offering altar.');
});
