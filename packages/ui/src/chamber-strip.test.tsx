import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import { ChamberStrip } from './chamber-strip.jsx';
import type { ChamberStripProps } from './chamber-strip.jsx';

test('strip selects on click/focus, opens on double click, and exposes all three lamps', () => {
  const select = vi.fn(); const open = vi.fn();
  const state = { line: 'Sample layer', on_air: false, preview: true, draft: true };
  const props: ChamberStripProps = { selected: 'lottery', states: { lottery: state, moderator: state, visuals: state, studio: state }, on_select: select, on_open: open };
  const tiles = ChamberStrip(props).props.children;
  tiles[2]?.props.onFocus(); tiles[2]?.props.onClick();
  expect(select).toHaveBeenLastCalledWith('visuals');
  expect(open).not.toHaveBeenCalled();
  tiles[3]?.props.onDoubleClick();
  expect(open).toHaveBeenCalledWith('studio');
  const html = renderToStaticMarkup(<ChamberStrip {...props} />);
  for (const text of ['On air', 'Preview', 'Draft', 'data-room-tile="lottery"', 'aria-pressed="true"']) expect(html).toContain(text);
});

test('tile names contain only the chamber and pending count, with visible lamps hidden from accessibility', () => {
  const state = { line: 'Preview draft sample layer', on_air: true, preview: true, draft: true };
  const html = renderToStaticMarkup(<ChamberStrip selected="lottery" states={{
    lottery: { ...state, pending_count: 2 }, moderator: { ...state, pending_count: 1 },
    visuals: { ...state, pending_count: 0 }, studio: state,
  }} on_select={vi.fn()} on_open={vi.fn()} />);
  const tiles = [...html.matchAll(/<button\b[^>]*>/g)];
  const labels = tiles.map(([tag]) => /aria-label="([^"]*)"/.exec(tag)?.[1]);
  expect(labels).toEqual(['Lot Chamber, 2 proposals', 'Gatehouse, 1 proposal', 'Beacons, no proposals', 'Map Room, no proposals']);
  for (const label of labels) expect(label).not.toMatch(/Preview|Draft/i);
  const lamps = [...html.matchAll(/<span\b[^>]*data-lit="(?:true|false)"[^>]*>(On air|Preview|Draft)<\/span>/g)];
  expect(lamps).toHaveLength(12);
  for (const [lamp] of lamps) {
    expect(lamp).toContain('aria-hidden="true"');
    expect(lamp).not.toMatch(/(?:\s|["'])hidden(?:\s|=|>)/);
  }
});
