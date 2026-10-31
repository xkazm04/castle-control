import * as React from 'react';
import type { ChangeEvent, FocusEvent, InputHTMLAttributes, KeyboardEvent, ReactElement, ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, expect, test, vi } from 'vitest';
import { ProposalQueue } from '@castle-control/ui/steward';
import LotteryRoom from './index.jsx';
import { draftRoll, lotterySession, sealLotteryProposal } from './session.js';
import { createLotsPreview } from '../../lots-model.js';
import { fixtureDraws } from '../../lots-fixture.js';
import { createDrawDisplay } from './display.js';
import { DrawAppearance } from './appearance.jsx';

vi.mock('react', async importOriginal => ({ ...await importOriginal<typeof React>() }));
afterEach(() => vi.restoreAllMocks());

function revealInput(tree: ReactNode): ReactElement<InputHTMLAttributes<HTMLInputElement>> | undefined {
  let found: ReactElement<InputHTMLAttributes<HTMLInputElement>> | undefined;
  React.Children.forEach(tree, child => {
    if (found || !React.isValidElement<InputHTMLAttributes<HTMLInputElement>>(child)) return;
    if (child.props.id === 'lots-reveal') found = child;
    else found = revealInput(child.props.children);
  });
  return found;
}

// Node-only handler coverage: retain the input's local state between SSR probes.
// Event projections supply the native input values read by the real handlers.
function appearanceHarness() {
  const display = createDrawDisplay();
  let draft: unknown;
  const state = vi.spyOn(React, 'useState');
  const render = () => {
    state.mockReturnValue([draft, value => { draft = value; }]);
    let input: ReactElement<InputHTMLAttributes<HTMLInputElement>> | undefined;
    function Probe() { input = revealInput(DrawAppearance({ port: display })); return null; }
    renderToStaticMarkup(<Probe />);
    if (!input) throw new Error('Missing appearance probe');
    return input;
  };
  const target = (value: string) => ({ value, valueAsNumber: value === '' ? Number.NaN : Number(value) }) as HTMLInputElement;
  return { display, render,
    change(value: string) {
      render().props.onChange?.({ currentTarget: target(value) } as ChangeEvent<HTMLInputElement>);
    },
    commit(value: string, method: 'blur' | 'Enter') {
      const props = render().props;
      if (method === 'blur') props.onBlur?.({ currentTarget: target(value) } as FocusEvent<HTMLInputElement>);
      else {
        const event: Partial<KeyboardEvent<HTMLInputElement>> = {
          key: 'Enter', currentTarget: target(value), preventDefault: vi.fn(),
        };
        props.onKeyDown?.(event as KeyboardEvent<HTMLInputElement>);
      }
    },
  };
}

test.each(['blur', 'Enter'] as const)('reveal timing preserves 7, 75, 750 while typing and commits 750 on %s', method => {
  const h = appearanceHarness();
  for (const value of ['7', '75', '750']) {
    h.change(value);
    expect(String(h.render().props.value)).toBe(value);
    expect(h.display.getSnapshot().reveal_ms).toBe(1500);
  }
  h.commit('750', method);
  expect(h.display.getSnapshot().reveal_ms).toBe(750);
  expect(String(h.render().props.value)).toBe('750');
});

test('clearing reveal timing leaves the input empty until commit', () => {
  const h = appearanceHarness();
  h.change('');
  expect(h.render().props.value).toBe('');
  expect(h.display.getSnapshot().reveal_ms).toBe(1500);
  h.commit('', 'blur');
  expect(h.display.getSnapshot().reveal_ms).toBe(1500);
  expect(String(h.render().props.value)).toBe('1500');
});

test.each(['blur', 'Enter'] as const)('reveal timing clamps only on %s commit', method => {
  const h = appearanceHarness();
  for (const [value, expected] of [['999999', 10000], ['-20', 100]] as const) {
    const before = h.display.getSnapshot().reveal_ms;
    h.change(value);
    expect(String(h.render().props.value)).toBe(value);
    expect(h.display.getSnapshot().reveal_ms).toBe(before);
    h.commit(value, method);
    expect(h.display.getSnapshot().reveal_ms).toBe(expected);
    expect(String(h.render().props.value)).toBe(String(expected));
  }
});

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

test('an empty or impossible pool reports the problem without starting a cast', async () => {
  const port = createLotsPreview(0); await port.seal(); await port.start();
  expect(port.getSnapshot().started).toBe(false);
  expect(port.getSnapshot().notice).toContain('No generated entries');
  const normal = createLotsPreview();
  normal.edit({ ...normal.getSnapshot().draw, rules: { ...normal.getSnapshot().draw.rules,
    pool: { kind: 'keyword', keyword: '!absent' }, free_join_equal_odds: false } });
  expect(normal.getSnapshot().entries).toHaveLength(0);
  await normal.seal(); expect(normal.getSnapshot().sealed).toBe(false);
});

test('the sealed current roll yields distinct simulated winners and its own readable writ', async () => {
  const network = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('No transport in fixture'));
  try {
    const queue = new ProposalQueue(); const { port } = lotterySession(queue);
    draftRoll(queue); const proposal = queue.pending('lottery')[0];
    if (!proposal) throw new Error('Missing preview');
    await sealLotteryProposal(queue, proposal);
    const sealed = port.getSnapshot(); await port.start();
    const cast = room(queue);
    expect(cast).toContain('Current SIMULATED cast');
    expect(cast.match(/data-current-winner=/g)).toHaveLength(3);
    expect(cast).toContain('Read current simulated writ');
    port.nested(true);
    const writ = room(queue);
    expect(writ).toContain('Current simulated writ'); expect(writ).toContain('Not a cc-verify proof');
    expect(writ).toContain(lotterySession(queue).rolls.get(proposal.id)?.hash);
    await port.start(); expect(port.getSnapshot().entries).toBe(sealed.entries);
    expect(room(queue)).toContain('Current SIMULATED cast');
    expect(network).not.toHaveBeenCalled();
  } finally { network.mockRestore(); }
});

test('a new roll clears the current result while the old frozen writ stays separate', async () => {
  const queue = new ProposalQueue(); const { port } = lotterySession(queue);
  draftRoll(queue); const proposal = queue.pending('lottery')[0];
  if (!proposal) throw new Error('Missing preview');
  await sealLotteryProposal(queue, proposal); await port.start(); port.nested(true);
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
