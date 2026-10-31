import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import { ProposalQueue } from '@castle-control/ui/steward';
import LotteryRoom from './index.jsx';
import { draftRoll, lotterySession, sealLotteryProposal } from './session.js';
import { createLotsPreview } from '../../lots-model.js';
import { fixtureDraws } from '../../lots-fixture.js';
import { createDrawDisplay } from './display.js';

const snapshot = { mode: 'fixture', phase: 'ready' } as const;
const room = (queue: ProposalQueue) => renderToStaticMarkup(<LotteryRoom snapshot={snapshot} replay={false} queue={queue} />);
const source = fixtureDraws[0];
if (!source) throw new Error('Missing simulated draw');

test('the room exposes setup, preview and all urn parameters before sealing', () => {
  const html = room(new ProposalQueue());
  for (const label of ['Draw name', 'Eligible pool', 'Weights', 'Preview this draw', 'Urn size',
    'Screen anchor', 'Urn colour', 'Art style', 'Reveal timing in ms']) expect(html).toContain(label);
  expect(html).toContain('SIMULATED · SAMPLE ART');
  expect(html).toContain('preset-heraldic-urn.webp');
});

test('display settings are session-only, clamp timing and notify live previews', () => {
  const display = createDrawDisplay();
  const listener = vi.fn(); const stop = display.subscribe(listener);
  display.edit({ size: 'L', anchor: 'tl', colour: 'azure', art_style: 'pixel', reveal_ms: 999_999 });
  expect(display.getSnapshot()).toMatchObject({ size: 'L', anchor: 'tl', colour: 'azure', art_style: 'pixel', reveal_ms: 10_000 });
  display.edit({ reveal_ms: -20 }); expect(display.getSnapshot().reveal_ms).toBe(100);
  display.edit({ reveal_ms: Number.NaN }); expect(display.getSnapshot().reveal_ms).toBe(1500);
  expect(listener).toHaveBeenCalledTimes(3); stop();
  expect(createDrawDisplay().getSnapshot()).toMatchObject({ size: 'M', anchor: 'br', art_style: 'heraldic' });
});

test('pool and concave weights change the generated preview; free entry restores equal odds', () => {
  const port = createLotsPreview(); const initial = port.getSnapshot();
  port.edit({ ...initial.draw, rules: { ...initial.draw.rules, pool: { kind: 'subscribers' },
    free_join_equal_odds: false, weight_curve: { kind: 'concave', max_units: 4 } } });
  expect(port.getSnapshot().entries.length).toBeLessThan(initial.entries.length);
  expect(port.getSnapshot().entries.every(entry => entry.cohort === 'subscriber')).toBe(true);
  expect(new Set(port.getSnapshot().entries.map(entry => entry.weight)).size).toBeGreaterThan(1);
  const draw = port.getSnapshot().draw;
  port.edit({ ...draw, rules: { ...draw.rules, free_join_equal_odds: true } });
  expect(port.getSnapshot().entries.every(entry => entry.weight === 1)).toBe(true);
});

test('an empty or impossible pool reports the problem without starting a cast', () => {
  const port = createLotsPreview(0); port.seal(); port.start();
  expect(port.getSnapshot().started).toBe(false);
  expect(port.getSnapshot().notice).toContain('No generated entries');
  const normal = createLotsPreview();
  normal.edit({ ...normal.getSnapshot().draw, rules: { ...normal.getSnapshot().draw.rules,
    pool: { kind: 'keyword', keyword: '!absent' }, free_join_equal_odds: false } });
  expect(normal.getSnapshot().entries).toHaveLength(0);
  normal.seal(); expect(normal.getSnapshot().sealed).toBe(false);
});

test('the sealed current roll yields distinct simulated winners and its own readable writ', async () => {
  const network = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('No transport in fixture'));
  try {
    const queue = new ProposalQueue(); const { port } = lotterySession(queue);
    draftRoll(queue); const proposal = queue.pending('lottery')[0];
    if (!proposal) throw new Error('Missing preview');
    await sealLotteryProposal(queue, proposal);
    const sealed = port.getSnapshot(); port.start();
    const cast = room(queue);
    expect(cast).toContain('Current SIMULATED cast');
    expect(cast.match(/data-current-winner=/g)).toHaveLength(3);
    expect(cast).toContain('Read current simulated writ');
    port.nested(true);
    const writ = room(queue);
    expect(writ).toContain('Current simulated writ'); expect(writ).toContain('Not a cc-verify proof');
    expect(writ).toContain(lotterySession(queue).rolls.get(proposal.id)?.hash);
    port.start(); expect(port.getSnapshot().entries).toBe(sealed.entries);
    expect(room(queue)).toContain('Current SIMULATED cast');
    expect(network).not.toHaveBeenCalled();
  } finally { network.mockRestore(); }
});

test('a new roll clears the current result while the old frozen writ stays separate', async () => {
  const queue = new ProposalQueue(); const { port } = lotterySession(queue);
  draftRoll(queue); const proposal = queue.pending('lottery')[0];
  if (!proposal) throw new Error('Missing preview');
  await sealLotteryProposal(queue, proposal); port.start(); port.nested(true);
  port.select('hall-questions');
  expect(port.getSnapshot().nested).toBe(false);
  expect(room(queue)).not.toContain('aria-label="Current SIMULATED cast"');
  expect(lotterySession(queue).rolls.has(proposal.id)).toBe(true);
});

test('concave setup never prints an equal-weight claim on the stage or pending writ', () => {
  const queue = new ProposalQueue(); const { port } = lotterySession(queue);
  const draw = port.getSnapshot().draw;
  port.edit({ ...draw, rules: { ...draw.rules, free_join_equal_odds: false, weight_curve: { kind: 'concave', max_units: 4 } } });
  draftRoll(queue);
  const html = room(queue);
  expect(html.includes('every entry has equal weight')).toBe(false);
  expect(html.includes('every generated entry has weight 1')).toBe(false);
  expect(html).toContain('Newcomer weight 4; heaviest 14. 4 newcomers outweigh the heaviest entrant.');
});
