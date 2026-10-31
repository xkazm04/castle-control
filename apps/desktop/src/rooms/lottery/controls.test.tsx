import { Children, isValidElement, useState } from 'react';
import type { ChangeEvent, ReactElement, ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { DrawSetup } from './setup.jsx';
import { DrawPreview } from './appearance.jsx';
import { createDrawDisplay } from './display.js';
import { createLotsPreview, checkFixturePolicy } from '../../lots-model.js';
import { styles, art } from '../../demo/model.js';
import { lotsCopy as copy } from '../../lots-copy.js';
import type { LotsPort } from '../../lots-model.js';

type FieldProps = { id?: string; children?: ReactNode; disabled?: boolean; value?: string | number;
  control_id?: string; result?: ReactNode; checked?: boolean; readOnly?: boolean; onBlur?: () => void;
  onChange?: (event: ChangeEvent<HTMLInputElement & HTMLSelectElement>) => void };
function fields(tree: ReactNode): ReactElement<FieldProps>[] {
  const found: ReactElement<FieldProps>[] = [];
  Children.forEach(tree, child => {
    if (!isValidElement<FieldProps>(child)) return;
    found.push(child);
    found.push(...fields(child.props.children));
  });
  return found;
}

function field(tree: ReactNode, id: string) {
  const control = fields(tree).find(item => item.props.id === id);
  if (!control) throw new Error(`Missing control ${id}`);
  return control.props;
}
function change(tree: ReactNode, id: string, value: string) {
  field(tree, id).onChange?.({ currentTarget: { value, valueAsNumber: value === '' ? NaN : Number(value) } } as
    ChangeEvent<HTMLInputElement & HTMLSelectElement>);
}
// Server render-phase updates exercise real React state across event sequences,
// without a DOM dependency or a mock of the draft hooks.
function setupSequence(port: LotsPort, steps: ((tree: ReactNode) => void)[]) {
  function Sequence() {
    const [step, setStep] = useState(0);
    const tree = DrawSetup({ port, on_edit: draw => port.edit(draw), on_preview: () => undefined });
    const next = steps[step];
    if (next) { next(tree); setStep(step + 1); }
    return tree;
  }
  return renderToStaticMarkup(<Sequence />);
}
function result(tree: ReactNode, id: string) {
  return fields(tree).find(item => item.props.control_id === id)?.props.result;
}

test('native pool selector keeps prize policy aligned with restricted eligibility', () => {
  const port = createLotsPreview(); port.select('free-prize');
  setupSequence(port, [tree => {
    expect(fields(tree).find(control => control.props.id === 'lots-pool')?.type).toBe('select');
    change(tree, 'lots-pool', 'subscribers');
  }]);
  expect(port.getSnapshot().draw.policy.subscriber_only).toBe(true);
  expect(checkFixturePolicy(port.getSnapshot().draw.policy).reasons).toContain('subscriber_only');
});

test('lots-06 eligibility checkboxes are derived from the pool across every control transition', () => {
  const port = createLotsPreview(); port.select('free-prize');
  for (const from of copy.pool_options) for (const to of copy.pool_options) {
    setupSequence(port, [tree => change(tree, 'lots-pool', from.value)]);
    setupSequence(port, [tree => {
      for (const [key, kind] of [['subscriber_only', 'subscribers'], ['channel_points', 'redeemers']] as const) {
        const control = field(tree, `lots-${key}`);
        expect(control.disabled || control.readOnly).toBe(true);
        expect(control.checked).toBe(from.value === kind);
      }
      change(tree, 'lots-pool', to.value);
    }]);
    const draw = port.getSnapshot().draw;
    expect(draw.rules.pool.kind).toBe(to.value);
    expect(draw.policy.subscriber_only).toBe(to.value === 'subscribers');
    expect(draw.policy.channel_points).toBe(to.value === 'redeemers');
  }
});

test('region draft keeps commas and spaces until a multi-region edit commits', () => {
  const port = createLotsPreview(); port.select('free-prize');
  const before = port.getSnapshot().draw.policy.regions;
  setupSequence(port, [
    tree => change(tree, 'lots-regions', 'CZ,'),
    tree => { expect(field(tree, 'lots-regions').value).toBe('CZ,');
      expect(port.getSnapshot().draw.policy.regions).toEqual(before); change(tree, 'lots-regions', 'CZ, '); },
    tree => { expect(field(tree, 'lots-regions').value).toBe('CZ, '); change(tree, 'lots-regions', 'CZ, SK'); },
    tree => { expect(field(tree, 'lots-regions').value).toBe('CZ, SK'); field(tree, 'lots-regions').onBlur?.(); },
    () => expect(port.getSnapshot().draw.policy.regions).toEqual(['CZ', 'SK']),
  ]);
});

test('blank name stays editable with a field hint and leaves the draw unchanged', () => {
  const port = createLotsPreview(); const before = port.getSnapshot().draw.name;
  setupSequence(port, [
    tree => change(tree, 'lots-name', ''),
    tree => { expect(field(tree, 'lots-name').value).toBe(''); expect(result(tree, 'lots-name')).toBe(copy.invalid_setup);
      expect(port.getSnapshot().draw.name).toBe(before); port.pause(); },
    tree => { expect(field(tree, 'lots-name').value).toBe(''); change(tree, 'lots-name', 'Retyped draw'); },
    tree => { expect(port.getSnapshot().draw.name).toBe('Retyped draw'); expect(result(tree, 'lots-name')).toBeUndefined(); },
  ]);
});

test('winner draft can be cleared before typing a replacement count', () => {
  const port = createLotsPreview(); const before = port.getSnapshot().draw.rules.winner_count;
  setupSequence(port, [
    tree => change(tree, 'lots-winners', ''),
    tree => { expect(field(tree, 'lots-winners').value).toBe(''); expect(result(tree, 'lots-winners')).toBe(copy.invalid_setup);
      expect(port.getSnapshot().draw.rules.winner_count).toBe(before); change(tree, 'lots-winners', '12'); },
    tree => { expect(field(tree, 'lots-winners').value).toBe('12');
      expect(port.getSnapshot().draw.rules.winner_count).toBe(12); expect(result(tree, 'lots-winners')).toBeUndefined(); },
  ]);
});

test('invalid keyword drafts stay local until a single token is typed', () => {
  const port = createLotsPreview();
  port.edit({ ...port.getSnapshot().draw, rules: { ...port.getSnapshot().draw.rules, pool: { kind: 'keyword', keyword: '!join' } } });
  setupSequence(port, [
    tree => change(tree, 'lots-keyword', ''),
    tree => { expect(field(tree, 'lots-keyword').value).toBe('');
      expect(result(tree, 'lots-keyword')).toBe(copy.invalid_setup); change(tree, 'lots-keyword', '!two tokens'); },
    tree => { expect(field(tree, 'lots-keyword').value).toBe('!two tokens');
      expect(port.getSnapshot().draw.rules.pool).toEqual({ kind: 'keyword', keyword: '!join' });
      change(tree, 'lots-keyword', '!question'); },
    tree => { expect(result(tree, 'lots-keyword')).toBeUndefined();
      expect(port.getSnapshot().draw.rules.pool).toEqual({ kind: 'keyword', keyword: '!question' }); },
  ]);
});

test('winner drafts retain raw numbers, explain rejected counts and reset on external edits', () => {
  const port = createLotsPreview();
  setupSequence(port, [
    tree => change(tree, 'lots-winners', '012'),
    tree => { expect(field(tree, 'lots-winners').value).toBe('012'); change(tree, 'lots-winners', '1.5'); },
    tree => { expect(result(tree, 'lots-winners')).toBe(copy.invalid_setup);
      expect(port.getSnapshot().draw.rules.winner_count).toBe(12); change(tree, 'lots-winners', '88'); },
    tree => { expect(field(tree, 'lots-winners').value).toBe('88');
      expect(result(tree, 'lots-winners')).toBe(copy.invalid_setup);
      expect(port.getSnapshot().draw.rules.winner_count).toBe(12);
      port.edit({ ...port.getSnapshot().draw, rules: { ...port.getSnapshot().draw.rules, winner_count: 7 } }); },
    tree => { expect(field(tree, 'lots-winners').value).toBe('7'); expect(result(tree, 'lots-winners')).toBeUndefined();
      change(tree, 'lots-name', ''); port.select('free-prize'); },
    tree => { expect(field(tree, 'lots-name').value).toBe(port.getSnapshot().draw.name);
      expect(field(tree, 'lots-winners').value).toBe(String(port.getSnapshot().draw.rules.winner_count)); },
  ]);
});

test('all style presets and every anchor/size/colour render from session parameters', () => {
  const display = createDrawDisplay();
  for (const style of styles) for (const size of ['S', 'M', 'L'] as const)
    for (const anchor of ['tl', 'tr', 'bl', 'br', 'center'] as const)
      for (const colour of ['gules', 'azure', 'or', 'key'] as const) {
        display.edit({ size, anchor, colour, art_style: style.id, reveal_ms: 750 });
        const html = renderToStaticMarkup(<DrawPreview display={display.getSnapshot()} />);
        expect(html).toContain(`data-size="${size}"`); expect(html).toContain(`data-anchor="${anchor}"`);
        expect(html).toContain(`data-colour="${colour}"`); expect(html).toContain(art(style.id, 'urn'));
        expect(html).toContain('--draw-reveal:750ms'); expect(html).toContain('SIMULATED · SAMPLE ART');
      }
});
