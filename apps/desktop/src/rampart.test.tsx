import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import { DesktopView } from './view.jsx';
import { DesktopRampart } from './rampart.jsx';
import { simulatedRead } from './simulated.js';
import type { Snapshot } from './model.js';
import type { ModuleId } from '@castle-control/ui';
import Keep from './shell/keep.jsx';
import { DesktopApp } from './app.jsx';
import { Children, isValidElement } from 'react';
import { ThemeToggle } from '@castle-control/ui';

test('the hook-free fixture rampart links its OBS chip to setup', () => {
  const html = renderToStaticMarkup(DesktopRampart({ snapshot: { mode: 'fixture', phase: 'ready' },
    theme: 'day', on_theme_change: () => undefined }));
  expect(html).toMatch(/<a href="#\/stream"[^>]*><span class="cc-rampart-link"[^>]*aria-label="OBS simulated"[^>]*>[\s\S]*?<span aria-hidden="true">OBS<\/span><\/span><\/a>/);
  expect(html).toContain('data-role="status-bar"');
});

test('the app opens at night and the existing theme toggle still selects day', () => {
  const snapshot = { mode: 'fixture', phase: 'ready' } as const;
  vi.stubGlobal('window', { location: { hash: '#/keep' } });
  try {
    const html = renderToStaticMarkup(<DesktopApp client={{ subscribe: () => () => undefined,
      getSnapshot: () => snapshot, start: () => () => undefined }} />);
    expect(html).toContain('data-theme="night"');
    const change = vi.fn();
    const tree = DesktopRampart({ snapshot, theme: 'night', on_theme_change: change });
    const toggle = Children.toArray(tree.props.children).find(child => isValidElement(child) && child.type === ThemeToggle);
    if (!isValidElement<Parameters<typeof ThemeToggle>[0]>(toggle)) throw new Error('Missing theme toggle');
    ThemeToggle(toggle.props).props.onClick();
    expect(change).toHaveBeenCalledWith('day');
  } finally { vi.unstubAllGlobals(); }
});

function render(snapshot: Snapshot, current: ModuleId = 'lottery') {
  return renderToStaticMarkup(<DesktopView current={current} snapshot={snapshot} theme="night"
    on_navigate={() => undefined} on_theme_change={() => undefined} search="" on_search={() => undefined} />);
}

test.each(['lottery', 'moderator', 'visuals', 'studio'] as const)('%s renders authoritative stream, bridge, OBS and moderation summaries', current => {
  const data = simulatedRead(1);
  const html = render({ ...data, mode: 'core', phase: 'ready', status: { ...data.status, simulated: false,
    twitch_connected: false, uptime_ms: 999, gatehouse: { armed_rules: 2, shadow_rules: 3, shield: true } } }, current);
  for (const text of ['On air', 'Twitch: connected', 'OBS: connected', 'Bridge up', '2 rules armed', '3 watching', '01:00:00', '214']) expect(html).toContain(text);
  expect(html).toContain('data-stamp="on-air" role="img" aria-label="On air"');
  expect(html).toContain('data-stamp="armed" role="img" aria-label="Armed: can act on viewers: Armed 2"');
  expect(html).toContain('data-stamp="shadow" role="img" aria-label="Shadow: watching, takes no action: Watching 3"');
  expect(html).not.toContain('Simulated');
});

test('absent stream and Gatehouse fields render unknown, never offline or zero watching', () => {
  const status = { ...simulatedRead(1).status };
  delete status.stream;
  delete status.gatehouse;
  const html = render({ mode: 'core', phase: 'ready', status: { ...status, simulated: false }, bridge: { state: 'connecting' } });
  expect(html).toContain('ON AIR unknown');
  expect(html).toContain('data-variant="dash">ON AIR unknown</span>');
  expect(html).not.toMatch(/data-stamp="(?:on-air|off-air)"/);
  expect(html).toContain('Gatehouse unknown');
  expect(html).toContain('Twitch: reconnecting');
  expect(html).not.toContain('Offline');
  expect(html).not.toContain('0 rules armed');
  expect(html).not.toContain('Watching');
});

test('initial and disconnected display do not invent OBS, Twitch or moderation state', () => {
  const html = render({ mode: 'core', phase: 'connecting' });
  for (const label of ['ON AIR unknown', 'Twitch unknown', 'OBS unknown', 'Gatehouse unknown']) expect(html).toContain(label);
  expect(html).not.toContain('disconnected');
});

test.each([
  { mode: 'fixture', simulated: true },
  { mode: 'fixture', simulated: false },
] as const)('$mode with simulated=$simulated never presents fixture summaries as live', ({ mode, simulated }) => {
  const data = simulatedRead(1);
  const html = renderToStaticMarkup(<DesktopRampart snapshot={{ ...data, mode, phase: 'ready',
    status: { ...data.status, simulated, gatehouse: { armed_rules: 2, shadow_rules: 3, shield: true } } }}
    theme="day" on_theme_change={() => undefined} />);
  expect(html).toContain('data-stamp="off-air" role="img" aria-label="On air is simulated: nothing is broadcast"');
  expect(html).toContain('>On air · simulated</span>');
  for (const name of ['Twitch', 'OBS', 'Gatehouse']) {
    expect(html).toContain(`class="cc-rampart-link" role="img" aria-label="${name} simulated"`);
    expect(html).toContain(`<span aria-hidden="true">${name}</span>`);
  }
  expect(html.match(/data-stamp="simulated"/g)).toHaveLength(1);
  expect(html).toContain('aria-label="Connections · simulated"');
  expect(html).toContain('<b>Unknown</b><small>viewers</small>');
  expect(html).toContain('<b>Unknown</b><small>uptime</small>');
  for (const claim of ['cc-connection', 'connected', 'data-stamp="on-air"', '214', '01:00:00', 'Armed', 'Watching', 'Bridge up']) {
    expect(html).not.toContain(claim);
  }
});

test('the Keep offers four room hits and honest lintel stamps', () => {
  const html = renderToStaticMarkup(<Keep on_open={() => undefined} on_enter={() => undefined} />);
  for (const id of ['lottery', 'moderator', 'visuals', 'studio']) expect(html).toContain(`data-room-tile="${id}"`);
  expect(html.match(/data-role="plaque"/g)).toHaveLength(4);
  expect(html).toContain('data-stamp="simulated"');
  expect(html).not.toContain('Room preview · sample data');
  expect(html).not.toContain('ILLUSTRATIVE SAMPLE DATA');
  expect(html).toContain('Enter the keep');
});

test('a rehearsal core retains SIMULATED provenance and actual OBS/bridge connection status', () => {
  const html = render({ mode: 'core', phase: 'ready', ...simulatedRead(1), bridge: { state: 'disconnected' } });
  expect(html).toContain('data-stamp="off-air"');
  expect(html).toContain('>On air · simulated</span>');
  expect(html).toContain('class="cc-rampart-link" role="img" aria-label="Gatehouse simulated"');
  expect(html).not.toContain('desktop-simulated');
  expect(html).not.toContain('SIMULATED SOURCE');
  expect(html).not.toContain('Twitch: connected');
  expect(html).toContain('OBS: connected');
  expect(html).toContain('Twitch: disconnected');
  expect(html).not.toContain('OBS simulated');
  expect(html).toContain('data-stamp="simulated"');
});

test.each(['lottery', 'moderator', 'visuals', 'studio'] as const)('%s keeps an absent bridge UNKNOWN with a ready core', current => {
  const status = { ...simulatedRead(1).status, simulated: false, twitch_connected: false };
  const html = render({ mode: 'core', phase: 'ready', status }, current);
  // The shared status chip styles uppercase this label on every chamber.
  expect(html).toContain('Twitch unknown');
  expect(html).not.toContain('Twitch: down');
  expect(html).not.toContain('Twitch: connected');
  expect(html).not.toContain('Core status unavailable');
  expect(html).not.toContain('Connecting to the core');
  expect(html).toContain('On air');
  expect(html).toContain('OBS: connected');
});

test('explicit offline and zero rules remain distinct from unknown', () => {
  const data = simulatedRead(0);
  const html = render({ ...data, mode: 'core', phase: 'ready', status: { ...data.status, simulated: false } });
  expect(html).toContain('Offline');
  expect(html).toContain('data-stamp="off-air"');
  expect(html).toContain('0 rules armed');
  expect(html).toContain('Watching');
  expect(html).not.toContain('SIMULATED SOURCE');
  expect(html).not.toContain('ON AIR unknown');
});
