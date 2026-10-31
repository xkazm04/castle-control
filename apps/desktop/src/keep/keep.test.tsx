import { expect, test, vi } from 'vitest';
import { chambers } from '@castle-control/ui';
import { renderToStaticMarkup } from 'react-dom/server';
import { KeepEntrance, KeepRoomTile } from './keep.jsx';
import { Keep } from './keep.jsx';
import { keepReadModel } from './read-model.js';
import { simulatedRead } from '../simulated.js';
import { fixtureVisuals } from '../beacons-fixture.js';
import { fixtureHeld } from '../moderation-fixture.js';

test('every Keep room click opens its chamber and Enter the keep invokes Overview', () => {
  const open = vi.fn(); const enter = vi.fn();
  for (const chamber of chambers) {
    const tile = KeepRoomTile({ chamber, word: 'Sample', line: 'Illustrative room', on_open: open });
    tile.props.onClick();
    expect(open).toHaveBeenLastCalledWith(chamber.id);
  }
  KeepEntrance({ on_enter: enter }).props.children[0].props.onClick();
  expect(enter).toHaveBeenCalledOnce();
});

test('each tower renders its large word and plain line from the read model', () => {
  const snapshot = { mode: 'fixture', phase: 'ready', ...simulatedRead(1) } as const;
  const read = keepReadModel(snapshot);
  expect(read.states.moderator.word).toBe(`${fixtureHeld.length} held`);
  expect(read.states.lottery.word).toBe('No draw');
  expect(read.states.visuals.word).toBe(fixtureVisuals[0]?.name);
  expect(read.states.studio.word).toBe('Sand table');
  const html = renderToStaticMarkup(<Keep snapshot={snapshot} on_open={vi.fn()} on_enter={vi.fn()} />);
  for (const { id } of chambers) {
    const tile = html.split(`data-room-tile="${id}"`)[1]?.split('</button>')[0];
    expect(tile).toContain(`<strong class="keep-room-word">${read.states[id].word}</strong>`);
    expect(tile).toContain(`<span class="keep-room-line" id="keep-room-${id}-state">${read.states[id].line}</span>`);
  }
});

test('each keep tile is described by its visible state line without changing its name', () => {
  const read = keepReadModel({ mode: 'fixture', phase: 'ready', ...simulatedRead(1) });
  const ids = new Set<string>();
  for (const chamber of chambers) {
    const { word, line } = read.states[chamber.id];
    const html = renderToStaticMarkup(KeepRoomTile({ chamber, word, line, on_open: vi.fn() }));
    expect(html).toContain(`aria-label="Open ${chamber.name}"`);
    const description_id = /aria-describedby="([^"]+)"/.exec(html)?.[1];
    expect(description_id).toBeTruthy();
    const description = new RegExp(`<span[^>]*id="${description_id}"[^>]*>([^<]*)</span>`).exec(html);
    expect(description?.[0]).toContain('class="keep-room-line"');
    expect(description?.[1]).toBe(line);
    ids.add(description_id ?? '');
  }
  expect(ids.size).toBe(chambers.length);
});

test('the Keep has no concept heading or duplicate sample labels and retains its entrance key', () => {
  const html = renderToStaticMarkup(<Keep on_open={vi.fn()} on_enter={vi.fn()} />);
  for (const text of ['<h1', 'The lit keep', 'Your channel is your keep.', 'ILLUSTRATIVE SAMPLE DATA', 'Room preview · sample data']) {
    expect(html).not.toContain(text);
  }
  expect(html).toContain('Enter the keep <kbd>0</kbd>');
});

test('missing core chamber states stay unknown rather than borrowing fixture words', () => {
  const read = keepReadModel({ mode: 'core', phase: 'ready', ...simulatedRead(1) });
  for (const { id } of chambers) expect(read.states[id].word).toBe('Unknown');
});
