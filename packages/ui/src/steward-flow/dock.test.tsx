import { Children, isValidElement } from 'react';
import type { ChangeEvent, FocusEvent, InputHTMLAttributes, KeyboardEvent, ReactElement, ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import { defineFlow } from './flow.js';
import type { ChamberSteward, StewardRegistry } from './registry.js';
import { createDockStore } from './store.js';
import { StewardDock } from './dock.jsx';

const theme = defineFlow<{ theme?: string }>({
  id: 'theme', chamber: 'keep', title: "Pick tonight's theme", chip: "Pick tonight's theme", simulated: true, intro: 'Choose the dressing.',
  initial: () => ({}),
  steps: [
    { id: 'theme', kind: 'choice', label: 'Theme', prompt: 'Which theme?',
      options: () => [{ id: 'altar', label: 'Offering altar', consequence: 'Points light it' }, { id: 'frame', label: 'Gilded frame' }],
      apply: (draft, id) => ({ ...draft, theme: id }) },
    { id: 'seal', kind: 'confirm', label: 'Seal', prompt: 'Hold to seal it.', lines: draft => [{ label: 'Theme', value: draft.theme ?? '' }] },
  ],
  seal: () => ({ say: 'Sealed.' }),
});
const empty: ChamberSteward = { name: 'x', greeting: 'x', flows: [] };
const registry: StewardRegistry = {
  keep: { name: 'the Keep', greeting: 'Good evening. Nothing acts until you hold.', flows: [theme], catch_up: () => ({ say: 'Quiet.' }) },
  lottery: empty, moderator: empty, visuals: empty, studio: empty, stream: empty, rehearsal: empty,
};

test('collapsed dock: one bar with identity, SIMULATED, input, slash hint and quick chips', () => {
  const html = renderToStaticMarkup(<StewardDock chamber="keep" registry={registry} store={createDockStore()} />);
  expect(html).toContain('aria-label="The Steward"');
  expect(html).toContain('<span class="cc-sim">Simulated</span>');
  expect(html).toContain('data-role="steward-bar"');
  expect(html).toContain('<kbd class="cc-talk-hint">/</kbd>');
  expect(html.match(/aria-label="Talk to the Steward\.\.\."/g)).toHaveLength(1);
  expect(html).toContain('>Pick tonight&#x27;s theme</button>');
  expect(html).toContain('>Catch me up</button>');
  expect(html).not.toContain('cc-steward-sheet');
  expect(html).toContain('aria-live="polite"');
  const store = createDockStore();
  store.expand();
  expect(renderToStaticMarkup(<StewardDock chamber="keep" registry={registry} store={store} />)).toContain('Good evening. Nothing acts until you hold.');
});

test('live mode drops SIMULATED from the plate', () => {
  const html = renderToStaticMarkup(<StewardDock chamber="keep" registry={registry} mode="live" store={createDockStore()} />);
  expect(html).toContain('Live Steward');
  expect(html).not.toContain('sample data');
});

test('expanded mid-flow: one active card, answered chips reopenable, confirm holds to seal with SIMULATED', () => {
  const store = createDockStore();
  store.open(theme);
  let html = renderToStaticMarkup(<StewardDock chamber="keep" registry={registry} store={store} />);
  expect(html).toContain('cc-steward-sheet');
  expect(html).toContain('Choose the dressing.');
  expect(html).toContain('role="group" aria-label="Which theme?"');
  expect(html).toContain('Points light it');
  expect(html).not.toContain('Hold to seal');
  store.answer('keep', 'altar');
  html = renderToStaticMarkup(<StewardDock chamber="keep" registry={registry} store={store} />);
  expect(html).toContain('aria-label="Change Theme"');
  expect(html).toContain('Theme · Offering altar');
  expect(html).toContain('aria-label="Hold to seal"');
  expect(html).not.toContain('aria-label="Which theme?"');
  expect(html.match(/cc-steward-step"/g)).toHaveLength(1);
  expect(html.match(/class="cc-sim"/g)?.length).toBeGreaterThanOrEqual(3);
  store.collapse();
  html = renderToStaticMarkup(<StewardDock chamber="keep" registry={registry} store={store} />);
  expect(html).not.toContain('cc-steward-sheet');
  expect(html).toContain('Resume · Pick tonight&#x27;s theme');
});

test('another chamber does not show this chamber\'s session', () => {
  const store = createDockStore();
  store.open(theme);
  const html = renderToStaticMarkup(<StewardDock chamber="lottery" registry={registry} store={store} />);
  expect(html).not.toContain('Which theme?');
});

test('the sheet header offers Back, Start over and Lower only', () => {
  const store = createDockStore();
  store.open(theme);
  const html = renderToStaticMarkup(<StewardDock chamber="keep" registry={registry} store={store} />);
  for (const label of ['>Back<', '>Start over<', 'Lower <kbd']) expect(html).toContain(label);
  expect(html).not.toContain('Put away');
});

test('flows beyond the quick chips sit behind a keyboard-reachable "More flows" menu button', () => {
  const extra = (n: number) => ({ ...theme, id: `extra-${n}`, title: `Extra flow ${n}`, chip: `Extra ${n}` });
  const crowded: StewardRegistry = { ...registry, keep: { ...registry.keep, flows: [theme, extra(1), extra(2), extra(3)] } };
  const html = renderToStaticMarkup(<StewardDock chamber="keep" registry={crowded} store={createDockStore()} />);
  expect(html).toContain('aria-haspopup="menu"');
  expect(html).toContain('aria-expanded="false"');
  expect(html).toContain('More flows');
  const quiet = renderToStaticMarkup(<StewardDock chamber="keep" registry={registry} store={createDockStore()} />);
  expect(quiet).not.toContain('More flows');
});

test('real input handlers open chat on focus and typing; root Escape peels popover before chat', () => {
  const store = createDockStore();
  let dock: ReturnType<typeof StewardDock> | undefined;
  let input: ReactElement<InputHTMLAttributes<HTMLInputElement>> | undefined;
  function inspect(node: ReactNode) {
    Children.forEach(node, child => {
      if (!isValidElement<{ children?: ReactNode }>(child)) return;
      if (child.type === 'input' && isValidElement<InputHTMLAttributes<HTMLInputElement>>(child)) input = child;
      inspect(child.props.children);
    });
  }
  function Probe() { dock = StewardDock({ chamber: 'keep', registry, store }); inspect(dock); return dock; }
  renderToStaticMarkup(<Probe />);
  if (!dock || !input) throw new Error('Missing dock controls');
  // Focus is the shell's slash dispatch target; typing uses the same opening path.
  input.props.onFocus?.({} as FocusEvent<HTMLInputElement>);
  expect(store.getSnapshot().expanded).toBe(true);
  store.collapse();
  input.props.onChange?.({ currentTarget: { value: 'simulated text' } } as ChangeEvent<HTMLInputElement>);
  expect(store.getSnapshot().expanded).toBe(true);
  store.popover('flows');
  const event = { key: 'Escape', preventDefault: vi.fn(), stopPropagation: vi.fn() } as Partial<KeyboardEvent<HTMLElement>>;
  dock.props.onKeyDown(event as KeyboardEvent<HTMLElement>);
  expect(store.getSnapshot().popover).toBeUndefined(); expect(store.getSnapshot().expanded).toBe(true);
  dock.props.onKeyDown(event as KeyboardEvent<HTMLElement>);
  expect(store.getSnapshot().expanded).toBe(false);
  expect(event.stopPropagation).toHaveBeenCalledTimes(2);
});

test('talk input Escape peels one layer without refocusing or changing text, then falls through', () => {
  const store = createDockStore();
  let input: ReactElement<InputHTMLAttributes<HTMLInputElement>> | undefined;
  function inspect(node: ReactNode) {
    Children.forEach(node, child => {
      if (!isValidElement<{ children?: ReactNode }>(child)) return;
      if (child.type === 'input' && isValidElement<InputHTMLAttributes<HTMLInputElement>>(child)) input = child;
      inspect(child.props.children);
    });
  }
  function Probe() { const dock = StewardDock({ chamber: 'keep', registry, store }); inspect(dock); return dock; }
  renderToStaticMarkup(<Probe />);
  if (!input?.props.onKeyDown) throw new Error('Missing talk input Escape handler');
  const field = { value: 'Keep this unsent SIMULATED note', focus: vi.fn() };
  const event = () => Object.assign({} as KeyboardEvent<HTMLInputElement>,
    { key: 'Escape', currentTarget: field, target: field, preventDefault: vi.fn(), stopPropagation: vi.fn() });
  store.expand(); store.popover('flows');
  const popover = event(); input.props.onKeyDown(popover);
  expect(store.getSnapshot().popover).toBeUndefined(); expect(store.getSnapshot().expanded).toBe(true);
  const conversation = event(); input.props.onKeyDown(conversation);
  expect(store.getSnapshot().expanded).toBe(false);
  expect(conversation.preventDefault).toHaveBeenCalledOnce(); expect(conversation.stopPropagation).toHaveBeenCalledOnce();
  expect(field.value).toBe('Keep this unsent SIMULATED note'); expect(field.focus).not.toHaveBeenCalled();
  const next = event(); input.props.onKeyDown(next);
  expect(next.preventDefault).not.toHaveBeenCalled(); expect(next.stopPropagation).not.toHaveBeenCalled();
});
