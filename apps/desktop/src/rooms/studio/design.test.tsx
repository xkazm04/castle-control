import { Children, isValidElement } from 'react';
import type { ChangeEvent, ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import { art, styles } from '../../demo/model.js';
import { BannerInspector, MapPreview, StudioDesignControls } from './design.jsx';
import { HexTable, TileInspector } from './hex-table.jsx';
import { createStudioSession, tilesForSize, updateStudioSession } from './session.js';
import type { SessionField } from './session.js';

type ControlProps = {
  children?: ReactNode; id?: string; disabled?: boolean; 'aria-label'?: string;
  onChange?: (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void; onClick?: () => void;
};
function controls(tree: ReactNode): ControlProps[] {
  const found: ControlProps[] = [];
  Children.forEach(tree, child => {
    if (!isValidElement<ControlProps>(child)) return;
    if (child.props.onChange || child.props.onClick) found.push(child.props);
    found.push(...controls(child.props.children));
  });
  return found;
}

test('native kit field changes reach the session reducer and visibly update the preview without a network call', () => {
  const fetch = vi.spyOn(globalThis, 'fetch');
  let session = createStudioSession();
  const change = (field: SessionField, value?: string) => { session = updateStudioSession(session, field, value); };
  try {
    for (const [field, value] of [['size', 'l'], ['anchor', 'bottom_left'], ['colour', 'or'],
      ['style', 'glass'], ['reveal', '1200']] as const) {
      const tree = StudioDesignControls({ session, on_change: change });
      const fieldControl = controls(tree).find(control => control.id === `studio-map-${field}`);
      expect(fieldControl?.onChange).toBeTypeOf('function');
      fieldControl?.onChange?.(Object.assign({} as ChangeEvent<HTMLInputElement>, { currentTarget: { value } }));
    }
    const html = renderToStaticMarkup(<StudioDesignControls session={session} on_change={change} />);
    for (const attribute of ['data-size="l"', 'data-anchor="bottom_left"', 'data-colour="or"',
      'data-reveal-ms="1200"', '/art/preset-glass-hexmap.webp', '--studio-colour:var(--or)', '--studio-reveal:1200ms']) {
      expect(html).toContain(attribute);
    }
    const buttons = controls(StudioDesignControls({ session, on_change: change })).filter(control => control.onClick);
    expect(buttons).toHaveLength(2);
    buttons[0]?.onClick?.(); expect(session.reveal_run).toBe(1);
    buttons[1]?.onClick?.(); expect(session).toEqual(createStudioSession());
    expect(fetch).not.toHaveBeenCalled();
  } finally { fetch.mockRestore(); }
});

test('every kept style uses its read-only hexmap art and a simulated provenance label', () => {
  expect(styles).toHaveLength(6);
  for (const style of styles) {
    const session = updateStudioSession(createStudioSession(), 'art_style', style.id);
    const html = renderToStaticMarkup(<MapPreview session={session} />);
    expect(html).toContain(`src="${art(style.id, 'hexmap')}"`);
    expect(html).toContain('SIMULATED · SAMPLE ART · AI-generated');
  }
});

test('banner controls inspect first territory, disclose no ownership change, and disable missing banners', () => {
  let session = createStudioSession();
  const select = (house: string) => { session = updateStudioSession(session, 'banner', house); };
  const props = controls(BannerInspector({ tiles: tilesForSize('m'), selected: session.selected, on_select: select }));
  expect(props).toHaveLength(4);
  const tallow = props.find(control => control['aria-label'] === 'Inspect House Tallow banner');
  tallow?.onClick?.(); expect(session.selected).toBe('F1');
  const html = renderToStaticMarkup(<BannerInspector tiles={tilesForSize('m')} selected={session.selected} on_select={select} />);
  expect(html).toContain('never claims a tile or joins a side');
  expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
  expect(controls(BannerInspector({ tiles: [], selected: 'missing', on_select: select })).every(button => button.disabled)).toBe(true);
});

test('all three map sizes render matching geometry, accessible tile inventory and correct inspector shares', () => {
  for (const size of ['s', 'm', 'l'] as const) {
    const tiles = tilesForSize(size);
    const markup = renderToStaticMarkup(<HexTable selected="F1" size={size} tiles={tiles} on_select={vi.fn()} />);
    expect(markup.match(/data-hex-tile=/g)).toHaveLength(tiles.length);
    expect(markup).toContain(`Inspect the ${tiles.length} sample tiles`);
    expect(markup.match(/aria-pressed="true"/g)).toHaveLength(1);
    const inspector = renderToStaticMarkup(<TileInspector selected="F1" tiles={tiles} />);
    const share = tiles.filter(tile => tile.owner === 'House Tallow').length;
    expect(inspector).toContain(`${share} of ${tiles.length} tiles`);
  }
});
