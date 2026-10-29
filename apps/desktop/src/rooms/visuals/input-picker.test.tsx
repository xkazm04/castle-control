import { Children, isValidElement } from 'react';
import type { ChangeEvent, ReactElement, ReactNode, SelectHTMLAttributes } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import type { ContributionSource } from '@castle-control/contract';
import { InputPicker } from './input-picker.jsx';
import { contributionInput, contribution_sources, source_labels } from './contribution-input.js';

const expected_units = {
  cheer: 'bits', bits_use: 'bits', subscribe: 'count', gift: 'count', resub: 'count',
  power_up: 'count', hype_train: 'level', channel_points: 'points', charity: 'minor_currency', goal: 'minor_currency',
} as const satisfies Record<ContributionSource, string>;

test('native unit mapping covers every contribution source', () => {
  expect(new Set(contribution_sources)).toEqual(new Set(Object.keys(expected_units)));
  for (const source of contribution_sources) expect(contributionInput(source)).toEqual({ source, unit: expected_units[source] });
});

function select(tree: ReactNode): ReactElement<SelectHTMLAttributes<HTMLSelectElement>> {
  let result: ReactElement<SelectHTMLAttributes<HTMLSelectElement>> | undefined;
  const walk = (node: ReactNode) => Children.forEach(node, child => {
    if (!isValidElement<SelectHTMLAttributes<HTMLSelectElement>>(child)) return;
    if (child.type === 'select') result = child;
    else walk(child.props.children);
  });
  walk(tree);
  if (!result) throw new Error('Missing native select');
  return result;
}

test('Driven by lists all sources with the feed labels, plus Not routed for legacy visuals', () => {
  const html = renderToStaticMarkup(<InputPicker source="" busy={false} on_change={() => undefined} />);
  expect(html).toContain('Driven by');
  expect(html.match(/<option /g)).toHaveLength(11);
  expect(html).toContain('<option value="" selected="">Not routed</option>');
  for (const source of contribution_sources) expect(html).toContain(`value="${source}">${source_labels[source]}</option>`);
  expect(html).toContain('Native unit:');
  expect(html).toContain('Not routed</output>');
});

test('keyboard native selection changes source and the read-only unit without a custom key handler', () => {
  let source: ContributionSource | '' = '';
  const render = () => InputPicker({ source, busy: false, on_change: value => { source = value; } });
  const control = select(render());
  expect(control.props.name).toBe('input_source');
  expect(control.props['aria-label']).toBe('Driven by');
  expect(control.props.disabled).toBe(false);
  expect(control.props.tabIndex).not.toBe(-1);
  expect(control.props.onKeyDown).toBeUndefined();
  // Native select Arrow/Home/End/type-ahead selection dispatches change. This
  // Node handler test covers that path; it does not emulate browser key dispatch.
  for (const value of [...contribution_sources, ''] as const) {
    select(render()).props.onChange?.({ currentTarget: { value } } as ChangeEvent<HTMLSelectElement>);
    expect(source).toBe(value);
    const html = renderToStaticMarkup(render());
    expect(html).toContain(`>${value ? expected_units[value] : 'Not routed'}</output>`);
    expect(html).toContain('aria-label="Native unit"');
  }
});

test('busy picker prevents edits and unknown selections do not become an input', () => {
  let source: ContributionSource | '' = 'gift';
  const control = select(InputPicker({ source, busy: true, on_change: value => { source = value; } }));
  expect(control.props.disabled).toBe(true);
  control.props.onChange?.({ currentTarget: { value: 'unknown' } } as ChangeEvent<HTMLSelectElement>);
  expect(source).toBe('gift');
});
