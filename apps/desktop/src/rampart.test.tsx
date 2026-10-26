import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { DesktopView } from './view.jsx';
import { DesktopRampart } from './rampart.jsx';
import { simulatedRead } from './simulated.js';
import type { Snapshot } from './model.js';
import type { ModuleId } from '@castle-control/ui';

function render(snapshot: Snapshot, current: ModuleId = 'lottery') {
  return renderToStaticMarkup(<DesktopView current={current} snapshot={snapshot} theme="stock"
    on_navigate={() => undefined} on_theme_change={() => undefined} search="" on_search={() => undefined} />);
}

test.each(['lottery', 'moderator', 'visuals', 'studio'] as const)('%s renders authoritative stream, bridge, OBS and moderation summaries', current => {
  const data = simulatedRead(1);
  const html = render({ ...data, mode: 'core', phase: 'ready', status: { ...data.status, simulated: false,
    twitch_connected: false, uptime_ms: 999, gatehouse: { armed_rules: 2, shadow_rules: 3, shield: true } } }, current);
  for (const text of ['On air', 'Twitch: connected', 'OBS: connected', 'Bridge up', '2 rules armed', '3 watching', '01:00:00', '214']) expect(html).toContain(text);
  expect(html).not.toContain('Simulated');
});

test('absent stream and Gatehouse fields render unknown, never offline or zero watching', () => {
  const status = { ...simulatedRead(1).status };
  delete status.stream;
  delete status.gatehouse;
  const html = render({ mode: 'core', phase: 'ready', status: { ...status, simulated: false }, bridge: { state: 'connecting' } });
  expect(html).toContain('ON AIR unknown');
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
  { mode: 'core', simulated: true },
] as const)('$mode with simulated=$simulated never presents fixture summaries as live', ({ mode, simulated }) => {
  const data = simulatedRead(1);
  const html = renderToStaticMarkup(<DesktopRampart snapshot={{ ...data, mode, phase: 'ready',
    status: { ...data.status, simulated, gatehouse: { armed_rules: 2, shadow_rules: 3, shield: true } } }}
    theme="paper" on_theme_change={() => undefined} />);
  for (const label of ['ON AIR simulated', 'Twitch simulated', 'OBS simulated', 'Gatehouse simulated']) {
    expect(html).toContain(`data-variant="dash">${label}</span>`);
  }
  expect(html).toContain('<b>Unknown</b><small>viewers</small>');
  expect(html).toContain('<b>Unknown</b><small>uptime</small>');
  for (const claim of ['cc-connection', 'connected', 'On air', '214', '01:00:00', 'Armed', 'Watching', 'Bridge up']) {
    expect(html).not.toContain(claim);
  }
});

test('fixture sidebar labels available chamber previews and leaves Map Room unconfigured', () => {
  const html = render({ mode: 'fixture', phase: 'ready', ...simulatedRead(1) });
  for (const [id, figure] of [
    ['lottery', 'Simulated draws'], ['moderator', 'Simulated moderation'],
    ['visuals', 'Simulated visuals'], ['studio', 'Not configured'],
  ]) {
    const link = html.match(new RegExp(`<a[^>]*data-module="${id}"[^>]*>[\\s\\S]*?</a>`))?.[0];
    expect(link).toContain(`<em>${figure}</em>`);
  }
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
  expect(html).toContain('0 rules armed');
  expect(html).toContain('Watching');
  expect(html).not.toContain('SIMULATED SOURCE');
  expect(html).not.toContain('ON AIR unknown');
});
