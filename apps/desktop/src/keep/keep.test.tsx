import { expect, test, vi } from 'vitest';
import { chambers } from '@castle-control/ui';
import { KeepEntrance, KeepRoomTile } from './keep.jsx';

test('every Keep room click opens its chamber and Enter the keep invokes Overview', () => {
  const open = vi.fn(); const enter = vi.fn();
  for (const chamber of chambers) {
    const tile = KeepRoomTile({ chamber, word: 'Sample', line: 'Illustrative room', sample: true, on_open: open });
    tile.props.onClick();
    expect(open).toHaveBeenLastCalledWith(chamber.id);
  }
  KeepEntrance({ on_enter: enter }).props.children[1].props.onClick();
  expect(enter).toHaveBeenCalledOnce();
});
