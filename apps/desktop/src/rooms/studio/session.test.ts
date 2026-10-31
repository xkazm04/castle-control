import { expect, test } from 'vitest';
import { createStudioSession, tilesForSize, updateStudioSession } from './session.js';
import { fixtureTiles } from './fixture.js';

test('all map sizes preserve sample records, grow deterministically and repair a selection when shrinking', () => {
  const before = JSON.stringify(fixtureTiles);
  let state = createStudioSession();
  expect(tilesForSize('m')).toBe(fixtureTiles);
  for (const [size, count] of [['s', 24], ['m', 54], ['l', 96]] as const) {
    const tiles = tilesForSize(size);
    expect(tiles).toHaveLength(count);
    expect(new Set(tiles.map(tile => tile.id)).size).toBe(count);
    expect(tiles).toEqual(tilesForSize(size));
  }
  state = updateStudioSession(state, 'size', 'l');
  state = updateStudioSession(state, 'tile', 'L8');
  expect(state.selected).toBe('L8');
  state = updateStudioSession(state, 'size', 's');
  expect(state.selected).toBe('A1');
  expect(updateStudioSession(state, 'tile', 'L8')).toBe(state);
  expect(JSON.stringify(fixtureTiles)).toBe(before);
});

test('banner inspection selects a real tile of that house without claiming territory', () => {
  const state = createStudioSession();
  for (const [house, id] of [['House Quill', 'A1'], ['House Tallow', 'F1'],
    ['House Sable', 'D4'], ['unclaimed', 'E1']] as const) {
    expect(updateStudioSession(state, 'banner', house).selected).toBe(id);
  }
  expect(updateStudioSession(state, 'banner', 'missing')).toBe(state);
  expect(state.selected).toBe('A1');
});

test('kept styles, colour and anchor choices update session data only; invalid values preserve it', () => {
  let state = createStudioSession();
  state = updateStudioSession(state, 'anchor', 'bottom_right');
  state = updateStudioSession(state, 'colour', 'azure');
  state = updateStudioSession(state, 'art_style', 'pixel');
  expect(state.design).toMatchObject({ anchor: 'bottom_right', colour: 'azure', art_style: 'pixel' });
  for (const field of ['size', 'anchor', 'colour', 'art_style'] as const) {
    expect(updateStudioSession(state, field, 'unknown')).toBe(state);
  }
  expect(updateStudioSession(state, 'reset')).toEqual(createStudioSession());
});

test('reveal duration rejects blank, fractional and out-of-range values, preserves preview, and replays explicitly', () => {
  const state = updateStudioSession(createStudioSession(), 'reveal_ms', '850');
  expect(state.design.reveal_ms).toBe(850);
  for (const value of ['', '-1', '0.5', '60001', 'Infinity', '1e2']) {
    const invalid = updateStudioSession(state, 'reveal_ms', value);
    expect(invalid.design.reveal_ms).toBe(850);
    expect(invalid.reveal_input).toBe(value);
    expect(invalid.error).toContain('whole number from 0 to 60000');
    expect(updateStudioSession(invalid, 'reveal_ms', '0')).not.toHaveProperty('error');
  }
  expect(updateStudioSession(state, 'replay').reveal_run).toBe(1);
  expect(updateStudioSession(state, 'reveal_ms', '60000').design.reveal_ms).toBe(60000);
});
