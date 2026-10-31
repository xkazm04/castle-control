import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import Room from './room.jsx';
import { TileInspector } from './hex-table.jsx';

test('local studio exposes labelled session-only map fields, art preview and banner inspection', () => {
  const html = renderToStaticMarkup(<Room snapshot={{ mode: 'fixture', phase: 'ready' }} />);
  for (const label of ['Map size', 'Map anchor', 'Preset colour', 'Art style', 'Reveal timing (ms)',
    'Session-only map preview', 'Map design status', 'Inspect House Tallow banner',
    'Replay local reveal', 'Reset local design']) expect(html).toContain(label);
  expect(html).toContain('SIMULATED');
  expect(html).toContain('/art/preset-heraldic-hexmap.webp');
  expect(html).toContain('Session only');
});

test('an unavailable tile has an honest empty inspector rather than silently showing A1', () => {
  const html = renderToStaticMarkup(<TileInspector selected="missing" />);
  expect(html).toContain('No tile selected');
  expect(html).not.toContain('Now: inspecting A1');
});
