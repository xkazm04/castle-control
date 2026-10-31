import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import Room, { StudioViewSwitch, StudioWork } from './room.jsx';
import TiltyardView from './tiltyard-view.jsx';

test('the hosted Tiltyard shows SAMPLE contestants and the visible simulated-chat provenance in the view row', () => {
  const network = vi.spyOn(globalThis, 'fetch');
  try {
    const row = renderToStaticMarkup(<StudioViewSwitch view="tiltyard" on_view={vi.fn()} />);
    const stage = renderToStaticMarkup(<TiltyardView />);
    expect(row).toContain('The duel component · hosted as a Map Room view');
    expect(row).toContain('Sample items · simulated chat');
    expect(stage).toContain('aria-label="The Tiltyard, duel stage"');
    expect(stage).toContain('data-provenance="sample"');
    expect(stage).toContain('The Ashen Warden');
    expect(network).not.toHaveBeenCalled();
  } finally { network.mockRestore(); }
});

test.each(['table', 'spyglass', 'tiltyard'] as const)('the %s switch has three native buttons and exactly one pressed', view => {
  const row = renderToStaticMarkup(<StudioViewSwitch view={view} on_view={vi.fn()} />);
  const buttons = row.match(/<button[^>]*>[\s\S]*?<\/button>/g) ?? [];
  expect(buttons).toHaveLength(3);
  expect(buttons.every(button => button.includes('type="button"') && button.includes('aria-pressed='))).toBe(true);
  expect(buttons.filter(button => button.includes('aria-pressed="true"'))).toHaveLength(1);
  expect(buttons.map(button => button.replace(/<[^>]*>/g, ''))).toEqual(['Table', 'Spyglass', 'Tiltyard']);
  expect(buttons[['table', 'spyglass', 'tiltyard'].indexOf(view)]).toContain('aria-pressed="true"');
});

test('the default table and core fallback retain their contents; the stage has a separate lazy door', () => {
  const table = renderToStaticMarkup(<StudioWork seal_slot={<p>Shared seal slot</p>} />);
  const core = renderToStaticMarkup(<Room snapshot={{ mode: 'core', phase: 'connecting' }} seal_slot={<p>Shared seal slot</p>} />);
  expect(table).toContain('data-view="table"');
  expect(table.match(/data-hex-tile=/g)).toHaveLength(54);
  expect(table).toContain('Shared seal slot');
  expect(core).toContain('The map table is bare');
  expect(core).toContain('Shared seal slot');
  expect(core).not.toContain('Tiltyard');
  expect(readFileSync(new URL('./room.tsx', import.meta.url), 'utf8')).toContain("lazy(() => import('./tiltyard-view.jsx'))");
});
