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
