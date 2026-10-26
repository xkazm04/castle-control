import { renderToReadableStream } from 'react-dom/server';
import { expect, test } from 'vitest';
import { createKeymap, dispatchShortcut, routeFromHash } from './navigation.js';
import { DesktopView } from './view.jsx';
import { simulatedRead } from './simulated.js';
import type { ModuleId } from '@castle-control/ui';

test('duplicate bindings throw before a handler can use them', () => {
  expect(() => createKeymap([{ key: '1', action: 'lottery' }, { key: '1', action: 'studio' }])).toThrow('Duplicate');
});

test('keyboard alone opens every chamber with its current content and simulated rampart', async () => {
  let current: ModuleId = 'lottery';
  let focused = false;
  const snapshot = { mode: 'fixture', phase: 'ready', ...simulatedRead(1) } as const;
  for (const [key, title, empty] of [
    ['1', 'Lot Chamber', 'No lots in the urn yet'], ['2', 'Gatehouse', 'The live room'],
    ['3', 'Beacons', 'Kindling curve'], ['4', 'Map Room', 'The map table is bare'],
  ]) {
    let prevented = false;
    dispatchShortcut({ key: key ?? '', preventDefault: () => { prevented = true; } }, false,
      id => { current = id; }, () => { focused = true; });
    expect(prevented).toBe(true);
    const stream = await renderToReadableStream(<DesktopView current={current} snapshot={snapshot} theme="paper"
      on_navigate={() => undefined} on_theme_change={() => undefined} search="" on_search={() => undefined} />);
    await stream.allReady;
    const html = await new Response(stream).text();
    for (const text of [title, empty, 'On air', 'Twitch: connected', 'OBS: connected', 'Watching', 'Simulated']) {
      expect(html).toContain(text);
    }
    expect(html).toContain('SIMULATED SOURCE');
    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
  }
  dispatchShortcut({ key: '/', preventDefault: () => undefined }, false, () => undefined, () => { focused = true; });
  expect(focused).toBe(true);
});

test('typing, modified shortcuts and composition do not navigate', () => {
  let calls = 0;
  const change = () => { calls++; };
  for (const event of [{ key: '1', ctrlKey: true }, { key: '2', metaKey: true }, { key: '3', altKey: true },
    { key: '4', isComposing: true }, { key: '1', defaultPrevented: true }]) {
    dispatchShortcut({ ...event, preventDefault: change }, false, change, change);
  }
  dispatchShortcut({ key: '1', preventDefault: change }, true, change, change);
  expect(calls).toBe(0);
});

test('hash routes support direct links and safe fallback', () => {
  expect(routeFromHash('#/studio')).toBe('studio');
  expect(routeFromHash('#/moderator')).toBe('moderator');
  expect(routeFromHash('#/unknown')).toBe('lottery');
});
