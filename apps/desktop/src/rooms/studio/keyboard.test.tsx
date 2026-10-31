import { Children, isValidElement } from 'react';
import type { KeyboardEvent, ReactElement, ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import { HeraldicCard } from '@castle-control/ui';
import type { HeraldicCardProps } from '@castle-control/ui';
import { HexTable, TileInspector } from './hex-table.jsx';
import { TestLadder, ladderRungs } from './test-ladder.jsx';
import { fixtureTiles } from './fixture.js';
import { boardForSize } from './session.js';
import { boardGeometry, parseStudioBoard } from './board.js';
import type { StudioBoard } from './board.js';

type ButtonProps = {
  type?: string; children?: ReactNode; tabIndex?: number; disabled?: boolean; 'data-hex-tile'?: string;
  onClick?: () => void; onKeyDown?: (event: KeyboardEvent<HTMLButtonElement>) => void;
};
function nativeButtons(tree: ReactNode): ReactElement<ButtonProps>[] {
  const found: ReactElement<ButtonProps>[] = [];
  Children.forEach(tree, child => {
    if (!isValidElement<ButtonProps>(child)) return;
    if (child.type === 'button') found.push(child);
    // C README decision 4 replaces native rung markup with the kit's native-button tablet.
    else if (child.type === HeraldicCard && isValidElement<HeraldicCardProps>(child)) found.push(...nativeButtons(HeraldicCard(child.props)));
    else found.push(...nativeButtons(child.props.children));
  });
  return found;
}

test('all 54 hex tiles are reachable native keyboard buttons and activation changes only inspection', () => {
  const before = JSON.stringify(fixtureTiles);
  let selected = 'A1';
  const controls = nativeButtons(HexTable({ selected, on_select: id => { selected = id; } }));
  expect(controls).toHaveLength(54);
  for (const [index, control] of controls.entries()) {
    expect(control.props.type).toBe('button');
    expect(control.props.tabIndex).toBe(index === 0 ? 0 : -1);
    expect(control.props.disabled).not.toBe(true);
    // Native buttons map Enter and Space to this same activation path.
    control.props.onClick?.();
    expect(selected).toBe(fixtureTiles[index]?.id);
    expect(renderToStaticMarkup(<TileInspector selected={selected} />)).toContain(`Tile ${selected}`);
  }
  expect(JSON.stringify(fixtureTiles)).toBe(before);
});

test('exactly one hex is in the Tab order', () => {
  for (const size of ['s', 'm', 'l'] as const) {
    for (const selected of ['D4', 'missing', '']) {
      const buttons = nativeButtons(HexTable({ selected, board: boardForSize(size), on_select: vi.fn() }));
      const stops = buttons.filter(button => button.props.tabIndex === 0);
      expect(stops).toHaveLength(1);
      expect(stops[0]?.props['data-hex-tile']).toBe(selected === 'D4' ? 'D4' : 'A1');
      expect(buttons.every(button => [0, -1].includes(button.props.tabIndex ?? 1))).toBe(true);
    }
  }
});

function keyboardProbe(id: string, key: string, board = boardForSize('m'), modifiers: Partial<KeyboardEvent<HTMLButtonElement>> = {}) {
  const select = vi.fn();
  const buttons = nativeButtons(HexTable({ selected: id, board, on_select: select }));
  const focus = buttons.map(() => ({ focus: vi.fn() }));
  const event = Object.assign({} as KeyboardEvent<HTMLButtonElement>, {
    key, nativeEvent: { isComposing: false }, preventDefault: vi.fn(), stopPropagation: vi.fn(),
    currentTarget: { parentElement: { querySelectorAll: () => focus } },
  }, modifiers);
  const button = buttons.find(button => button.props['data-hex-tile'] === id);
  expect(button?.props.onKeyDown).toBeTypeOf('function');
  button?.props.onKeyDown?.(event);
  return { select, event, buttons, focus };
}

test('arrow keys move inspection to the neighbouring hex', () => {
  const before = JSON.stringify(fixtureTiles);
  for (const [key, destination] of [['ArrowRight', 'E4'], ['ArrowDown', 'D5'], ['ArrowLeft', 'C4'],
    ['ArrowUp', 'D3'], ['Home', 'A4'], ['End', 'I4']] as const) {
    const probe = keyboardProbe('D4', key);
    expect(probe.select).toHaveBeenCalledExactlyOnceWith(destination);
    const index = probe.buttons.findIndex(button => button.props['data-hex-tile'] === destination);
    expect(probe.focus[index]?.focus).toHaveBeenCalledOnce();
    expect(probe.event.preventDefault).toHaveBeenCalledOnce();
    expect(probe.event.stopPropagation).toHaveBeenCalledOnce();
  }
  for (const [id, key] of [['A1', 'ArrowLeft'], ['A1', 'ArrowUp'], ['I6', 'ArrowRight'], ['I6', 'ArrowDown']] as const) {
    const probe = keyboardProbe(id, key);
    expect(probe.select).not.toHaveBeenCalled();
    expect(probe.focus.every(target => target.focus.mock.calls.length === 0)).toBe(true);
  }
  expect(JSON.stringify(fixtureTiles)).toBe(before);
});

test('unconsumed keys propagate', () => {
  for (const key of ['1', '/', 'Tab', 'Enter', ' ']) {
    const probe = keyboardProbe('D4', key);
    expect(probe.select).not.toHaveBeenCalled();
    expect(probe.event.preventDefault).not.toHaveBeenCalled();
    expect(probe.event.stopPropagation).not.toHaveBeenCalled();
  }
  for (const modifiers of [{ ctrlKey: true }, { metaKey: true }, { altKey: true }]) {
    const probe = keyboardProbe('D4', 'ArrowRight', boardForSize('m'), modifiers);
    expect(probe.select).not.toHaveBeenCalled();
    expect(probe.event.preventDefault).not.toHaveBeenCalled();
    expect(probe.event.stopPropagation).not.toHaveBeenCalled();
  }
});

test('arrows reach every sample hex and do not jump a gap in a custom board', () => {
  for (const size of ['s', 'm', 'l'] as const) {
    const board = boardForSize(size); const geometry = boardGeometry(board);
    for (const tile of geometry.tiles) {
      for (const [key, column, row] of [['ArrowRight', tile.column + 1, tile.row], ['ArrowDown', tile.column, tile.row + 1]] as const) {
        const next = geometry.tiles.find(item => item.column === column && item.row === row);
        if (next) expect(keyboardProbe(tile.id, key, board).select).toHaveBeenCalledExactlyOnceWith(next.id);
      }
    }
  }
  const parsed = parseStudioBoard({ title: 'Sparse simulated board', sides: [], tiles: [{ q: 2, r: 0 }, { q: 0, r: 0 }, { q: 0, r: 1 }] });
  if (!parsed.ok) throw new Error(parsed.error.message);
  const board: StudioBoard = parsed.board;
  expect(keyboardProbe('A1', 'ArrowRight', board).select).not.toHaveBeenCalled();
  expect(keyboardProbe('C1', 'Home', board).select).toHaveBeenCalledExactlyOnceWith('A1');
  expect(keyboardProbe('A1', 'End', board).select).toHaveBeenCalledExactlyOnceWith('C1');
});

test('keyboard activation can inspect every ladder requirement without leaving the sand table', () => {
  let selected = 0;
  const controls = nativeButtons(TestLadder({ selected, on_select: index => { selected = index; } }));
  expect(controls).toHaveLength(3);
  for (const [index, control] of controls.entries()) {
    expect(control.props.type).toBe('button');
    expect(control.props.tabIndex).not.toBe(-1);
    expect(control.props.disabled).not.toBe(true);
    control.props.onClick?.();
    const html = renderToStaticMarkup(<TestLadder selected={selected} on_select={() => undefined} />);
    expect(html).toContain(ladderRungs[index]?.detail);
    expect(html).toContain('Current stage: Sand table');
  }
});
