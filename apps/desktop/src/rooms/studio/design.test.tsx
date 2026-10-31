import { Children, isValidElement } from 'react';
import type { ChangeEvent, ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import { art, styles } from '../../demo/model.js';
import { BannerInspector, MapPreview, StudioDesignControls } from './design.jsx';
import { HexTable, TileInspector } from './hex-table.jsx';
import { boardForSize, createStudioSession, tilesForSize, updateStudioSession } from './session.js';
import { parseStudioBoard } from './board.js';
import type { SessionField } from './session.js';
import { studioCopy as copy } from '../../studio-copy.js';

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
  const props = controls(BannerInspector({ board: boardForSize('m'), selected: session.selected, on_select: select }));
  expect(props).toHaveLength(4);
  const tallow = props.find(control => control['aria-label'] === 'Inspect House Tallow banner');
  tallow?.onClick?.(); expect(session.selected).toBe('F1');
  const html = renderToStaticMarkup(<BannerInspector board={boardForSize('m')} selected={session.selected} on_select={select} />);
  expect(html).toContain('never claims a tile or joins a side');
  expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
  const empty = parseStudioBoard({ ...boardForSize('m'), tiles: [{ q: 0, r: 0 }] });
  if (!empty.ok) throw new Error(empty.error.message);
  const banners = controls(BannerInspector({ board: empty.board, selected: 'missing', on_select: select }));
  expect(banners.slice(0, 3).every(button => button.disabled)).toBe(true);
  expect(banners[3]?.disabled).toBe(false);
});

test('all three map sizes render matching geometry, accessible tile inventory and correct inspector shares', () => {
  for (const size of ['s', 'm', 'l'] as const) {
    const tiles = tilesForSize(size);
    const markup = renderToStaticMarkup(<HexTable selected="F1" size={size} board={boardForSize(size)} on_select={vi.fn()} />);
    expect(markup.match(/data-hex-tile=/g)).toHaveLength(tiles.length);
    expect(markup).toContain(`Inspect the ${tiles.length} sample tiles`);
    expect(markup.match(/aria-pressed="true"/g)).toHaveLength(1);
    const inspector = renderToStaticMarkup(<TileInspector selected="F1" board={boardForSize(size)} />);
    const share = tiles.filter(tile => tile.owner === 'House Tallow').length;
    expect(inspector).toContain(`${share} of ${tiles.length} tiles`);
  }
});

test('every hex name contains its visible text', () => {
  const custom = parseStudioBoard({ title: 'Simulated names', sides: [{ id: 'north', label: 'Northern reach', short: 'N', ink: 'azure' }],
    tiles: [{ q: 0, r: 0, side: 'north' }, { q: 1, r: 0 }] });
  if (!custom.ok) throw new Error(custom.error.message);
  for (const board of [...(['s', 'm', 'l'] as const).map(boardForSize), custom.board]) {
    const html = renderToStaticMarkup(<HexTable selected="D4" board={board} on_select={vi.fn()} />);
    const tiles = html.match(/<button[^>]*>[\s\S]*?<\/button>/g) ?? [];
    expect(tiles).toHaveLength(board.tiles.length);
    for (const tile of tiles) {
      const name = tile.match(/aria-label="([^"]+)"/)?.[1]?.toLowerCase() ?? '';
      const id = tile.match(/class="cc-hex-id">([^<]+)</)?.[1]?.toLowerCase() ?? '';
      const house = tile.match(/class="cc-hex-house">([^<]+)</)?.[1]?.toLowerCase() ?? '';
      expect(id).not.toBe(''); expect(house).not.toBe('');
      expect(name).toContain(id); expect(name).toContain(house);
      expect(name).toContain(`${id} ${house}`);
    }
  }
});

test('one word for unclaimed', () => {
  const html = renderToStaticMarkup(<HexTable selected="E1" on_select={vi.fn()} />);
  expect(html.includes('Free')).toBe(false);
  expect(html).toContain(`class="cc-hex-house">${copy.unclaimed}<`);
  const banners = renderToStaticMarkup(<BannerInspector selected="E1" on_select={vi.fn()} />);
  expect(banners).toContain(`aria-label="Inspect ${copy.unclaimed} banner"`);
});

test('design controls are described', () => {
  for (const session of [createStudioSession(), updateStudioSession(createStudioSession(), 'reveal_ms', '-1')]) {
    const html = renderToStaticMarkup(<StudioDesignControls session={session} on_change={vi.fn()} />);
    for (const field of ['anchor', 'colour', 'style', 'reveal']) {
      const id = `studio-map-${field}`;
      const control = html.match(new RegExp(`<(?:select|input)[^>]*id="${id}"[^>]*>`))?.[0] ?? '';
      const descriptions = control.match(/aria-describedby="([^"]+)"/)?.[1]?.split(' ') ?? [];
      expect(descriptions).toContain(`${id}-hint`);
      expect(html).toContain(`id="${id}-hint"`);
      if (field === 'reveal') {
        expect(descriptions.includes('studio-reveal-error')).toBe(!!session.error);
        expect(descriptions).toHaveLength(session.error ? 2 : 1);
      }
    }
  }
});

test('preview-only controls say so', () => {
  const html = renderToStaticMarkup(<StudioDesignControls session={createStudioSession()} on_change={vi.fn()} />);
  for (const field of ['anchor', 'colour', 'style', 'reveal']) {
    const hint = html.match(new RegExp(`<p[^>]*id="studio-map-${field}-hint"[^>]*>([^<]+)</p>`))?.[1] ?? '';
    expect(hint.toLowerCase()).toContain('preview');
  }
});
