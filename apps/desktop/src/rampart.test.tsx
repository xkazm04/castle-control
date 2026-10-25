import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { DesktopView } from './view.jsx';
import { simulatedRead } from './simulated.js';
import type { Snapshot } from './model.js';
import type { ModuleId } from '@castle-control/ui';

function render(snapshot: Snapshot, current: ModuleId = 'lottery') {
  return renderToStaticMarkup(<DesktopView current={current} snapshot={snapshot} theme="stock"
    on_navigate={() => undefined} on_theme_change={() => undefined} search="" on_search={() => undefined} />);
}

test.each(['lottery', 'moderator', 'visuals', 'studio'] as const)('%s renders authoritative stream, bridge, OBS and moderation summaries', current => {
  const data = simulatedRead(1);
  const html = render({ mode: 'core', phase: 'ready', status: { ...data.status, simulated: false,
    twitch_connected: false, uptime_ms: 999, gatehouse: { armed_rules: 2, shadow_rules: 3, shield: true } }, bridge: data.bridge }, current);
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

test('explicit offline and zero rules remain distinct from unknown', () => {
  const html = render({ mode: 'fixture', phase: 'ready', ...simulatedRead(0) });
  expect(html).toContain('Offline');
  expect(html).toContain('0 rules armed');
  expect(html).toContain('Watching');
  expect(html).toContain('SIMULATED SOURCE');
  expect(html).not.toContain('ON AIR unknown');
});
