import { Children, isValidElement } from 'react';
import type { ChangeEvent, ReactElement, ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { DrawSetup } from './setup.jsx';
import { DrawPreview } from './appearance.jsx';
import { createDrawDisplay } from './display.js';
import { createLotsPreview, checkFixturePolicy } from '../../lots-model.js';
import { styles, art } from '../../demo/model.js';

type FieldProps = { id?: string; children?: ReactNode; disabled?: boolean;
  onChange?: (event: ChangeEvent<HTMLInputElement & HTMLSelectElement>) => void };
function fields(tree: ReactNode): ReactElement<FieldProps>[] {
  const found: ReactElement<FieldProps>[] = [];
  Children.forEach(tree, child => {
    if (!isValidElement<FieldProps>(child)) return;
    if (child.type === 'select' || child.type === 'input') found.push(child);
    found.push(...fields(child.props.children));
  });
  return found;
}

test('native pool selector keeps prize policy aligned with restricted eligibility', () => {
  const port = createLotsPreview(); port.select('free-prize');
  const controls = fields(DrawSetup({ port, on_edit: draw => port.edit(draw), on_preview: () => undefined }));
  const pool = controls.find(control => control.props.id === 'lots-pool');
  expect(pool?.type).toBe('select');
  pool?.props.onChange?.({ currentTarget: { value: 'subscribers' } } as ChangeEvent<HTMLInputElement & HTMLSelectElement>);
  expect(port.getSnapshot().draw.policy.subscriber_only).toBe(true);
  expect(checkFixturePolicy(port.getSnapshot().draw.policy).reasons).toContain('subscriber_only');
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
