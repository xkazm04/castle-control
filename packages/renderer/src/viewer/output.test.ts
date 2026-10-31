import { expect, it } from 'vitest';
import * as viewer from './controls.ts';

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
