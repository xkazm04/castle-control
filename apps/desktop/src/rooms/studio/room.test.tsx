import { lazy, Suspense } from 'react';
import { readFileSync } from 'node:fs';
import { renderToReadableStream, renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import { ProposalQueue, SimulatedSteward } from '@castle-control/ui/steward';
import Room, { StudioWork } from './room.jsx';
import { fixtureTiles } from './fixture.js';
import { TestLadder } from './test-ladder.jsx';
import { TileInspector } from './hex-table.jsx';
import SealSlot from '../seal-slot/index.jsx';

test('fixture studio shows all 54 hexes and the local-only test ladder', () => {
  const html = renderToStaticMarkup(<Room snapshot={{ mode: 'fixture', phase: 'ready' }} />);
  expect(fixtureTiles).toHaveLength(54);
  expect(html.match(/data-hex-tile=/g)).toHaveLength(54);
  for (const text of ['9 × 6', 'Sand table', 'Muster', 'Proclaimed', 'WP 4.0']) expect(html).toContain(text);
  expect(html).not.toContain('studio-room-notice');
  expect(html).not.toContain('Hold to seal');
  expect(html).not.toContain('Approve the move');
});

test('core studio is honestly unconfigured and hides all sample controls', () => {
  const html = renderToStaticMarkup(<Room snapshot={{ mode: 'core', phase: 'connecting' }} />);
  // Brief item 6 retains the shell's honest core empty state rather than fixture C controls.
  expect(html).toContain('The map table is bare');
  expect(html).not.toContain('data-hex-tile');
  expect(html).not.toContain('<button');
});

test('war-table proposals stay in dashed draft layers without claiming a tile or advancing the ladder', async () => {
  const queue = new ProposalQueue();
  const steward = new SimulatedSteward(queue);
  const before = JSON.stringify(fixtureTiles);
  await steward.ask('what should the next turn be', { surface: 'room', chamber: 'studio' });
  await steward.ask('test fire 50 gifts', { surface: 'room', chamber: 'visuals' });
  const html = renderToStaticMarkup(<StudioWork queue={queue} />);
  expect(html).toContain('room-proposal-draft');
  expect(html).toContain('DRAFT · NOT ON AIR');
  expect(html).toContain('data-on-air="false"');
  expect(html).not.toContain('50 gifts');
  expect(html).toContain('Current stage: Sand table');
  expect(queue.pending('studio')).toHaveLength(1);
  expect(JSON.stringify(fixtureTiles)).toBe(before);
});

test('inspecting a locked rung does not move the filled current-stage indicator', () => {
  const markup = renderToStaticMarkup(<TestLadder selected={2} on_select={vi.fn()} />);
  // C README decision 4 uses kit tablets: attribute order changes, current and inspected remain separate.
  const buttons = markup.match(/<button[^>]*>/g) ?? [];
  expect(buttons[0]).toContain('aria-label="Inspect Sand table requirements"');
  expect(buttons[0]).toContain('aria-pressed="false"'); expect(buttons[0]).toContain('data-current="true"');
  expect(buttons[2]).toContain('aria-label="Inspect Proclaimed requirements"');
  expect(buttons[2]).toContain('aria-pressed="true"'); expect(buttons[2]).toContain('data-current="false"');
  expect(markup).toContain('Current stage: Sand table');
});

test.each([
  { state: 'Local only', indices: [0] },
  { state: 'Locked', indices: [1, 2] },
])('ladder tablets describe their $state state without changing their names', ({ state, indices }) => {
  const markup = renderToStaticMarkup(<>
    <TestLadder selected={0} on_select={vi.fn()} />
    <TestLadder selected={2} on_select={vi.fn()} />
  </>);
  const buttons = markup.match(/<button[^>]*>[\s\S]*?<\/button>/g) ?? [];
  const states = markup.match(/<span[^>]*class="cc-tablet-state"[^>]*>[\s\S]*?<\/span>/g) ?? [];
  expect(buttons).toHaveLength(6);
  const description_ids = [];
  for (const offset of [0, 3]) {
    for (const index of indices) {
      const button = buttons[offset + index] ?? '';
      const title = ['Sand table', 'Muster', 'Proclaimed'][index];
      expect(button.match(/aria-label="([^"]+)"/)?.[1]).toBe(`Inspect ${title} requirements`);
      const description_id = button.match(/aria-describedby="([^"]+)"/)?.[1];
      expect(description_id).toBeTruthy();
      description_ids.push(description_id);
      const descriptions = states.filter(span => span.includes(`id="${description_id}"`));
      expect(descriptions).toHaveLength(1);
      expect(descriptions[0]?.replace(/<[^>]*>/g, '')).toBe(state);
      expect(button).not.toMatch(/\s(?:aria-)?disabled=/);
    }
  }
  expect(new Set(description_ids).size).toBe(description_ids.length);
});

test('C inspector banner, ghost and shadow follow the selected house including unclaimed', () => {
  for (const [id, house, share] of [['A1', 'House Quill', 14], ['F1', 'House Tallow', 14],
    ['D4', 'House Sable', 15], ['E1', 'unclaimed', 11]] as const) {
    const html = renderToStaticMarkup(<TileInspector selected={id} />);
    expect(html).toMatch(new RegExp(`<section[^>]*data-house="${house}"`));
    expect(html).toContain(`data-text="${id}"`);
    expect(html).toContain(`${share} of 54 tiles`);
    expect(html).toContain('--cc-ink:var(--house)');
    expect(html).toContain('--cc-shadow-ink:var(--house-shadow)');
    expect(html).toContain('data-band="hero"');
  }
});

test('C keeps ink text large, fits all six rows and delegates locked/current cards to the kit', () => {
  const css = readFileSync(new URL('./room.css', import.meta.url), 'utf8');
  const field = readFileSync(new URL('./hex-field.css', import.meta.url), 'utf8');
  const plate = readFileSync(new URL('../../../../../packages/ui/src/heraldic-plate.css', import.meta.url), 'utf8');
  const cards = readFileSync(new URL('../../../../../packages/ui/src/heraldic-card.css', import.meta.url), 'utf8');
  expect(field).toMatch(/\.cc-hex-id\s*\{[^}]*font:\s*800 clamp\(var\(--text-wordmark\)/);
  expect(plate).toMatch(/\[data-band="hero"\] \.cc-plate-title\s*\{[^}]*font-size:\s*var\(--text-wordmark\)/);
  expect(field).toContain('container-type: size');
  expect(field).toContain('var(--board-w)'); expect(field).toContain('var(--board-h)');
  expect(field).toContain('var(--x)'); expect(field).toContain('var(--y)');
  expect(field).not.toMatch(/16\.46|9\.52|9\.5|data-row-offset/);
  expect(css).not.toContain('data-house="House');
  expect(renderToStaticMarkup(<Room snapshot={{ mode: 'fixture', phase: 'ready' }} />)).toContain('--board-w:9.5;--board-h:9.5');
  expect(field).toContain('var(--space-4) var(--space-4) 0 var(--key)');
  expect(css + field).not.toMatch(/#[\da-f]{3,8}\b|\brgba?\(|\bhsla?\(|\b\d+(?:\.\d+)?px\b/i);
  expect(css).toContain('--house-shadow: var(--hair)');
  expect(cards).toMatch(/\[data-locked="true"\]\s*\{[^}]*border-style:\s*dashed/);
  for (let inspected = 0; inspected < 3; inspected += 1) {
    const html = renderToStaticMarkup(<TestLadder selected={inspected} on_select={vi.fn()} />);
    const buttons = html.match(/<button[^>]*>[\s\S]*?<\/button>/g) ?? [];
    expect(buttons).toHaveLength(3);
    expect(buttons.filter(button => button.includes('data-current="true"'))).toHaveLength(1);
    expect(buttons[0]).toContain('data-current="true"');
    expect(buttons.filter(button => button.includes('aria-pressed="true"'))).toEqual([buttons[inspected]]);
    for (const button of buttons.slice(1)) {
      expect(button).toContain('data-locked="true"');
      expect(button).toContain('data-stage-icon="lock"');
    }
    expect(html).toContain('class="cc-proclamation" role="status"');
  }
});

test('C draft and the unchanged shared slot have exactly one hold control', async () => {
  const queue = new ProposalQueue();
  await new SimulatedSteward(queue).ask('what should the next turn be', { surface: 'room', chamber: 'studio' });
  const slot = <SealSlot chamber="studio" queue={queue} />;
  const html = renderToStaticMarkup(<StudioWork queue={queue} seal_slot={slot} />);
  expect(html).toContain(renderToStaticMarkup(slot));
  expect(html).toContain('DRAFT · NOT ON AIR');
  expect(html.match(/aria-label="Hold to seal and proclaim"/g)).toHaveLength(1);
  expect(html.match(/aria-label="Seal slot"/g)).toHaveLength(1);
  expect(html).toContain('cc-seal-card');
  expect(html.match(/Proposal · awaiting your seal/g)).toHaveLength(1);
  expect(queue.pending('studio')).toHaveLength(1);
});

test('default module loads lazily with no network or submission action', async () => {
  const network = vi.spyOn(globalThis, 'fetch');
  try {
    const LazyRoom = lazy(() => import('./room.jsx'));
    const stream = await renderToReadableStream(<Suspense fallback={<p>Opening</p>}>
      <LazyRoom snapshot={{ mode: 'fixture', phase: 'ready' }} />
    </Suspense>);
    await stream.allReady;
    const html = await new Response(stream).text();
    expect(html).toContain('WP 4.0');
    expect(html).not.toContain('\u2014');
    expect(html).not.toContain('Submit');
    expect(network).not.toHaveBeenCalled();
  } finally { network.mockRestore(); }
});
