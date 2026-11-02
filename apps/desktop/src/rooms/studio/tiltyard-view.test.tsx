import { readFileSync } from 'node:fs';
import { renderToReadableStream, renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import Room, { MoreMenu, StudioViewSwitch } from './room.jsx';
import TiltyardView, { FixtureDuel } from './tiltyard-view.jsx';
import LocalDuelDemos from './local-duel-demos.jsx';

test('the Map Room opens on the duel: one SAMPLE match, SIMULATED, ready with its keys and no network', () => {
  const network = vi.spyOn(globalThis, 'fetch');
  try {
    const stage = renderToStaticMarkup(<TiltyardView />);
    expect(stage).toContain('aria-label="The duel stage"');
    expect(stage).toContain('data-phase="ready"');
    expect(stage.match(/data-role="ty-card"/g)).toHaveLength(2);
    expect(stage).toContain('Raze the mill'); expect(stage).toContain('Borrow the mill');
    expect(stage).toContain('What does the village do with the mill?');
    expect(stage).toContain('Semifinal'); expect(stage).toContain('Match 1 of 3');
    expect(stage).toContain('<span class="cc-sim" data-role="ty-simulated">Simulated</span>');
    expect(stage).toContain('Open the vote'); expect(stage).toContain('Full bracket');
    // Two semifinals and the final in the section summary; the full seeded tree is in the drawer.
    expect(stage.match(/class="duel-bracket__match" data-state=/g)).toHaveLength(3);
    expect(stage).toContain('data-role="ty-champ-slot"');
    expect(stage).not.toContain('data-role="ty-match"');
    expect(stage).toContain('More'); expect(stage).not.toContain('Show the duel on stream');
    expect(network).not.toHaveBeenCalled();
  } finally { network.mockRestore(); }
});

test('a Steward draft takes the stage marked DRAFT, with controls frozen and its first match shown', () => {
  const html = renderToStaticMarkup(<FixtureDuel draft={{ preset: 'custom', title: 'Snacks', prompt: 'Which snack wins?',
    entries: [{ title: 'Crisps' }, { title: 'Popcorn' }, { title: 'Pretzels' }, { title: 'Grapes' }], window_s: 30 }} />);
  expect(html).toContain('Draft · not started');
  expect(html).toContain('data-draft="true"');
  expect(html).toContain('Which snack wins?');
  // Seed 1 meets seed 4 first.
  expect([...html.matchAll(/data-role="ty-card-title">([^<]+)</g)].map(match => match[1]).join(' v ')).toBe('Crisps v Grapes');
  expect(html).toContain('30');
  expect(html).not.toContain('data-role="ty-simulated"');
  expect((html.match(/<button[^>]*data-action[^>]*>/g) ?? []).every(button => button.includes('disabled'))).toBe(true);
});

test('Showdown and Ladder stay reachable as local demos without a second Chat engine', () => {
  const html = renderToStaticMarkup(<LocalDuelDemos mode="show" />);
  expect(html).toContain('aria-label="Local duel demos · Showdown and Ladder"');
  expect(html.match(/data-role="ty-pennant"/g)).toHaveLength(2);
  expect(html).toContain('data-mode="show"'); expect(html).toContain('data-mode="ladder"');
  expect(html).not.toContain('data-mode="chat"');
  expect(html).toContain('Local demo');
});

test.each(['show', 'ladder'] as const)('the deferred %s view retains the local demo markup', async view => {
  const stream = await renderToReadableStream(<TiltyardView view={view} />);
  await stream.allReady;
  const html = (await new Response(stream).text()).replace(/<!--.*?-->/g, '');
  expect(html).toBe(renderToStaticMarkup(<LocalDuelDemos mode={view} />));
});

test('More is one closed disclosure; the sand-table switch keeps its three views', () => {
  const more = renderToStaticMarkup(<MoreMenu view="duel" on_view={vi.fn()} />);
  expect(more).toContain('aria-haspopup="menu"'); expect(more).toContain('aria-expanded="false"');
  expect(more).not.toContain('role="menu"');
  const row = renderToStaticMarkup(<StudioViewSwitch view="spyglass" on_view={vi.fn()} />);
  const buttons = row.match(/<button[^>]*>[\s\S]*?<\/button>/g) ?? [];
  expect(buttons.map(button => button.replace(/<[^>]*>/g, ''))).toEqual(['Table', 'Spyglass', 'Rehearse']);
  expect(buttons.filter(button => button.includes('aria-pressed="true"'))).toHaveLength(1);
});

test('the core fallback stays bare and the stage keeps its separate lazy door', () => {
  const core = renderToStaticMarkup(<Room snapshot={{ mode: 'core', phase: 'connecting' }} seal_slot={<p>Shared seal slot</p>} />);
  expect(core).toContain('The map table is bare');
  expect(core).toContain('Shared seal slot');
  expect(core).not.toContain('duel stage');
  expect(readFileSync(new URL('./room.tsx', import.meta.url), 'utf8')).toContain("lazy(() => import('./tiltyard-view.jsx'))");
});
