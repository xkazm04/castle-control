import type { CSSProperties } from 'react';
import { EmptyState, HeroReadout, Pennant, Plate, PlateBand, PlateBody, SectionHeading } from '@castle-control/ui';
import { studioCopy as copy } from '../../studio-copy.js';
import { fixtureHouses, fixtureTiles } from './fixture.js';
import type { HexTile } from './fixture.js';
import { mapSizes } from './session.js';
import type { MapSize } from './session.js';

type HexPosition = CSSProperties & { '--c': number; '--r': number };
const hexPosition = (column: number, row: number): HexPosition => ({ '--c': column, '--r': row });

export function HexTable({ selected, on_select, tiles = fixtureTiles, size = 'm' }: {
  selected: string; on_select: (id: string) => void; tiles?: readonly HexTile[]; size?: MapSize;
}) {
  const dimensions = mapSizes.find(item => item.id === size) ?? mapSizes[1];
  const geometry: CSSProperties & Record<string, number> = { '--columns': dimensions.columns + .5,
    '--rows': dimensions.rows * 1.5 + .5, '--field-width': (dimensions.columns + .5) * Math.sqrt(3) + .01,
    '--field-height': dimensions.rows * 1.5 + .52 };
  return <div className="cc-herald-field" role="region" aria-label={copy.board_label(dimensions.columns, dimensions.rows)}>
    <SectionHeading variant="inline" level={2} title={copy.board_title(dimensions.columns, dimensions.rows)} gloss={copy.board_gloss} />
    <div className="cc-hexfield" data-map-size={size} style={size === 'm' ? undefined : geometry}><div className="cc-hexfield-plate" role="group" aria-label={copy.tiles_label(tiles.length)}>
      {tiles.map(tile => <button type="button" className="cc-hex" key={tile.id} data-hex-tile={tile.id}
        data-house={tile.owner ?? 'unclaimed'} data-row-offset={tile.row % 2 === 1}
        style={hexPosition(tile.column, tile.row)}
        aria-label={copy.tile_label(tile.id, tile.owner ?? 'unclaimed')} aria-pressed={selected === tile.id}
        onClick={() => on_select(tile.id)}>
        <span className="cc-hex-face" aria-hidden="true" />
        <span className="cc-hex-id">{tile.id}</span>
        <span className="cc-hex-house">{tile.owner?.replace('House ', '') ?? copy.free}</span>
      </button>)}
    </div></div>
    <ul className="cc-pennants">{[...fixtureHouses, undefined].map(house => <li key={house ?? 'unclaimed'} data-house={house ?? 'unclaimed'}>
      <Pennant variant="standing" word={house ?? copy.unclaimed}
        count={String(tiles.filter(tile => tile.owner === house).length)}
        style={{ '--cc-ink': 'var(--house)', ...(house ? {} : { borderLeftColor: 'var(--hair)', borderLeftStyle: 'dashed' }) }} />
    </li>)}</ul>
  </div>;
}

export function TileInspector({ selected, tiles = fixtureTiles }: { selected: string; tiles?: readonly HexTile[] }) {
  const tile = tiles.find(item => item.id === selected);
  if (!tile) return <EmptyState title={copy.no_tile} description={copy.no_tile_hint} />;
  const house = tile.owner ?? copy.unclaimed;
  const share = tiles.filter(item => item.owner === tile.owner).length;
  return <Plate className="cc-hero" data-house={tile.owner ?? 'unclaimed'} border_ink="rule"
    aria-label={copy.selected_tile} aria-live="polite" offset="space-6"
    style={{ '--cc-ink': 'var(--house)', '--cc-band-text': 'var(--house-press)', '--cc-shadow-ink': 'var(--house-shadow)' }}
    band={<PlateBand variant="hero" title={house} count={copy.sample} />}>
    <PlateBody className="cc-hero-body" style={{ '--cc-body-padding': 'var(--space-14)' }}>
      <p className="cc-hero-kicker">{copy.turn}</p>
      <div className="studio-tile-figure">
        <svg className="cc-swatch" viewBox="0 0 28 32" aria-hidden="true"><polygon points="14,1 27,8.5 27,23.5 14,31 1,23.5 1,8.5" /></svg>
        <HeroReadout value={tile.id} caption={copy.tile_title(tile.id)} scale="display" ghost="shadow"
          style={{ '--cc-ink': 'var(--house-shadow)' }} />
        <span className="cc-hero-sub"><span>{copy.column} <strong>{tile.id.charAt(0)}</strong> · {copy.row} <strong>{tile.row + 1}</strong></span>
          <span>{copy.share(share, tiles.length)}</span></span>
      </div>
      <p className="cc-hero-now">{copy.now(tile.id)}</p>
      <p className="cc-hero-house">{copy.territory(house)}</p>
      <p className="cc-hero-note">{copy.steward_note}</p>
      <p className="cc-hero-hint">{copy.hint}</p>
    </PlateBody>
  </Plate>;
}
