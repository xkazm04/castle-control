import { Children, isValidElement } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { HexTable, TileInspector } from './hex-table.jsx';
import { TestLadder, ladderRungs } from './test-ladder.jsx';
import { fixtureTiles } from './fixture.js';

type ButtonProps = { type?: string; children?: ReactNode; tabIndex?: number; disabled?: boolean; onClick?: () => void };
function nativeButtons(tree: ReactNode): ReactElement<ButtonProps>[] {
  const found: ReactElement<ButtonProps>[] = [];
  Children.forEach(tree, child => {
    if (!isValidElement<ButtonProps>(child)) return;
    if (child.type === 'button') found.push(child);
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
    expect(control.props.tabIndex).not.toBe(-1);
    expect(control.props.disabled).not.toBe(true);
    // Native buttons map Enter and Space to this same activation path.
    control.props.onClick?.();
    expect(selected).toBe(fixtureTiles[index]?.id);
    expect(renderToStaticMarkup(<TileInspector selected={selected} />)).toContain(`Tile ${selected}`);
  }
  expect(JSON.stringify(fixtureTiles)).toBe(before);
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
