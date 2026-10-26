import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import { ProposalQueue, SimulatedSteward } from '@castle-control/ui/steward';
import type { CheckResult, LotsDrawPolicy } from '@castle-control/contract';
import LotteryRoom, { LotteryWrit } from './rooms/lottery/index.jsx';
import { Urn } from './rooms/lottery/urn.jsx';
import { draftRoll, entryHash, lotterySession, sealLotteryProposal } from './rooms/lottery/session.js';
import { checkFixturePolicy, createLotsPreview, lookupFixture, recomputeFixture } from './lots-model.js';
import { fixtureDraws, fixtureEntries, fixtureWrit } from './lots-fixture.js';
import { lotsCopy as copy } from './lots-copy.js';

const snapshot = { mode: 'fixture', phase: 'ready' } as const;
const html = (queue = new ProposalQueue()) => renderToStaticMarkup(<LotteryRoom snapshot={snapshot} replay={false} queue={queue} />);
const current = (queue: ProposalQueue) => {
  const item = queue.pending('lottery').at(-1);
  if (!item) throw new Error('Missing roll proposal');
  return item;
};

test('fixture policy mirrors every giveaway-table row, uses cents, and omits absent age', () => {
  const source = fixtureDraws[1];
  if (!source) throw new Error('Missing generated prize');
  const base = { ...source.policy, official_rules: true, twitch_disclaimer: true };
  expect(checkFixturePolicy(base)).toEqual({ result: 'ok', reasons: [] });
  const cases: readonly [Partial<LotsDrawPolicy>, CheckResult, string][] = [
    [{ paid_entry: true }, 'blocked', 'paid_entry'], [{ paid_weight: true }, 'blocked', 'paid_weight'],
    [{ prize_value_usd_cents: 500_001 }, 'blocked', 'prize_value_over_cap'],
    [{ subscriber_only: true }, 'warn', 'subscriber_only'], [{ channel_points: true, free_entry_equal_odds: false }, 'warn', 'points_without_free_path'],
    [{ regions: [] }, 'warn', 'missing_region'],
  ];
  for (const [change, result, reason] of cases) expect(checkFixturePolicy({ ...base, ...change })).toEqual({ result, reasons: [reason] });
  expect(checkFixturePolicy({ ...base, prize_value_usd_cents: 500_000 }).result).toBe('ok');
  expect(checkFixturePolicy({ ...base, prize_value_usd_cents: 500_001, registration_confirmed: true }).result).toBe('ok');
  expect(checkFixturePolicy({ ...base, content: 'question', paid_entry: true, paid_weight: true }).result).toBe('ok');
  const without_age = { ...base }; delete without_age.minimum_age;
  expect(checkFixturePolicy(without_age)).toEqual({ result: 'warn', reasons: ['missing_age'] });
});


test('writ amendments strike the old value in gules and re-ink the new revision without acting', async () => {
  const queue = new ProposalQueue();
  const steward = new SimulatedSteward(queue);
  await steward.ask('draft a question draw', { surface: 'room', chamber: 'lottery' });
  await steward.ask('make it 5 winners', { surface: 'room', chamber: 'lottery' });
  const markup = renderToStaticMarkup(<LotteryWrit proposal={current(queue)} />);
  expect(markup).toContain('<s>3</s><ins>5</ins>');
  expect(markup).toContain('Proposal · not sealed');
  expect(markup).toContain('revision 2');
  expect(lotterySession(queue).port.getSnapshot().sealed).toBe(false);
  expect(markup).not.toContain('Sealed by you');
  expect(html(queue)).toContain('Fairness, always shown');
  expect(readFileSync(new URL('./shell/room.css', import.meta.url), 'utf8')).toContain('s { color: var(--gules-text)');
});

test('offline hold completion freezes entry bytes and stores a recomputable SHA-256 wax seal', async () => {
  const network = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Offline only'));
  try {
    const queue = new ProposalQueue();
    draftRoll(queue);
    const proposal = current(queue);
    await sealLotteryProposal(queue, proposal);
    const sealed = queue.byChamber('lottery')[0];
    const session = lotterySession(queue);
    const roll = session.rolls.get(proposal.id);
    if (!roll) throw new Error('Frozen roll missing');
    expect(sealed?.state).toBe('sealed');
    expect(sealed?.seal_hash).toMatch(/^[a-f0-9]{64}$/);
    const bytes = JSON.stringify(roll.entries.map(({ handle, weight }) => ({ handle, weight })));
    expect(roll.bytes).toBe(bytes);
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(bytes));
    const recomputed = Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, '0')).join('');
    expect(sealed?.seal_hash).toBe(recomputed);
    expect(await entryHash(bytes)).toBe(recomputed);
    expect(Object.isFrozen(roll.entries)).toBe(true);
    expect(Object.isFrozen(roll.entries[0])).toBe(true);
    expect(session.port.getSnapshot().sealed).toBe(true);
    expect(session.port.getSnapshot().paused).toBe(true);
    const frozen_draw = session.port.getSnapshot().draw;
    session.port.edit({ ...frozen_draw, name: 'Changed after seal' });
    expect(session.port.getSnapshot().draw).toBe(frozen_draw);
    expect(html(queue)).toContain(recomputed);
    expect(html(queue)).toContain('lottery-wax');
    expect(network).not.toHaveBeenCalled();
  } finally { network.mockRestore(); }
});

test.each([['official_rules', 'twitch_disclaimer'], ['twitch_disclaimer', 'official_rules']] as const)(
  'prize proposal requires both %s and %s; paid weight remains blocked', async (first, second) => {
    const queue = new ProposalQueue();
    const { port } = lotterySession(queue);
    port.select('free-prize'); draftRoll(queue);
    const proposal = current(queue);
    await expect(sealLotteryProposal(queue, proposal)).rejects.toThrow('guardrails');
    port.seal(); port.start();
    expect(port.getSnapshot().started).toBe(false);
    let draw = port.getSnapshot().draw;
    port.edit({ ...draw, policy: { ...draw.policy, [first]: true } });
    await expect(sealLotteryProposal(queue, proposal)).rejects.toThrow('guardrails');
    expect(port.getSnapshot().sealed).toBe(false);
    draw = port.getSnapshot().draw;
    port.edit({ ...draw, policy: { ...draw.policy, [second]: true } });
    await sealLotteryProposal(queue, proposal);
    expect(port.getSnapshot().sealed).toBe(true);
    port.start(); expect(port.getSnapshot().started).toBe(true);
    const blocked = new ProposalQueue();
    const paid = lotterySession(blocked).port;
    paid.select('paid-prize'); draftRoll(blocked);
    expect(html(blocked)).toContain(copy.reasons.paid_weight);
    await expect(sealLotteryProposal(blocked, current(blocked))).rejects.toThrow('guardrails');
    paid.seal(); paid.start();
    expect(paid.getSnapshot().sealed).toBe(false);
    expect(paid.getSnapshot().started).toBe(false);
  });

test('an amended prize, invalid count, concurrent amendment and torn draft cannot bypass the seal gate', async () => {
  const queue = new ProposalQueue();
  const steward = new SimulatedSteward(queue);
  await steward.ask('draft a question draw', { surface: 'room' });
  await steward.ask('prize is a signed print', { surface: 'room' });
  await expect(sealLotteryProposal(queue, current(queue))).rejects.toThrow('guardrails');
  queue.amend(current(queue).id, [{ key: 'prize', value: 'none' }, { key: 'winners', value: 1000 }]);
  await expect(sealLotteryProposal(queue, current(queue))).rejects.toThrow('Winner');
  queue.amend(current(queue).id, [{ key: 'winners', value: 3 }]);
  const hashing = sealLotteryProposal(queue, current(queue));
  queue.amend(current(queue).id, [{ key: 'winners', value: 5 }]);
  await expect(hashing).rejects.toThrow('changed');
  const before = current(queue);
  queue.tearUp(before.id);
  await expect(sealLotteryProposal(queue, before)).rejects.toThrow('changed');
  expect(lotterySession(queue).port.getSnapshot().sealed).toBe(false);
});

test('no raiders amendment freezes only eligible lots; all fixture entries retain equal weight', async () => {
  const queue = new ProposalQueue(); draftRoll(queue);
  queue.amend(current(queue).id, [{ key: 'cap', value: 'raiders excluded' }]);
  const proposal = current(queue);
  await sealLotteryProposal(queue, proposal);
  const roll = lotterySession(queue).rolls.get(proposal.id);
  expect(roll?.entries.every(entry => entry.cohort !== 'raider' && entry.weight === 1)).toBe(true);
  expect(roll?.entries.length).toBeLessThan(87);
});

test('selecting another draw cannot strip the guardrails from an earlier prize proposal', async () => {
  const queue = new ProposalQueue(); const { port } = lotterySession(queue);
  port.select('paid-prize'); draftRoll(queue);
  const paid = current(queue);
  port.select('hall-questions'); draftRoll(queue);
  await expect(sealLotteryProposal(queue, paid)).rejects.toThrow('guardrails');
  expect(queue.byChamber('lottery')[0]?.state).toBe('drafted');
  expect(port.getSnapshot().sealed).toBe(false);
});

test('10,000 lots keep DOM marks bounded at both ends, while the default urn draws every entry', () => {
  expect(renderToStaticMarkup(<Urn entries={fixtureEntries()} />).match(/data-lot-dot=/g)).toHaveLength(87);
  for (const scroll_top of [0, 500 * 32]) {
    const markup = renderToStaticMarkup(<Urn entries={fixtureEntries(10000)} scroll_top={scroll_top} />);
    expect(markup).toContain('aria-rowcount="500"');
    expect(markup.match(/data-lot-dot=/g)?.length).toBeLessThanOrEqual(320);
    expect(markup.match(/<\w/g)?.length).toBeLessThan(400);
    expect(markup).toContain(scroll_top ? 'data-lot-dot="10000"' : 'data-lot-dot="1"');
    expect(markup).not.toContain(scroll_top ? 'data-lot-dot="1"' : 'data-lot-dot="10000"');
  }
});

test('generated lookup, preview states, shapes and stores preserve their model semantics', () => {
  const port = createLotsPreview(); const untouched = createLotsPreview();
  expect(port.getSnapshot().entries).toHaveLength(87);
  port.pause(); expect(port.getSnapshot().paused).toBe(true);
  port.pause(); expect(port.getSnapshot().paused).toBe(false);
  port.lookup(' @SIMULATED_00001 ');
  expect(lookupFixture(port.getSnapshot())).toContain(`${copy.lookup_found} 1`);
  port.lookup('simulated_cooldown'); expect(lookupFixture(port.getSnapshot())).toBe(copy.lookup_cooldown);
  port.lookup('absent'); expect(lookupFixture(port.getSnapshot())).toBe(copy.lookup_missing);
  for (const shape of copy.shapes) { port.shape(shape.value); expect(port.getSnapshot().shape).toBe(shape.value); }
  expect(untouched.getSnapshot().shape).toBe('urn');
});

test('saved simulated writ recomputes the fixed seal, commitment and winners without transport', async () => {
  const network = vi.spyOn(globalThis, 'fetch');
  try {
    expect(await recomputeFixture()).toEqual(fixtureWrit.winners);
    const port = createLotsPreview();
    await port.recompute(); expect(port.getSnapshot().notice).toBe(copy.recomputed);
    const digest = vi.spyOn(globalThis.crypto.subtle, 'digest').mockRejectedValue(new Error('Unavailable'));
    try { await port.recompute(); expect(port.getSnapshot().notice).toBe(copy.recompute_failed); expect(port.getSnapshot().recomputing).toBe(false); }
    finally { digest.mockRestore(); }
    expect(html()).toContain(fixtureWrit.seal);
    expect(network).not.toHaveBeenCalled();
  } finally { network.mockRestore(); }
});

test('lottery boundary has no transport, product prototype copy or em dash copy', () => {
  for (const file of ['rooms/lottery/index.tsx', 'rooms/lottery/session.ts', 'lots-model.ts', 'lots-fixture.ts']) {
    const source = readFileSync(new URL(`./${file}`, import.meta.url), 'utf8');
    expect(source).not.toMatch(/\b(fetch|invoke|WebSocket|XMLHttpRequest)\s*\(/);
    expect(source).not.toContain('core.js');
  }
  expect(readFileSync(new URL('./lots-copy.ts', import.meta.url), 'utf8')).not.toContain('\u2014');
});
