import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, expect, test } from 'vitest';
import { proposalQueue, SimulatedSteward } from '@castle-control/ui/steward';
import { simulatedRead } from '../simulated.js';
import { Overview } from './overview.jsx';

const snapshot = { mode: 'fixture', phase: 'ready', ...simulatedRead(1) } as const;
const render = () => renderToStaticMarkup(<Overview snapshot={snapshot} selected="lottery"
  on_select={() => undefined} on_open={() => undefined} />);
function clearPending() {
  for (const proposal of proposalQueue.pending()) proposalQueue.tearUp(proposal.id);
  proposalQueue.select();
}
beforeEach(clearPending);
afterEach(clearPending);

test.each([[0, '0 proposals'], [1, '1 proposal'], [2, '2 proposals']] as const)(
  'Overview renders the counter and per-chamber count for %i pending proposals', async (count, text) => {
    const steward = new SimulatedSteward();
    for (let index = 0; index < count; index++) await steward.ask('draft a question draw', { surface: 'overview' });
    expect(proposalQueue.pending()).toHaveLength(count);
    const html = render();
    expect(html).toContain(`<b>${text}</b></header>`);
    expect(html).toContain(`aria-label="Lot Chamber, ${count === 0 ? 'no proposals' : text}"`);
    for (const room of ['Gatehouse', 'Beacons', 'Map Room']) expect(html).toContain(`aria-label="${room}, no proposals"`);
  },
);

test('Overview excludes torn drafts and keeps each chamber count separate', async () => {
  const steward = new SimulatedSteward();
  await steward.ask('draft a question draw', { surface: 'overview' });
  const torn = proposalQueue.pending()[0];
  if (!torn) throw new Error('Missing simulated proposal');
  proposalQueue.tearUp(torn.id);
  await steward.ask('draft a question draw', { surface: 'overview' });
  await steward.ask('raise the drawbridge', { surface: 'overview' });
  const html = render();
  expect(html).toContain('<b>2 proposals</b></header>');
  expect(html).toContain('aria-label="Lot Chamber, 1 proposal"');
  expect(html).toContain('aria-label="Gatehouse, 1 proposal"');
  for (const room of ['Beacons', 'Map Room']) expect(html).toContain(`aria-label="${room}, no proposals"`);
});
