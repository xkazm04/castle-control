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

test('strip tiles describe their lit lamps and visible state line', () => {
  const html = renderToStaticMarkup(<ChamberStrip selected="lottery" states={{
    lottery: { line: 'Question draw awaiting seal', on_air: true, preview: false, draft: true },
    moderator: { line: 'Rules under review', on_air: false, preview: true, draft: false },
    visuals: { line: 'No visual configured', on_air: false, preview: false, draft: false },
    studio: { line: 'Map revision ready', on_air: true, preview: true, draft: true },
  }} on_select={vi.fn()} on_open={vi.fn()} />);
  const expected = [
    ['On air, draft pending', 'Question draw awaiting seal'],
    ['Preview', 'Rules under review'],
    ['No active layers', 'No visual configured'],
    ['On air, preview, draft pending', 'Map revision ready'],
  ];
  const tiles = [...html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)];
  expect(tiles).toHaveLength(expected.length);
  const ids = new Set<string>();
  for (const [index, tile] of tiles.entries()) {
    const description_ids = /aria-describedby="([^"]+)"/.exec(tile[1] ?? '')?.[1]?.split(' ');
    expect(description_ids).toHaveLength(2);
    const descriptions = description_ids?.map(id => {
      ids.add(id);
      const span = new RegExp(`<span[^>]*id="${id}"[^>]*>([^<]*)</span>`).exec(tile[2] ?? '');
      expect(span?.[0]).not.toContain('aria-hidden');
      return span?.[1];
    });
    expect(descriptions).toEqual(expected[index]);
  }
  expect(ids.size).toBe(8);
});
