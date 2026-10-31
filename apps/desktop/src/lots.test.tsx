import { readFileSync } from 'node:fs';
import { Children, isValidElement, useState, type ChangeEvent, type KeyboardEvent, type ReactNode } from 'react';
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
import { createCoreLotsPort } from './lots-core.js';
import { ConnectedLotsRoom } from './rooms/lottery/core.jsx';
import { castWinners, sealOf, verifyWrit } from './lots-cast.js';
import { createRevealClock } from './rooms/lottery/playback.js';
import { prepareFixtureRoll, rehearsalClock, rehearsalSeed } from './rooms/lottery/simulation.js';
type Control = { children?: ReactNode; type?: string; onClick?: () => void; onBlur?: () => void;
  onKeyDown?: (event: KeyboardEvent<HTMLInputElement>) => void;
  onChange?: (event: ChangeEvent<HTMLInputElement>) => void; value?: string | number };
function controls(tree: ReactNode): Control[] {
  const found: Control[] = [];
  Children.forEach(tree, child => {
    if (isValidElement<Control>(child)) found.push(child.props, ...controls(child.props.children));
  });
  return found;
}
async function coreRoom() {
  const draw = fixtureDraws[0];
  if (!draw) throw new Error('Missing simulated draw');
  const rpc = vi.fn(async (_endpoint: string, _session: string, method: string, params: unknown): Promise<unknown> => {
    if (method === 'lots.draw.list') return { draws: [draw] };
    if (method === 'lots.draw.check') return { result: 'ok', reasons: [] };
    if (method === 'lots.draw.upsert' && params && typeof params === 'object' && 'draw' in params) return params.draw;
    throw new Error('Simulated seal failure');
  });
  const port = createCoreLotsPort({ mode: 'core', endpoint: 'http://127.0.0.1:3210/', session_token: 'a'.repeat(64) }, { rpc });
  await port.load(); return { port, rpc };
}
test('lots-01 core controls have standalone labels with exact names', async () => {
  const { port } = await coreRoom(); const markup = renderToStaticMarkup(<ConnectedLotsRoom port={port} />);
  expect(markup.match(/<label[^>]*>[^<]*<(select|input)/g) ?? []).toHaveLength(0);
  for (const name of ['Draw', 'Number of winners']) {
    const labels = [...markup.matchAll(/<label for="([^"]+)">([^<]*)<\/label>/g)].filter(match => match[2] === name);
    expect(labels).toHaveLength(1); expect(markup.split(`id="${labels[0]?.[1]}"`)).toHaveLength(2);
  }
});
test('lots-01 round-source paragraph has no prohibited name', async () => {
  const { port } = await coreRoom(); const markup = renderToStaticMarkup(<ConnectedLotsRoom port={port} />);
  expect(markup).not.toMatch(/<p[^>]*aria-label="Round source"/);
});
test.each([['blur', '1'], ['Enter', '1'], ['blur', ''], ['blur', '0']] as const)(
  'lots-01 commits only the final 12 on %s after typing %j', async (method, first) => {
  const { port, rpc } = await coreRoom();
  function Sequence() {
    const [step, setStep] = useState(0); const tree = ConnectedLotsRoom({ port });
    const input = controls(tree).find(control => control.type === 'number');
    if (!input) throw new Error('Missing winner input');
    if (step < 2) {
      const value = step ? '12' : first;
      input.onChange?.({ currentTarget: { value, valueAsNumber: Number(value) } } as ChangeEvent<HTMLInputElement>);
      setStep(step + 1);
    } else if (step === 2) {
      expect(input.value).toBe('12'); expect(rpc.mock.calls.filter(call => call[2] === 'lots.draw.upsert')).toHaveLength(0);
      if (method === 'blur') input.onBlur?.();
      else input.onKeyDown?.({ key: 'Enter', preventDefault: vi.fn() } as Partial<KeyboardEvent<HTMLInputElement>> as KeyboardEvent<HTMLInputElement>);
      input.onBlur?.(); setStep(3);
    }
    return tree;
  }
  renderToStaticMarkup(<Sequence />);
  await vi.waitFor(() => expect(port.getSnapshot().busy).toBe(false));
  const saves = rpc.mock.calls.filter(call => call[2] === 'lots.draw.upsert');
  expect(saves).toHaveLength(1); expect(saves[0]?.[3]).toMatchObject({ draw: { rules: { winner_count: 12 } } });
});
test('lots-03 uncertain seal shows a persistent reconciliation alert despite its error notice', async () => {
  const { port } = await coreRoom(); await port.seal();
  expect(port.getSnapshot()).toMatchObject({ locked: true, sealed: false });
  const markup = renderToStaticMarkup(<ConnectedLotsRoom port={port} />);
  expect(markup).toMatch(/role="alert"[^>]*>[^<]*locked[^<]*reconciled in the core/);
});
test('lots-11 Draft a new roll preserves custom setup and template selection still resets it', async () => {
  const queue = new ProposalQueue(); const { port } = lotterySession(queue); const draw = port.getSnapshot().draw;
  port.edit({ ...draw, name: 'Custom roll', rules: { ...draw.rules, winner_count: 4, cohort_caps: [] } });
  draftRoll(queue); await sealLotteryProposal(queue, current(queue)); await port.start();
  function ClickDraft() {
    const tree = LotteryRoom({ snapshot, replay: false, queue });
    const button = controls(tree).find(control => control.children === copy.draft_new);
    if (!button?.onClick) throw new Error('Missing new-roll button');
    button.onClick(); return null;
  }
  renderToStaticMarkup(<ClickDraft />);
  expect(port.getSnapshot()).toMatchObject({ draw: { name: 'Custom roll', rules: { winner_count: 4 } }, sealed: false });
  expect(current(queue).title).toBe('Custom roll');
  expect(port.getSnapshot().draw).toEqual({ ...draw, name: 'Custom roll', rules: { ...draw.rules, winner_count: 4, cohort_caps: [] } });
  expect(port.getSnapshot()).toMatchObject({ paused: false, started: false, nested: false });
  expect(port.getSnapshot().writ).toBeUndefined(); expect(port.getSnapshot().sealed_roll).toBeUndefined();
  port.select(draw.draw_id); expect(port.getSnapshot().draw).toEqual(draw);
});
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
  const styles = readFileSync(new URL('./rooms/lottery/room.css', import.meta.url), 'utf8');
  expect(styles).toContain('.cc-writ-fields s { color: var(--gules-text)');
  expect(styles).toContain('@keyframes lottery-ink');
  expect(styles).toContain('.cc-writ-fields ins { animation: none; }');
});
test('room inks the pending writ and restores templates after it is torn up', async () => {
  const queue = new ProposalQueue();
  expect(html(queue)).toContain('Writ templates');
  expect(html(queue)).toContain('Questions for the hall');
  const steward = new SimulatedSteward(queue);
  await steward.ask('draft a question draw', { surface: 'overview' });
  await steward.ask('make it 5 winners', { surface: 'overview' });
  const markup = html(queue);
  expect(markup).toContain('cc-ticket cc-writ');
  expect(markup).toContain('<s>3</s><ins>5</ins>');
  expect(markup).toContain('revision 2');
  expect(markup).not.toContain('Writ templates');
  expect(markup).not.toContain('generated fixtures only');
  expect(lotterySession(queue).port.getSnapshot().sealed).toBe(false);
  queue.tearUp(current(queue).id);
  expect(html(queue)).toContain('Writ templates');
});
test('a pending writ takes the workbench even if an older sealed writ is selected', async () => {
  const queue = new ProposalQueue(); draftRoll(queue);
  const old = current(queue);
  await sealLotteryProposal(queue, old);
  draftRoll(queue);
  queue.select(old.id);
  expect(html(queue)).toContain('Proposal · not sealed');
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
    expect(html(queue)).toContain('Writ templates');
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
    await port.seal(); await port.start();
    expect(port.getSnapshot().started).toBe(false);
    let draw = port.getSnapshot().draw;
    port.edit({ ...draw, policy: { ...draw.policy, [first]: true } });
    await expect(sealLotteryProposal(queue, proposal)).rejects.toThrow('guardrails');
    expect(port.getSnapshot().sealed).toBe(false);
    draw = port.getSnapshot().draw;
    port.edit({ ...draw, policy: { ...draw.policy, [second]: true } });
    await sealLotteryProposal(queue, proposal);
    expect(port.getSnapshot().sealed).toBe(true);
    await port.start(); expect(port.getSnapshot().started).toBe(true);
    const blocked = new ProposalQueue();
    const paid = lotterySession(blocked).port;
    paid.select('paid-prize'); draftRoll(blocked);
    expect(html(blocked)).toContain(copy.reasons.paid_weight);
    await expect(sealLotteryProposal(blocked, current(blocked))).rejects.toThrow('guardrails');
    await paid.seal(); await paid.start();
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
  const { port } = lotterySession(queue);
  await port.start();
  expect(port.getSnapshot().writ?.winners).toHaveLength(3);
  expect(port.getSnapshot().writ?.winners.every(handle => roll?.entries.some(entry => entry.handle === handle && entry.cohort !== 'raider'))).toBe(true);
});
test('sealed v1 rehearsal is immutable, appears on this ticket, and recomputes this cast', async () => {
  const queue = new ProposalQueue(); draftRoll(queue);
  const session = lotterySession(queue); const { port } = session;
  expect(current(queue).fields.find(field => field.key === 'cap')?.value).toBe('1/3 of winners');
  const proposal = current(queue);
  await sealLotteryProposal(queue, proposal);
  const frozen = session.rolls.get(proposal.id);
  if (!frozen) throw new Error('Missing v1 roll');
  expect(frozen.roll.version).toBe(1);
  expect(frozen.roll.sealed_at).toBe('2026-10-31T12:00:00Z');
  expect(await sealOf(frozen.roll)).toBe(frozen.seal);
  expect(html(queue)).toContain('Cast the lots · rehearsal');
  expect(html(queue)).not.toContain('Draft a new roll');
  await Promise.all([port.start(), port.start()]);
  const writ = port.getSnapshot().writ;
  if (!writ) throw new Error(`Missing rehearsal writ: ${port.getSnapshot().notice}`);
  expect(writ.roll).toBe(frozen.roll);
  expect(writ.winners.every(handle => frozen.entries.some(entry => entry.handle === handle))).toBe(true);
  expect(await verifyWrit(writ)).toEqual(writ.winners);
  expect(Object.isFrozen(writ)).toBe(true); expect(Object.isFrozen(writ.winners)).toBe(true);
  expect(Object.isFrozen(writ.roll.entries[0])).toBe(true);
  await port.start(); expect(port.getSnapshot().writ).toBe(writ);
  expect(port.getSnapshot().notice).toBe(copy.cast_fixed);
  const markup = html(queue);
  expect(markup).toContain('Draft a new roll'); expect(markup).toContain('Recompute this cast');
  for (const handle of writ.winners) expect(markup).toContain(handle);
  await port.recompute(); expect(port.getSnapshot().notice).toBe(copy.cast_match);
  await port.recompute(true); expect(port.getSnapshot().notice).toBe(copy.recomputed);
});
test('draft cap and prize come from the selected draw rather than fixture literals', () => {
  const queue = new ProposalQueue(); const { port } = lotterySession(queue);
  port.select('free-prize');
  const draw = port.getSnapshot().draw;
  port.edit({ ...draw, rules: { ...draw.rules, cohort_caps: [{ cohort: 'raider', numerator: 1, denominator: 2 }] } });
  draftRoll(queue);
  expect(current(queue).fields.find(field => field.key === 'cap')?.value).toBe('1/2 of winners');
  expect(current(queue).fields.find(field => field.key === 'prize')?.value).toBe('Prize example');
  port.select('hall-questions'); draftRoll(queue);
  expect(current(queue).fields.find(field => field.key === 'prize')?.value).toBe('none');
});
test('urn marks exactly the revealed winners in SVG and keeps a windowed winner visible', () => {
  const entries = fixtureEntries(400); const first = entries[0]; const second = entries[1];
  if (!first || !second) throw new Error('Missing simulated marks');
  const markup = renderToStaticMarkup(<Urn entries={entries.slice(0, 87)} winners={[first.handle, second.handle]} revealed={1} />);
  expect(markup.match(/data-winner="1"/g)).toHaveLength(1);
  expect(markup).not.toContain('data-winner="2"');
  expect(markup).toContain('lottery-winner-badge');
  const windowed = renderToStaticMarkup(<Urn entries={entries} winners={[first.handle, second.handle]} revealed={1} />);
  expect(windowed).toContain('lottery-urn-window'); expect(windowed).toContain('data-winner="1"');
  expect(windowed).not.toContain('data-winner="2"');
  const last = entries.at(-1);
  if (!last) throw new Error('Missing offscreen simulated winner');
  expect(renderToStaticMarkup(<Urn entries={entries} winners={[last.handle]} revealed={1} />))
    .toContain(`data-revealed-winner="1"><b>1.</b> ${last.handle}`);
});
test('session reveal cursor resumes the same cast and resets for a new roll', async () => {
  const queue = new ProposalQueue(); draftRoll(queue);
  const { port } = lotterySession(queue); await sealLotteryProposal(queue, current(queue)); await port.start();
  const clock = createRevealClock(); const writ = port.getSnapshot().writ;
  clock.tick(writ, 100, false); expect(clock.getSnapshot()).toBe(0);
  clock.tick(writ, 1300, false); expect(clock.getSnapshot()).toBe(1);
  clock.tick(writ, 2200, false); expect(clock.getSnapshot()).toBe(2);
  clock.tick(writ, 3100, true); expect(clock.getSnapshot()).toBe(3);
  clock.tick(writ, 3101, false); expect(clock.getSnapshot()).toBe(3);
  clock.tick(undefined, 3200, false); expect(clock.getSnapshot()).toBe(0);
});
test('a v1 outcome exceeding a cohort cap is refused without resealing or rerolling', async () => {
  const port = createLotsPreview(); const before = port.getSnapshot();
  const sealed = await prepareFixtureRoll(before.draw, before.entries, rehearsalClock());
  const winners = await castWinners(rehearsalSeed, sealed.seal, sealed.roll);
  const cohort = before.entries.find(entry => entry.handle === winners[0])?.cohort;
  if (!cohort) throw new Error('Missing simulated cohort');
  port.edit({ ...before.draw, rules: { ...before.draw.rules, cohort_caps: [{ cohort, numerator: 0, denominator: 1 }] } });
  await port.seal();
  const roll = port.getSnapshot().sealed_roll;
  expect(roll?.seal).toBe(sealed.seal); // Caps do not change the v1 proof bytes.
  await port.start(); await port.start();
  expect(port.getSnapshot().writ).toBeUndefined(); expect(port.getSnapshot().started).toBe(false);
  expect(port.getSnapshot().notice).toBe(copy.cast_cap);
  expect(port.getSnapshot().sealed_roll).toBe(roll);
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
test('lots-07 paused intake is visible, pressed and holds entries until resumed', async () => {
  const queue = new ProposalQueue(); const { port } = lotterySession(queue); const before = port.getSnapshot().entries;
  port.pause(); const markup = html(queue); expect(markup).toContain(copy.paused);
  const toggle = markup.match(/<button\b[^>]*>[\s\S]*?<\/button>/g)?.find(button => button.includes(copy.resume));
  expect(toggle).toContain('aria-pressed="true"'); const draw = port.getSnapshot().draw;
  port.edit({ ...draw, rules: { ...draw.rules, pool: { kind: 'subscribers' } } }); expect(port.getSnapshot().entries).toBe(before);
  expect(port.getSnapshot().entries).toHaveLength(before.length); expect(port.getSnapshot().notice).toContain('Resume intake');
  await port.seal(); expect(port.getSnapshot().sealed).toBe(false); port.pause();
  expect(port.getSnapshot().entries.length).toBeLessThan(before.length); expect(html(queue)).toContain(copy.open);
  expect(html(queue)).toMatch(/<button[^>]*aria-pressed="false"[^>]*>Pause intake/); await port.seal(); expect(port.getSnapshot().sealed).toBe(true);
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
