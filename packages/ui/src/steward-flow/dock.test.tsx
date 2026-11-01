import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
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

test('collapsed dock: region, plate with SIMULATED, one Steward line, the input and quick chips', () => {
  const html = renderToStaticMarkup(<StewardDock chamber="keep" registry={registry} store={createDockStore()} />);
  expect(html).toContain('aria-label="The Steward"');
  expect(html).toContain('<span class="cc-sim">Simulated</span>');
  expect(html).toContain('<p class="cc-talk__msg">Good evening. Nothing acts until you hold.</p>');
  expect(html.match(/aria-label="Talk to the Steward\.\.\."/g)).toHaveLength(1);
  expect(html).toContain('>Pick tonight&#x27;s theme</button>');
  expect(html).toContain('>Catch me up</button>');
  expect(html).not.toContain('cc-steward-sheet');
  expect(html).toContain('aria-live="polite"');
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
