import { readFileSync } from 'node:fs';
import { Children, isValidElement } from 'react';
import type { ChangeEvent, ReactElement, ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import { tokens } from '@castle-control/tokens';
import type { LotsDraw, LotsWeightCurve } from '@castle-control/contract';
import { fixtureDraws, fixturePool } from '../../lots-fixture.js';
import { capLimit, cohortShares, curveWeight, max_units_range, newcomersToOutweighHeaviest, steppedCurve,
  weightSummary, weightTable } from './equalizer-model.js';
import { WeightEqualizer } from './equalizer.jsx';

const base = fixtureDraws[0];
if (!base) throw new Error('Missing simulated fixture draw');
const concave: LotsWeightCurve = { kind: 'concave', max_units: 4 };
const withRules = (change: Partial<LotsDraw['rules']>): LotsDraw => ({ ...base, rules: { ...base.rules, ...change } });
const concaveDraw = withRules({ weight_curve: concave, free_join_equal_odds: false });

type Props = { children?: ReactNode; onClick?: () => void; disabled?: boolean; id?: string;
  onChange?: (event: ChangeEvent<HTMLSelectElement>) => void; 'data-curve'?: string; 'data-step'?: string };
function elements(tree: ReactNode): ReactElement<Props>[] {
  const found: ReactElement<Props>[] = [];
  Children.forEach(tree, child => {
    if (!isValidElement<Props>(child)) return;
    found.push(child);
    found.push(...elements(child.props.children));
  });
  return found;
}
const find = (tree: ReactNode, match: (props: Props) => boolean) => {
  const element = elements(tree).find(item => match(item.props));
  if (!element) throw new Error('Missing control');
  return element.props;
};

test('concave ladder mirrors cc-lots WeightCurve::weight and the simulated fixture pool', () => {
  expect(weightTable(concave, false).map(step => step.weight)).toEqual([4, 8, 11, 13, 14]);
  expect(weightTable(concave, false).map(step => step.gain)).toEqual([0, 4, 3, 2, 1]);
  const entries = fixturePool(concaveDraw);
  expect(entries.length).toBeGreaterThan(0);
  for (const entry of entries) expect(entry.weight).toBe(curveWeight(concave, entry.number % 5));
  // Linear reference sits above the concave curve beyond the first unit.
  for (const step of weightTable(concave, false).slice(2)) expect(step.linear).toBeGreaterThan(step.weight);
  expect(curveWeight({ kind: 'concave', max_units: 2 }, 9)).toBe(curveWeight({ kind: 'concave', max_units: 2 }, 2));
});

test('newcomer comparison follows WeightTable::new: heaviest / newcomer + 1, absent without entries', () => {
  const summary = weightSummary(concave, false, fixturePool(concaveDraw));
  expect(summary).toMatchObject({ newcomer_weight: 4, heaviest_weight: 14, newcomers_to_outweigh_heaviest: 4, heaviest_source: 'entries' });
  expect(4 * 4).toBeGreaterThan(14);
  expect(3 * 4).toBeLessThanOrEqual(14);
  expect(weightSummary({ kind: 'equal' }, false, fixturePool(base))).toMatchObject({ newcomer_weight: 1, heaviest_weight: 1, newcomers_to_outweigh_heaviest: 2 });
  expect(weightSummary(concave, false, []).newcomers_to_outweigh_heaviest).toBeUndefined();
  expect(weightSummary(concave, false)).toMatchObject({ heaviest_weight: 14, heaviest_source: 'curve', newcomers_to_outweigh_heaviest: 4 });
  expect(newcomersToOutweighHeaviest(4, 16)).toBe(5);
});

test('the free !join path flattens every level to equal odds', () => {
  expect(weightTable(concave, true).map(step => step.weight)).toEqual([1, 1, 1, 1, 1]);
  expect(weightSummary(concave, true, fixturePool(withRules({ weight_curve: concave, free_join_equal_odds: true }))))
    .toMatchObject({ newcomer_weight: 1, heaviest_weight: 1, newcomers_to_outweigh_heaviest: 2 });
  const html = renderToStaticMarkup(<WeightEqualizer draw={withRules({ weight_curve: concave, free_join_equal_odds: true })} entries={[]} />);
  expect(html).toContain('data-eq-note="free"');
  expect(html).toContain('data-flat="true"');
});

test('raider cap uses the same floor as respectsCaps and cc-lots CohortCap', () => {
  expect(capLimit(3, { cohort: 'raider', numerator: 1, denominator: 3 })).toBe(1);
  expect(capLimit(7, { cohort: 'raider', numerator: 2, denominator: 3 })).toBe(4);
  expect(capLimit(15, { cohort: 'raider', numerator: 3, denominator: 3 })).toBe(15);
  expect(capLimit(5, { cohort: 'raider', numerator: 0, denominator: 3 })).toBe(0);
  expect(capLimit(5, undefined)).toBeUndefined();
});

test('cohort shares compare heads with weight held', () => {
  const shares = cohortShares(fixturePool(concaveDraw));
  expect(shares.map(row => row.cohort)).toEqual(['new_account', 'subscriber', 'raider']);
  expect(shares.reduce((sum, row) => sum + row.weight_share, 0)).toBeCloseTo(1);
  expect(shares.reduce((sum, row) => sum + row.count, 0)).toBe(fixturePool(concaveDraw).length);
  expect(cohortShares([]).every(row => row.weight_share === 0 && row.count_share === 0)).toBe(true);
});

test('stepper clamps to the card range and switching to concave submits a concave curve', () => {
  expect(steppedCurve({ kind: 'equal' }, 0)).toEqual({ kind: 'concave', max_units: 4 });
  expect(steppedCurve({ kind: 'concave', max_units: max_units_range.max }, 1)).toEqual({ kind: 'concave', max_units: max_units_range.max });
  expect(steppedCurve({ kind: 'concave', max_units: 1 }, -1)).toEqual({ kind: 'concave', max_units: 1 });
  const on_edit = vi.fn<(draw: LotsDraw) => void>();
  const equalDraw = withRules({ free_join_equal_odds: false });
  const tree = WeightEqualizer({ draw: equalDraw, entries: fixturePool(equalDraw), on_edit });
  find(tree, props => props['data-curve'] === 'concave').onClick?.();
  expect(on_edit).toHaveBeenLastCalledWith(expect.objectContaining({
    rules: expect.objectContaining({ weight_curve: { kind: 'concave', max_units: 4 } }) }));
  const raised = WeightEqualizer({ draw: concaveDraw, entries: fixturePool(concaveDraw), on_edit });
  find(raised, props => props['data-step'] === '1').onClick?.();
  expect(on_edit).toHaveBeenLastCalledWith(expect.objectContaining({
    rules: expect.objectContaining({ weight_curve: { kind: 'concave', max_units: 5 } }) }));
  find(raised, props => props.id === 'lots-eq-cap').onChange?.({ currentTarget: { value: '0' } } as ChangeEvent<HTMLSelectElement>);
  expect(on_edit).toHaveBeenLastCalledWith(expect.objectContaining({
    rules: expect.objectContaining({ cohort_caps: [{ cohort: 'raider', numerator: 0, denominator: 3 }] }) }));
  const locked = WeightEqualizer({ draw: concaveDraw, entries: fixturePool(concaveDraw), on_edit, disabled: true });
  expect(find(locked, props => props['data-curve'] === 'equal').disabled).toBe(true);
  on_edit.mockClear();
  find(locked, props => props['data-step'] === '-1').onClick?.();
  expect(on_edit).not.toHaveBeenCalled();
});

test('renders the headline, ladder, cohort split and cap meter; core mode stays honest', () => {
  const html = renderToStaticMarkup(<WeightEqualizer draw={concaveDraw} entries={fixturePool(concaveDraw)} on_edit={() => undefined} />);
  expect(html).toContain('4 newcomers (4 × 4 = 16) outweigh the heaviest entrant (14).');
  expect(html).toContain('Weight by activity: 0 units 4, 1 unit 8, 2 units 11, 3 units 13, 4 units 14.');
  expect(html).toContain('data-eq-role="newcomer"');
  expect(html).toContain('data-eq-role="heaviest"');
  expect(html).toContain('Raiders can take at most 1 of 3 winners.');
  expect(html).toContain('aria-pressed="true"');
  expect(html).toContain('Weight share: New accounts');
  const core = renderToStaticMarkup(<WeightEqualizer draw={concaveDraw} entries={undefined} />);
  expect(core).toContain('Cohorts are not part of the core roll');
  expect(core).toContain('curve ceiling');
  expect(core).not.toContain('data-curve');
});

test('equalizer CSS is token-only: no raw colour or px, and every var is a token or a local --eq- value', () => {
  const css = readFileSync(new URL('./equalizer.css', import.meta.url), 'utf8');
  expect(css).not.toMatch(/#[\da-f]{3,8}\b|\brgba?\(|\bhsla?\(|\b\d+(?:\.\d+)?px\b/i);
  const known = new Set([...Object.keys(tokens.layout), ...Object.keys(tokens.theme.paper), ...Object.keys(tokens.type), ...Object.keys(tokens.cutaway)]);
  for (const [, token] of css.matchAll(/var\(--([\w-]+)/g)) {
    expect(known.has(token ?? '') || (token ?? '').startsWith('eq-')).toBe(true);
  }
});
