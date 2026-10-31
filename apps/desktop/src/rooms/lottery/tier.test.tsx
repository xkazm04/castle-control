import { Children, isValidElement } from 'react';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import { OVERLORD_URN_TEMPLATE } from '@castle-control/renderer';
import type { LotsDraw } from '@castle-control/contract';
import { fixtureDraws } from '../../lots-fixture.js';
import { UrnTierPreset } from './tier.jsx';

type Tierish = { 'data-tier'?: string; onClick?: () => void; children?: ReactNode };
function buttons(node: ReactNode, found: Tierish[] = []): Tierish[] {
  Children.forEach(node, child => {
    if (!isValidElement<Tierish>(child)) return;
    if (child.props['data-tier']) found.push(child.props);
    buttons(child.props.children, found);
  });
  return found;
}
const draw = fixtureDraws[0];

test('the Overlord urn preset offers the plan’s 3 / 7 / 15 counts and presses the matching tier', () => {
  if (!draw) throw new Error('Missing simulated draw');
  expect(OVERLORD_URN_TEMPLATE.winner_count_by_tier).toMatchObject({ s: 3, m: 7, l: 15 });
  const html = renderToStaticMarkup(<UrnTierPreset draw={draw} shape="urn" on_edit={vi.fn()} on_shape={vi.fn()} entry_count={10} />);
  expect(html.match(/data-tier=/g)).toHaveLength(3);
  expect(html).toMatch(/data-tier="s" aria-pressed="true"/);
  expect(html).toMatch(/data-tier="l" aria-pressed="false" disabled=""/);
  const wheel = renderToStaticMarkup(<UrnTierPreset draw={draw} shape="wheel" on_edit={vi.fn()} on_shape={vi.fn()} />);
  expect(wheel).not.toContain('aria-pressed="true"');
});

test('one click sets the urn and the tier winner count, and leaves an already-matching count alone', () => {
  if (!draw) throw new Error('Missing simulated draw');
  const on_edit = vi.fn<(draw: LotsDraw) => void>(); const on_shape = vi.fn();
  const tree = UrnTierPreset({ draw, shape: 'deck', on_edit, on_shape });
  const [small, medium] = buttons(tree);
  medium?.onClick?.();
  expect(on_shape).toHaveBeenLastCalledWith('urn');
  expect(on_edit.mock.calls.at(-1)?.[0].rules.winner_count).toBe(7);
  expect(on_edit.mock.calls.at(-1)?.[0].rules.weight_curve).toEqual(draw.rules.weight_curve);
  small?.onClick?.();
  expect(on_edit).toHaveBeenCalledTimes(1);
  expect(on_shape).toHaveBeenCalledTimes(2);
});
