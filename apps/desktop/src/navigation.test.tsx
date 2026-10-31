import { renderToReadableStream } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import { chambers } from '@castle-control/ui';
import { backHash, canonicalHash, createKeymap, dispatchShortcut, initialNavigation, navigateHash, routeFromHash } from './navigation.js';
import { DesktopView } from './view.jsx';
import { simulatedRead } from './simulated.js';
import { KeepEntrance } from './keep/keep.jsx';
import { DemoHeader } from './demo/demo.jsx';
import { stewardContext } from './shell/steward.jsx';

test('duplicate bindings throw before a handler can use them', () => {
  expect(() => createKeymap([{ key: '1', action: 'lottery' }, { key: '1', action: 'studio' }])).toThrow('Duplicate');
});

test('OBS setup is a lazy non-chamber surface reached from the Keep with Back to the Keep', async () => {
  expect(canonicalHash('#/stream')).toBe('#/stream');
  expect(routeFromHash('#/stream')).toBe('stream');
  expect(backHash(navigateHash(initialNavigation('#/overview'), '#/stream'))).toBe('#/keep');
  const open = vi.fn();
  const entry = KeepEntrance({ on_enter: () => undefined, on_stream: open });
  expect(entry.props.children[2].props.children).toBe('Set up OBS');
  entry.props.children[2].props.onClick();
  expect(open).toHaveBeenCalledOnce();
  const stream = await renderToReadableStream(<DesktopView navigation={initialNavigation('#/stream')}
    snapshot={{ mode: 'fixture', phase: 'ready' }} theme="paper" on_navigate={() => undefined} on_theme_change={() => undefined} />);
  await stream.allReady;
  const html = await new Response(stream).text();
  expect(html).toContain('stream-workspace');
  expect(html).not.toContain('data-module="stream"');
  expect(html).not.toContain('shell-room');
  expect(html.match(/aria-label="Talk to the Steward\.\.\."/g)).toHaveLength(1);
});

test('keep demo entry, direct URL, Back and Escape use the canonical non-chamber demo surface', async () => {
  expect(canonicalHash('#/demo')).toBe('#/demo');
  expect(routeFromHash('#/demo')).toBe('demo');
  expect(backHash(initialNavigation('#/demo'))).toBe('#/keep');
  expect(stewardContext('demo')).toEqual(stewardContext('keep'));
  expect(stewardContext('demo')).not.toHaveProperty('chamber');
  let state = initialNavigation('#/keep');
  const entry = KeepEntrance({ on_enter: () => undefined, on_demo: () => { state = navigateHash(state, '#/demo'); } });
  expect(entry.props.children[1].props.children).toBe('See it on stream');
  entry.props.children[1].props.onClick?.();
  expect(state.current).toBe('demo');
  const view = <DesktopView navigation={state} snapshot={{ mode: 'fixture', phase: 'ready' }} theme="paper"
    on_navigate={() => undefined} on_theme_change={() => undefined} />;
  const stream = await renderToReadableStream(view);
  await stream.allReady;
  const html = await new Response(stream).text();
  expect(html).toContain('demo-workspace');
  expect(html).not.toContain('data-module="demo"');
  expect(html).not.toContain('shell-room');
  DemoHeader({ on_back: () => { state = navigateHash(state, backHash(state)); } }).props.children[1].props.onClick();
  expect(state.current).toBe('keep');
  state = navigateHash(state, '#/demo');
  dispatchShortcut({ key: 'Escape', preventDefault: () => undefined }, false, () => undefined, () => undefined,
    { back: () => { state = navigateHash(state, backHash(state)); } });
  expect(state.current).toBe('keep');
  expect(backHash(navigateHash(initialNavigation('#/overview'), '#/demo'))).toBe('#/keep');
});

test('default, direct links and legacy hashes canonicalize without the rejected stage', () => {
  expect(canonicalHash('')).toBe('#/keep');
  expect(canonicalHash('#/unknown')).toBe('#/keep');
  for (const { id } of chambers) {
    expect(canonicalHash(`#/${id}`)).toBe(`#/chamber/${id}`);
    expect(routeFromHash(`#/chamber/${id}`)).toBe(id);
  }
  expect(canonicalHash('#/moderator/drill')).toBe('#/chamber/moderator/drill');
  expect(initialNavigation('#/chamber/moderator/drill').replay).toBe(true);
  expect(routeFromHash('#/lottery/stage')).toBe('keep');
  expect(canonicalHash('#/lottery/stage/1.3')).toBe('#/keep');
});

test.each(['keep', 'overview'] as const)('keys 1-4 and Escape preserve the %s origin, including room switches and drill', origin => {
  let state = initialNavigation(`#/${origin}`);
  const navigate = (hash: string) => { state = navigateHash(state, hash); };
  for (const { id, number } of chambers) {
    dispatchShortcut({ key: number, preventDefault: () => undefined }, false,
      chamber => navigate(`#/chamber/${chamber}`), () => undefined,
      { back: () => navigate(backHash(state)) });
    expect(state.current).toBe(id);
    if (id === 'moderator') {
      navigate('#/moderator/drill');
      expect(state.replay).toBe(true);
    }
  }
  dispatchShortcut({ key: 'Escape', preventDefault: () => undefined }, true, () => undefined, () => undefined,
    { back: () => navigate(backHash(state)) });
  expect(state.current).toBe(origin);
});

test('0, slash, Enter and Delete dispatch only their declared actions; Space belongs to the focused seal control', () => {
  const overview = vi.fn(); const focus = vi.fn(); const open = vi.fn(); const tear = vi.fn();
  for (const key of ['0', '/', 'Enter', 'Delete', ' ']) dispatchShortcut({ key, preventDefault: () => undefined }, false,
    () => undefined, focus, { overview, open, tear });
  expect(overview).toHaveBeenCalledOnce();
  expect(focus).toHaveBeenCalledOnce();
  expect(open).toHaveBeenCalledOnce();
  expect(tear).toHaveBeenCalledOnce();
});

test('typing, modified shortcuts, repeats and composition do not navigate', () => {
  const change = vi.fn();
  for (const event of [{ key: '1', ctrlKey: true }, { key: '2', metaKey: true }, { key: '3', altKey: true },
    { key: '4', isComposing: true }, { key: '1', defaultPrevented: true }, { key: '1', repeat: true }]) {
    dispatchShortcut({ ...event, preventDefault: change }, false, change, change);
  }
  for (const key of ['0', '1', '/', 'Enter', 'Delete', ' ']) dispatchShortcut({ key, preventDefault: change }, true, change, change);
  expect(change).not.toHaveBeenCalled();
});

test('lazy surfaces retain one Steward bar and the rampart, and rooms retain their existing content', async () => {
  const snapshot = { mode: 'fixture', phase: 'ready', ...simulatedRead(1) } as const;
  for (const [hash, content] of [['#/keep', 'Enter the keep'], ['#/overview', 'Stream preview'], ['#/demo', 'SIMULATED · SAMPLE ART · AI-generated'],
    ['#/chamber/lottery', 'Fairness you can verify'], ['#/chamber/moderator', 'The live room'],
    ['#/chamber/visuals', 'aria-label="Beacons work"'], ['#/chamber/studio', 'aria-label="Map Room work"'],
    ['#/chamber/moderator/drill', 'The drill']]) {
    const stream = await renderToReadableStream(<DesktopView navigation={initialNavigation(hash ?? '')} snapshot={snapshot}
      theme="paper" on_navigate={() => undefined} on_theme_change={() => undefined} />);
    await stream.allReady;
    const html = await new Response(stream).text();
    for (const text of [content, 'ON AIR simulated', 'Twitch simulated', 'OBS simulated', 'Gatehouse simulated']) expect(html).toContain(text);
    expect(html).not.toContain('desktop-simulated');
    expect(html).not.toContain('SIMULATED SOURCE');
    expect(html.match(/aria-label="Talk to the Steward\.\.\."/g)).toHaveLength(1);
    expect(html).toContain('SIMULATED STEWARD · SAMPLE DATA');
    expect(html).not.toContain('cc-stage-frame');
  }
});
