import { readFileSync } from 'node:fs';
import { Children, isValidElement } from 'react';
import type { ButtonHTMLAttributes, ChangeEvent, InputHTMLAttributes, ReactElement, ReactNode } from 'react';
import { renderToReadableStream, renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import { LotsContent, LotsDotField, LotsHero, LotsPage, LotsSetup, LotsWritView } from './lots-page.jsx';
import { checkFixturePolicy, createLotsPreview, lookupFixture, recomputeFixture } from './lots-model.js';
import { fixtureDraws, fixtureEntries, fixtureWrit } from './lots-fixture.js';
import { lotsCopy as copy } from './lots-copy.js';
import { DesktopView } from './view.jsx';
import { simulatedRead } from './simulated.js';
import { dispatchShortcut } from './navigation.js';
import type { ModuleId } from '@castle-control/ui';
import type { CheckResult, LotsDrawPolicy } from '@castle-control/contract';

function find<T>(tree: ReactNode, predicate: (props: T & { children?: ReactNode; 'aria-label'?: string }) => boolean): ReactElement<T> {
  let found: ReactElement<T> | undefined;
  const visit = (node: ReactNode) => Children.forEach(node, child => {
    if (!isValidElement<T & { children?: ReactNode; 'aria-label'?: string }>(child)) return;
    if (predicate(child.props)) found = child;
    else visit(child.props.children);
  });
  visit(tree);
  if (!found) throw new Error('Missing fixture control');
  return found;
}
const props = (port: ReturnType<typeof createLotsPreview>) => ({ port, snapshot: port.getSnapshot() });
const html = (port: ReturnType<typeof createLotsPreview>) => renderToStaticMarkup(<LotsPage port={port} />);
function button(tree: ReactNode, text: string) {
  return find<ButtonHTMLAttributes<HTMLButtonElement>>(tree, item => item.children === text).props;
}
function toggle(port: ReturnType<typeof createLotsPreview>, label: string, checked: boolean) {
  const field = find<InputHTMLAttributes<HTMLInputElement>>(LotsSetup(props(port)), item => item['aria-label'] === label);
  field.props.onChange?.({ currentTarget: { checked } } as ChangeEvent<HTMLInputElement>);
}

test('hero shows the generated roll, numbered tickets, cohorts, open/pause/sealed state and cooldown', () => {
  const port = createLotsPreview();
  const initial = html(port);
  for (const text of ['87', copy.open, copy.cooldown, copy.pool, '001', copy.cohorts.subscriber, copy.cohorts.raider]) expect(initial).toContain(text);
  button(LotsHero(props(port)), copy.pause).onClick?.({} as Parameters<NonNullable<ButtonHTMLAttributes<HTMLButtonElement>['onClick']>>[0]);
  expect(html(port)).toContain(copy.paused);
  port.pause();
  expect(html(port)).toContain(copy.open);
  port.seal();
  expect(html(port)).toContain(copy.sealed);
  const sealed = port.getSnapshot().draw;
  port.edit({ ...sealed, name: 'Changed after seal' });
  expect(port.getSnapshot().draw).toBe(sealed);
  port.start();
  expect(port.getSnapshot().started).toBe(true);
});

test('handle lookup uses the actual input handler, normalises @ and case, and distinguishes cooldown and absence', () => {
  const port = createLotsPreview();
  const input = find<InputHTMLAttributes<HTMLInputElement>>(LotsContent(props(port)), item => item['aria-label'] === copy.lookup);
  input.props.onChange?.({ currentTarget: { value: ' @SIMULATED_00001 ' } } as ChangeEvent<HTMLInputElement>);
  expect(lookupFixture(port.getSnapshot())).toContain(`${copy.lookup_found} 1`);
  port.lookup('simulated_cooldown');
  expect(html(port)).toContain(copy.lookup_cooldown);
  port.lookup('not_a_fixture');
  expect(html(port)).toContain(copy.lookup_missing);
});

test.each([['disclaimer', 'template'], ['template', 'disclaimer']] as const)('prize draw stays blocked until %s and %s are both present', (first, second) => {
  const port = createLotsPreview();
  port.select('free-prize');
  const disabled = () => button(LotsSetup(props(port)), copy.start).disabled;
  expect(disabled()).toBe(true);
  port.seal(); port.start();
  expect(port.getSnapshot().started).toBe(false);
  toggle(port, copy[first], true);
  expect(button(LotsHero(props(port)), copy.seal).disabled).toBe(true);
  port.seal(); port.start();
  expect(port.getSnapshot().sealed).toBe(false);
  toggle(port, copy[second], true);
  expect(button(LotsHero(props(port)), copy.seal).disabled).toBe(false);
  port.seal();
  expect(disabled()).toBe(false);
  port.start();
  expect(port.getSnapshot().started).toBe(true);
});

test('paid-weight prize stays blocked even with rules and disclaimer; no start or risk bypass', () => {
  const port = createLotsPreview();
  port.select('paid-prize');
  expect(html(port)).toContain(copy.reasons.paid_weight);
  expect(html(port)).toContain(copy.paid_blocked);
  expect(button(LotsSetup(props(port)), copy.start).disabled).toBe(true);
  port.seal(); port.start();
  expect(port.getSnapshot().sealed).toBe(false);
  expect(port.getSnapshot().started).toBe(false);
});

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

test('10,000 lots keep DOM dots and total nodes bounded at both the first and last window', () => {
  const entries = fixtureEntries(10_000);
  for (const scroll_top of [0, 500 * 32]) {
    const markup = renderToStaticMarkup(<LotsDotField entries={entries} scroll_top={scroll_top} />);
    expect(markup).toContain('aria-rowcount="500"');
    expect(markup.match(/data-lot-dot=/g)?.length).toBeGreaterThan(0);
    expect(markup.match(/data-lot-dot=/g)?.length).toBeLessThanOrEqual(320);
    expect(markup.match(/<\w/g)?.length).toBeLessThan(400);
    expect(markup).toContain(scroll_top ? 'data-lot-dot="10000"' : 'data-lot-dot="1"');
    expect(markup).not.toContain(scroll_top ? 'data-lot-dot="1"' : 'data-lot-dot="10000"');
  }
  const page = html(createLotsPreview(10_000));
  expect(page.match(/<\w/g)?.length).toBeLessThan(800);
});

test('saved writ is nested with Back; recompute checks the fixed seal, commitment and winners without transport', async () => {
  const network = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('No network allowed'));
  try {
    const port = createLotsPreview();
    const open = button(LotsContent(props(port)), copy.writ_open);
    open.onClick?.({} as Parameters<NonNullable<typeof open.onClick>>[0]);
    expect(html(port)).toContain(copy.writ_notice);
    expect(html(port)).toContain(fixtureWrit.seal);
    expect(html(port)).not.toContain(copy.hero);
    expect(await recomputeFixture()).toEqual(fixtureWrit.winners);
    await port.recompute();
    expect(html(port)).toContain(copy.recomputed);
    expect(network).not.toHaveBeenCalled();
    const back = button(LotsWritView(props(port)), copy.back);
    back.onClick?.({} as Parameters<NonNullable<typeof back.onClick>>[0]);
    expect(html(port)).toContain(copy.hero);
  } finally { network.mockRestore(); }
});

test('recompute failure is visible and never reports success', async () => {
  const digest = vi.spyOn(globalThis.crypto.subtle, 'digest').mockRejectedValue(new Error('Crypto unavailable'));
  try {
    const port = createLotsPreview();
    await port.recompute();
    expect(port.getSnapshot().notice).toBe(copy.recompute_failed);
    expect(port.getSnapshot().recomputing).toBe(false);
  } finally { digest.mockRestore(); }
});

test('key 1 reaches lazy fixture page; core mode excludes its controls and proof', async () => {
  let current: ModuleId = 'studio';
  let prevented = false;
  dispatchShortcut({ key: '1', preventDefault: () => { prevented = true; } }, false, id => { current = id; }, () => undefined);
  expect(prevented).toBe(true);
  expect(current).toBe('lottery');
  const view = { current, theme: 'paper', on_navigate: () => undefined, on_theme_change: () => undefined, search: '', on_search: () => undefined } as const;
  const stream = await renderToReadableStream(<DesktopView {...view} snapshot={{ mode: 'fixture', phase: 'ready', ...simulatedRead(1) }} />);
  await stream.allReady;
  const markup = await new Response(stream).text();
  for (const text of [copy.fairness, copy.seal, copy.lookup, copy.writ_open, copy.notice]) expect(markup).toContain(text);
  expect(markup).toContain('type="search"');
  const core = renderToStaticMarkup(<DesktopView {...view} snapshot={{ mode: 'core', phase: 'connecting' }} />);
  expect(core).not.toContain('data-lot-dot');
  expect(core).not.toContain(copy.start);
});

test('shape choices change static label and glyph only; fixture stores are isolated', () => {
  const port = createLotsPreview();
  const untouched = createLotsPreview();
  for (const shape of copy.shapes) {
    const control = button(LotsContent(props(port)), shape.label);
    control.onClick?.({} as Parameters<NonNullable<typeof control.onClick>>[0]);
    expect(port.getSnapshot().shape).toBe(shape.value);
    expect(html(port)).toContain(`aria-label="${shape.label}"`);
  }
  expect(untouched.getSnapshot().shape).toBe('urn');
});

test('fixture boundary stays types-only and copy has no em dashes', () => {
  for (const file of ['page.tsx', 'model.ts', 'fixture.ts']) {
    const source = readFileSync(new URL(`./lots-${file}`, import.meta.url), 'utf8');
    expect(source).not.toMatch(/\b(fetch|invoke|WebSocket|XMLHttpRequest|parseMethodParams)\s*\(/);
    expect(source).not.toMatch(/from ['"].*(?:generated\/|client|core-source|renderer)/);
    expect(source).not.toMatch(/import\s*\{[^}]+\}\s*from ['"]@castle-control\/contract/);
  }
  expect(readFileSync(new URL('./lots-copy.ts', import.meta.url), 'utf8')).not.toContain('\u2014');
});
