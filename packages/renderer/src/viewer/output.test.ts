import { expect, it } from 'vitest';
import * as viewer from './controls.ts';

it.each(['min-height', 'min-width'])('keeps a token-based touch %s on every viewer button at 318 × 500', (dimension) => {
  const initial = viewer.createViewerControls({ options: ['A'],
    tiles: [{ q: 0, r: 0 }, { q: 1, r: 0 }], sides: ['N'] });
  const selected = viewer.reduceViewerControls(viewer.reduceViewerControls(
    viewer.reduceViewerControls(initial, { kind: 'vote', option_index: 0 }),
    { kind: 'pick_tile', q: 1, r: 0 }), { kind: 'join_side', side: 'N' });
  for (const state of [initial, selected]) {
    const markup = viewer.renderViewerPanel(state, { width: 318, height: 500 });
    const buttons = markup.match(/<button\b[^>]*>/g) ?? [];
    expect(buttons).toHaveLength(4);
    for (const button of buttons) {
      expect(button).toContain(`${dimension}:calc(var(--space-40) + var(--space-4))`);
    }
  }
});

it('tile buttons use A1 labels', () => {
  for (const [tiles, labels] of [
    [[{ q: 0, r: 0 }, { q: 1, r: 0 }], ['A1', 'B1']],
    [[{ q: 0, r: -1 }, { q: -1, r: 0 }], ['A1', 'A2']],
    [[{ q: 0, r: 0 }, { q: 26, r: 0 }], ['A1', 'AA1']],
  ] as const) {
    const state = viewer.createViewerControls({ options: [], tiles, sides: [] });
    const markup = viewer.renderViewerPanel(state);
    const buttons = markup.match(/<button[^>]*data-viewer-choice="pick_tile"[^>]*>[\s\S]*?<\/button>/g) ?? [];
    expect(buttons).toHaveLength(labels.length);
    labels.forEach((label, index) => expect(buttons[index]).toContain(`>Tile ${label}</button>`));
    expect(markup).not.toContain('Tile 0,0');
    expect(markup).not.toMatch(/Tile -?\d+,-?\d+/);
  }
});

it('selected mark is not part of the accessible name', () => {
  const initial = viewer.createViewerControls({ options: ['Simulated choice'],
    tiles: [{ q: 0, r: 0 }, { q: 1, r: 0 }], sides: ['Simulated north'] });
  const selected = viewer.reduceViewerControls(viewer.reduceViewerControls(
    viewer.reduceViewerControls(initial, { kind: 'vote', option_index: 0 }),
    { kind: 'pick_tile', q: 1, r: 0 }), { kind: 'join_side', side: 'Simulated north' });
  const markup = viewer.renderViewerPanel(selected);
  const buttons = markup.match(/<button[^>]*aria-pressed="true"[^>]*>[\s\S]*?<\/button>/g) ?? [];
  expect(buttons).toHaveLength(3);
  for (const [index, label] of ['Simulated choice', 'Tile B1', 'Simulated north'].entries()) {
    const button = buttons[index];
    expect(button).toMatch(/<span aria-hidden="true">[^<]*✓ Selected<\/span>/);
    const visibleName = button?.replace(/<span aria-hidden="true">[\s\S]*?<\/span>/g, '')
      .replace(/<[^>]*>/g, '');
    expect(visibleName).toBe(label);
  }
  expect(markup).toMatch(/aria-pressed="false"[^>]*>Tile A1<\/button>/);
});

it('renders free viewer choices at 318px and transparent video sizes with local selection feedback', () => {
  expect(typeof viewer.renderViewerPanel).toBe('function');
  const initial = viewer.createViewerControls({ options: ['Simulated <choice>'],
    tiles: [{ q: 0, r: 0 }, { q: 1, r: 0 }], sides: ['Simulated "north"'] });
  const selected = viewer.reduceViewerControls(viewer.reduceViewerControls(
    viewer.reduceViewerControls(initial, { kind: 'vote', option_index: 0 }),
    { kind: 'pick_tile', q: 1, r: 0 }), { kind: 'join_side', side: 'Simulated "north"' });
  for (const [width, height] of [[318, 318], [1920, 1080], [1280, 720]] as const) {
    const markup = viewer.renderViewerPanel(selected, { width, height });
    expect(markup).toContain(`data-output-width="${width}" data-output-height="${height}"`);
    expect(markup).toContain(`width:${width}px;height:${height}px`);
    expect(markup).toContain('background:transparent');
    expect(markup).toContain('Simulated &lt;choice&gt;');
    expect(markup).toContain('Simulated &quot;north&quot;');
    expect(markup).toContain('SIMULATED');
    expect(markup.match(/data-viewer-choice=/g)).toHaveLength(4);
    expect(markup.match(/aria-pressed="true"/g)).toHaveLength(3);
    const selectedButtons = markup.match(/<button[^>]*aria-pressed="true"[^>]*>[\s\S]*?<\/button>/g) ?? [];
    expect(selectedButtons).toHaveLength(3);
    for (const button of selectedButtons) {
      expect(button).toContain('background:var(--ink)');
      expect(button).toContain('✓ Selected');
    }
    expect(markup).not.toMatch(/<script|<foreignObject|<choice>|fetch\(|onclick=/i);
  }
  expect(initial.selection).toEqual({});
});

it('does not render arbitrary control data or unsupported output dimensions', () => {
  const state = viewer.createViewerControls({ options: [], tiles: [], sides: [] });
  for (const options of [{ width: -1 }, { height: NaN }, { width: 0.1 }, { width: 16385 }, { script: 'no' }]) {
    expect(() => viewer.renderViewerPanel(state, options)).toThrow();
  }
});

it('shows an honest empty viewer state without creating a vote or side', () => {
  const state = viewer.createViewerControls({ options: [], tiles: [], sides: [] });
  expect(viewer.renderViewerPanel(state)).toContain('No viewer controls configured');
});
