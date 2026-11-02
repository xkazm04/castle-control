import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, expect, test, vi } from 'vitest';
import { ActionRow } from '@castle-control/ui/action-row';
import { createDockStore, stewardDock } from '@castle-control/ui/steward-flow';
import { actionKeymap, dispatchShortcut, registerActionKeys } from '../navigation.js';
import { roomDeck, RoomKeyBadge } from './steward-keys.jsx';
import { bracketDrawer } from '../rooms/studio/bracket-drawer.js';
import { roomActionKeys, stewardRegistry } from './steward-flows.js';
import { fixtureBeacons } from '../rooms/visuals/stage-state.js';
import { fixtureDuel, fixturePicture } from '../rooms/studio/duel-fixture.js';
import { duelHost } from '../rooms/studio/duel-host.js';

afterEach(() => { for (const chamber of ['lottery', 'moderator', 'visuals', 'studio'] as const) stewardDock.close(chamber); stewardDock.collapse(); });
afterEach(() => { duelHost.setPicture(undefined); vi.restoreAllMocks(); });

test('changing a letter in the room table changes the action row, keyboard and control badge', () => {
  const sample = { mode: 'fixture', phase: 'ready' } as const;
  const deck = { ...roomDeck, lottery: roomDeck.lottery.map(item => item.action === 'cast' ? { ...item, key: 'Z' } : item) };
  const edited = roomActionKeys('lottery', stewardRegistry(sample), sample, deck);
  const cast = edited.find(entry => entry.key === 'Z');
  if (!cast) throw new Error('Missing cast entry');
  const cleanup = registerActionKeys({ entries: edited, peel: () => false });
  try {
    const html = renderToStaticMarkup(<ActionRow entries={edited} seal={null} open={false} on_open={vi.fn()} />);
    expect(html).toContain('<kbd>Z</kbd><span>cast the lots</span>');
    const badge = renderToStaticMarkup(<RoomKeyBadge room="lottery" action="cast" deck={deck} />);
    expect(badge).toMatch(/cc-key-badge[^>]*>Z<\/kbd>/);
    expect(badge).not.toMatch(/>W<\/kbd>/);
    expect(actionKeymap(edited).get('z')).toBe(cast);
    const preventDefault = vi.fn();
    dispatchShortcut({ key: 'W', preventDefault }, false, vi.fn(), undefined);
    expect(stewardDock.getSnapshot().sessions.lottery).toBeUndefined();
    dispatchShortcut({ key: 'Z', preventDefault }, false, vi.fn(), undefined);
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(stewardDock.getSnapshot().sessions.lottery?.flow.id).toBe('lots-cast');
    expect(stewardDock.getSnapshot().drafts.lottery?.ready).toBe(false);
  } finally { cleanup(); }
});

test('Escape consumes popover, then conversation, then the shell Back action from anywhere in the room', () => {
  const store = createDockStore();
  store.expand(); store.popover('flows');
  const back = vi.fn(); const preventDefault = vi.fn();
  const cleanup = registerActionKeys({ entries: [], peel: store.peel });
  const escape = () => dispatchShortcut({ key: 'Escape', preventDefault }, true, vi.fn(), undefined, { back });
  try {
    escape(); expect(store.getSnapshot().popover).toBeUndefined(); expect(store.getSnapshot().expanded).toBe(true);
    escape(); expect(store.getSnapshot().expanded).toBe(false); expect(back).not.toHaveBeenCalled();
    escape(); expect(back).toHaveBeenCalledOnce(); expect(preventDefault).toHaveBeenCalledTimes(3);
  } finally { cleanup(); }
});

test('room keys respect typing and shortcut guards, and unmount removes the scope', () => {
  const run = vi.fn(); const cleanup = registerActionKeys({ entries: [{ key: 'Q', label: 'Draft', run }], peel: () => false });
  for (const extra of [{ ctrlKey: true }, { metaKey: true }, { altKey: true }, { repeat: true }, { isComposing: true }, { defaultPrevented: true }]) {
    dispatchShortcut({ key: 'q', preventDefault: vi.fn(), ...extra }, false, vi.fn(), undefined);
  }
  dispatchShortcut({ key: 'q', preventDefault: vi.fn() }, true, vi.fn(), undefined);
  cleanup(); dispatchShortcut({ key: 'q', preventDefault: vi.fn() }, false, vi.fn(), undefined);
  expect(run).not.toHaveBeenCalled();
});

test('every chamber has unique keys; the Keep has no action row entries', () => {
  const sample = { mode: 'fixture', phase: 'ready' } as const;
  const registry = stewardRegistry(sample);
  for (const chamber of ['lottery', 'moderator', 'visuals', 'studio'] as const) {
    const table = roomActionKeys(chamber, registry, sample);
    expect(actionKeymap(table).size).toBe(table.length);
  }
  expect(roomActionKeys('keep', registry, sample)).toEqual([]);
});

test('Q W E select the same generated beacons as the existing room selector', () => {
  const sample = { mode: 'fixture', phase: 'ready' } as const;
  const table = roomActionKeys('visuals', stewardRegistry(sample), sample);
  const port = fixtureBeacons();
  for (const [index, key] of ['Q', 'W', 'E'].entries()) {
    table.find(entry => entry.key === key)?.run();
    expect(port.getSnapshot().selected).toBe(port.getSnapshot().visuals[index]?.visual.visual_id);
  }
});

test('duel row calls the existing stage handler, while an unsealed duel draft keeps it frozen', async () => {
  const sample = { mode: 'fixture', phase: 'ready' } as const;
  const registry = stewardRegistry(sample);
  const table = roomActionKeys('studio', registry, sample);
  duelHost.setPicture(fixturePicture(fixtureDuel.getSnapshot()));
  const send = vi.spyOn(fixtureDuel, 'send');
  table.find(entry => entry.key === 'Backspace')?.run();
  await vi.waitFor(() => expect(send).toHaveBeenCalledExactlyOnceWith({ kind: 'undo' }));
  const flow = registry.studio.flows.find(item => item.id === 'studio-duel');
  if (!flow) throw new Error('Missing duel flow');
  stewardDock.open(flow);
  table.find(entry => entry.key === 'W')?.run();
  expect(send).toHaveBeenCalledTimes(1);
});

test('Map Room full bracket key calls only the mounted drawer opener and removes it on unmount', () => {
  const sample = { mode: 'fixture', phase: 'ready' } as const;
  const entries = roomActionKeys('studio', stewardRegistry(sample), sample);
  const open = vi.fn();
  const unmount = bracketDrawer.mount(open);
  const cleanup = registerActionKeys({ entries, peel: () => false });
  try {
    dispatchShortcut({ key: 'r', preventDefault: vi.fn() }, false, vi.fn(), undefined);
    expect(open).toHaveBeenCalledOnce();
    expect(stewardDock.getSnapshot().sessions.studio).toBeUndefined();
    unmount();
    dispatchShortcut({ key: 'r', preventDefault: vi.fn() }, false, vi.fn(), undefined);
    expect(open).toHaveBeenCalledOnce();
  } finally { unmount(); cleanup(); }
});
