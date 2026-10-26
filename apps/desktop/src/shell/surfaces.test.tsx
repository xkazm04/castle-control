import { expect, test, vi } from 'vitest';
import { dispatchShortcut } from '../navigation.js';
import Keep from './keep.jsx';
import Overview from './overview.jsx';
import { stewardStub, unwiredReply } from './steward-stub.js';
import type { ModuleId } from '@castle-control/ui';

test('keep click opens a room and Enter the keep reaches overview', () => {
  const open = vi.fn(); const enter = vi.fn();
  const tree = Keep({ on_open: open, on_enter: enter });
  tree.props.children[1].props.children[1].props.onClick();
  expect(open).toHaveBeenCalledWith('moderator');
  tree.props.children[2].props.onClick();
  expect(enter).toHaveBeenCalledOnce();
});

test('strip focus/click selects a layer, Enter opens it and double-click opens its room', () => {
  let selected: ModuleId = 'lottery';
  const open = vi.fn();
  const tree = Overview({ selected, on_select: chamber => { selected = chamber; }, on_open: open });
  const tiles = tree.props.children[2].props.children;
  tiles[2].props.onFocus();
  expect(selected).toBe('visuals');
  expect(open).not.toHaveBeenCalled();
  dispatchShortcut({ key: 'Enter', preventDefault: () => undefined }, false, open, () => undefined, { open: () => open(selected) });
  expect(open).toHaveBeenCalledWith('visuals');
  tiles[3].props.onClick();
  expect(selected).toBe('studio');
  tiles[3].props.onDoubleClick();
  expect(open).toHaveBeenLastCalledWith('studio');
});

test('all stub methods return the same honest empty turn without network calls or mutation', () => {
  const network = vi.spyOn(globalThis, 'fetch');
  try {
    const expected = { reply: unwiredReply, proposals: [], focus: {} };
    expect(stewardStub.ask('Draft a draw', 'overview')).toEqual(expected);
    expect(stewardStub.amend('Make it five', 'lottery')).toEqual(expected);
    expect(stewardStub.tearUp('keep')).toEqual(expected);
    expect(network).not.toHaveBeenCalled();
  } finally { network.mockRestore(); }
});
