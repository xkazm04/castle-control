import { Children, isValidElement } from 'react';
import type { ChangeEvent, InputHTMLAttributes, ReactElement, ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { createBeaconsPreview } from '../../beacons-model.js';
import { OfferingTimeline } from './timeline.jsx';
import { TestFire } from './test-fire.jsx';
import { VisualSelector } from './room.jsx';

type NativeControl = { type?: string; children?: ReactNode; tabIndex?: number; disabled?: boolean; onClick?: () => void };
function buttons(tree: ReactNode): ReactElement<NativeControl>[] {
  const found: ReactElement<NativeControl>[] = [];
  Children.forEach(tree, child => {
    if (!isValidElement<NativeControl>(child)) return;
    if (child.type === 'button') found.push(child);
    else found.push(...buttons(child.props.children));
  });
  return found;
}
function range(tree: ReactNode): ReactElement<InputHTMLAttributes<HTMLInputElement>> {
  let found: ReactElement<InputHTMLAttributes<HTMLInputElement>> | undefined;
  const walk = (node: ReactNode) => Children.forEach(node, child => {
    if (!isValidElement<InputHTMLAttributes<HTMLInputElement>>(child)) return;
    if (child.type === 'input' && child.props.type === 'range') found = child;
    else walk(child.props.children);
  });
  walk(tree);
  if (!found) throw new Error('Expected native keyboard range');
  return found;
}

test('timeline native keyboard range reaches every offering, including Home and End endpoints', () => {
  let selected = 0;
  const control = range(OfferingTimeline({ selected, on_select: index => { selected = index; } }));
  expect(control.props.min).toBe('0');
  expect(control.props.max).toBe(59);
  expect(control.props.step).toBe('1');
  expect(control.props.tabIndex).not.toBe(-1);
  expect(control.props.disabled).not.toBe(true);
  // Native range ArrowRight/Left/Home/End dispatch change, without a custom keymap.
  for (const position of [...Array.from({ length: 60 }, (_, index) => index), 0, 59]) {
    control.props.onChange?.({ currentTarget: { valueAsNumber: position } } as ChangeEvent<HTMLInputElement>);
    const html = renderToStaticMarkup(<OfferingTimeline selected={selected} on_select={() => undefined} />);
    expect(html).toContain(`Offering ${position + 1} of 60`);
    expect(html).toContain('aria-label="Inspect offering"');
  }
});

test('all visual selection and test-fire actions are tabbable native buttons with Enter/Space activation', () => {
  const port = createBeaconsPreview();
  const initial = port.getSnapshot();
  const selections = buttons(VisualSelector({ visuals: initial.visuals, selected: initial.selected,
    on_select: item => port.select(item.visual.visual_id) }));
  expect(selections).toHaveLength(3);
  selections.forEach((button, index) => {
    expect(button.props.type).toBe('button');
    expect(button.props.tabIndex).not.toBe(-1);
    expect(button.props.disabled).not.toBe(true);
    // Browsers deliver click for Enter/Space on native buttons.
    button.props.onClick?.();
    expect(port.getSnapshot().selected).toBe(initial.visuals[index]?.visual.visual_id);
  });
  const selected = port.getSnapshot().visuals.find(item => item.visual.visual_id === port.getSnapshot().selected);
  if (!selected) throw new Error('Expected selected visual');
  let ended = false;
  const controls = buttons(TestFire({ port, selected, on_end: () => { ended = true; } }));
  expect(controls).toHaveLength(4);
  for (const control of controls) {
    expect(control.props.type).toBe('button');
    expect(control.props.tabIndex).not.toBe(-1);
    expect(control.props.disabled).not.toBe(true);
    control.props.onClick?.();
  }
  expect(port.getSnapshot().events).toHaveLength(initial.events.length + 51);
  expect(port.getSnapshot().elapsed_s).toBe(60);
  expect(ended).toBe(true);
});
