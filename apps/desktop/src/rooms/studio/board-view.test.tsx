import { readFileSync } from 'node:fs';
import { Children, isValidElement } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import { boardGeometry, parseStudioBoard, studioInks } from './board.js';
import { HexTable, TileInspector } from './hex-table.jsx';
import { StudioWork } from './room.jsx';
import { createStudioSession, updateStudioSession } from './session.js';
import { BannerInspector } from './design.jsx';

const parsed = parseStudioBoard({ title: 'Northern marches', sides: [
  { id: 'north', label: 'Northern reach', short: 'N', ink: 'azure' },
  { id: 'south', label: 'Southern reach', short: 'S', ink: 'key' },
], tiles: Array.from({ length: 12 }, (_, index) => ({
  q: index % 4 - Math.floor(Math.floor(index / 4) / 2), r: Math.floor(index / 4),
  ...(index % 3 === 2 ? {} : { side: index % 3 === 0 ? 'north' : 'south' }),
})) });
if (!parsed.ok) throw new Error(parsed.error.message);
const board = parsed.board;

const hexCss = readFileSync(new URL('./hex-field.css', import.meta.url), 'utf8');
function hexRule(selector: string): string {
  const rules = Array.from(hexCss.matchAll(/([^{}]+)\{([^{}]*)\}/g));
  const rule = rules.find(rule => rule[1]?.trim() === selector);
  expect(rule, `Missing hex rule: ${selector}`).toBeDefined();
  return rule?.[2] ?? '';
}

test('hex focus ring uses no house ink', () => {
  const rules = hexCss.match(/[^{}]*:focus-visible[^{}]*\{[^{}]*\}/g) ?? [];
  expect(rules.length).toBeGreaterThan(0);
  const focus = rules.join('\n');
  for (const ink of [...studioInks, 'house', 'look-ink']) expect(focus).not.toContain(`var(--${ink})`);
  expect(focus).toContain('var(--ink)');
  expect(focus).toContain('var(--paper)');
});

test('selected ring differs from a key-ink face', () => {
  const html = renderToStaticMarkup(<HexTable selected="B1" board={board} on_select={vi.fn()} />);
  expect(html).toMatch(/<button[^>]*data-hex-tile="B1"[^>]*data-ink="key"[^>]*aria-pressed="true"/);
  // A paper polygon separates the outer ring (including a sealed look's ink) from the face.
  const halo = hexRule('.studio-room .cc-hex:is([aria-pressed="true"], :focus-visible)::after');
  expect(halo).toContain('background: var(--paper)');
  expect(halo).toContain('inset: var(--space-2)');
  expect(hexRule('.studio-room .cc-hex[aria-pressed="true"] .cc-hex-face')).toContain('inset: var(--space-4)');
  expect(hexRule('.studio-room .cc-hex-face')).toContain('z-index: 1');
});

test('focus ring wins over sealed look ink on a selected tile', () => {
  // Equal specificity with the look selector, ordered last; selection cannot recolour focus.
  const focus = '.studio-room .cc-hex.cc-hex:focus-visible::before';
  const selected = '.studio-room [data-look-ink] .cc-hex[aria-pressed="true"]::before';
  expect(hexRule(focus)).toContain('background: var(--ink)');
  expect(hexCss.indexOf(focus)).toBeGreaterThan(hexCss.indexOf(selected));
  expect(hexRule('.studio-room .cc-hex.cc-hex:focus-visible')).toContain('z-index: 3');
});

type ButtonProps = {
  type?: string; children?: ReactNode; tabIndex?: number; disabled?: boolean; onClick?: () => void;
};
function nativeButtons(tree: ReactNode): ReactElement<ButtonProps>[] {
  const found: ReactElement<ButtonProps>[] = [];
  Children.forEach(tree, child => {
    if (!isValidElement<ButtonProps>(child)) return;
    if (child.type === 'button') found.push(child);
    else found.push(...nativeButtons(child.props.children));
  });
  return found;
}

test('custom 4 by 3 board owns its title, short labels, extents and exactly two pennants plus Unclaimed', () => {
  const html = renderToStaticMarkup(<HexTable selected="A1" board={board} on_select={vi.fn()} />);
  expect(html.match(/data-hex-tile=/g)).toHaveLength(12);
  expect(html).toContain('Northern marches · 4 × 3 hexes');
  expect(html).toContain('Inspect the 12 sample tiles');
  expect(html).toContain('--board-w:4.5;--board-h:5');
  expect(html).toContain('--x:1;--y:2.5');
  expect(html).not.toContain('House ');
  expect(html).not.toContain('Quill'); expect(html).not.toContain('Tallow');
  const pennants = html.match(/<li[^>]*>[\s\S]*?<\/li>/g) ?? [];
  expect(pennants).toHaveLength(3);
  for (const [index, label] of ['Northern reach', 'Southern reach', 'Unclaimed'].entries()) {
    expect(pennants[index]).toContain(label);
    expect(pennants[index]).toContain('<b>4</b>');
  }
  const tiles = html.match(/<button[^>]*>[\s\S]*?<\/button>/g) ?? [];
  expect(tiles.filter(tile => tile.includes('data-ink="azure"'))).toHaveLength(4);
  expect(tiles.filter(tile => tile.includes('data-ink="key"'))).toHaveLength(4);
  expect(tiles[0]).toContain('class="cc-hex-house">N<');
  expect(tiles[1]).toContain('class="cc-hex-house">S<');
  expect(pennants[0]).toContain('data-ink="azure"');
  expect(renderToStaticMarkup(<TileInspector selected="A1" board={board} />)).toMatch(/<section[^>]*data-ink="azure"/);
});

test('all custom tiles activate as native keyboard buttons and inspect the board without mutation', () => {
  const before = JSON.stringify(board);
  let session = createStudioSession(board);
  const buttons = nativeButtons(HexTable({ selected: session.selected, board,
    on_select: id => { session = updateStudioSession(session, 'tile', id, board); } }));
  expect(buttons).toHaveLength(12);
  const geometry = boardGeometry(board);
  for (const [index, button] of buttons.entries()) {
    expect(button.props.type).toBe('button');
    expect(button.props.tabIndex).toBe(index === 0 ? 0 : -1); expect(button.props.disabled).not.toBe(true);
    // Enter and Space on a native button use this activation callback.
    button.props.onClick?.();
    expect(session.selected).toBe(geometry.tiles[index]?.id);
    const html = renderToStaticMarkup(<TileInspector selected={session.selected} board={board} />);
    expect(html).toContain(`Tile ${session.selected}`); expect(html).toContain('4 of 12 tiles');
  }
  expect(JSON.stringify(board)).toBe(before);
});

test('StudioWork and its local controls consume a supplied board rather than the global fixture', () => {
  const network = vi.spyOn(globalThis, 'fetch');
  try {
    const html = renderToStaticMarkup(<StudioWork board={board} />);
    expect(html.match(/data-hex-tile=/g)).toHaveLength(12);
    expect(html).toContain('Northern marches · 4 × 3');
    expect(html).toContain('4 of 12 tiles');
    expect(html).toContain('Inspect Northern reach banner');
    expect(html).not.toContain('House Quill');
    expect(html).toMatch(/<select id="studio-map-size"[^>]*disabled/);
    expect(html).toContain('4 × 3 · 300 ms');
    const state = createStudioSession(board);
    expect(updateStudioSession(state, 'banner', 'south', board).selected).toBe('B1');
    expect(updateStudioSession(state, 'size', 'l', board)).toBe(state);
    expect(updateStudioSession(state, 'reset', '', board).selected).toBe('A1');
    const banners = renderToStaticMarkup(<BannerInspector selected="B1" board={board} on_select={vi.fn()} />);
    expect(banners.match(/<button/g)).toHaveLength(3);
    expect(banners).not.toContain('House ');
    expect(network).not.toHaveBeenCalled();
  } finally { network.mockRestore(); }
});

test('sample inspector reads D4 coordinates from geometry and supports multi-letter display columns', () => {
  const sample = renderToStaticMarkup(<TileInspector selected="D4" />);
  expect(sample).toContain('Column <strong>D</strong> · Row <strong>4</strong>');
  const wide = parseStudioBoard({ title: 'Wide map', sides: [],
    tiles: Array.from({ length: 28 }, (_, q) => ({ q, r: 0 })) });
  if (!wide.ok) throw new Error(wide.error.message);
  const inspector = renderToStaticMarkup(<TileInspector selected="AB1" board={wide.board} />);
  expect(inspector).toContain('Column <strong>AB</strong> · Row <strong>1</strong>');
  expect(inspector).toContain('28 of 28 tiles');
});

test('tile inspection announces only the Now line', () => {
  const html = renderToStaticMarkup(<TileInspector selected="D4" />);
  const root = html.match(/^<section[^>]*>/)?.[0];
  expect(root).toBeDefined();
  expect(root).not.toContain('aria-live');
  expect(html.match(/role="status"/g) ?? []).toHaveLength(1);
  expect(html).toMatch(/<p class="cc-hero-now" role="status">Now: inspecting D4 · simulated<\/p>/);
});
