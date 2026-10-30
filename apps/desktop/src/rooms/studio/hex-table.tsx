import type { CSSProperties } from 'react';
import { HeroReadout, Pennant, Plate, PlateBand, PlateBody, SectionHeading } from '@castle-control/ui';
import { studioCopy as copy } from '../../studio-copy.js';
import { fixtureHouses, fixtureTiles } from './fixture.js';

type HexPosition = CSSProperties & { '--c': number; '--r': number };
const hexPosition = (column: number, row: number): HexPosition => ({ '--c': column, '--r': row });

export function HexTable({ selected, on_select }: { selected: string; on_select: (id: string) => void }) {
  return <div className="cc-herald-field" role="region" aria-label={copy.board_label}>
    <SectionHeading variant="inline" level={2} title={copy.board_title} gloss={copy.board_gloss} />
    <div className="cc-hexfield"><div className="cc-hexfield-plate" role="group" aria-label={copy.tiles_label}>
      {fixtureTiles.map(tile => <button type="button" className="cc-hex" key={tile.id} data-hex-tile={tile.id}
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
        count={String(fixtureTiles.filter(tile => tile.owner === house).length)}
        style={{ '--cc-ink': 'var(--house)', ...(house ? {} : { borderLeftColor: 'var(--hair)', borderLeftStyle: 'dashed' }) }} />
    </li>)}</ul>
  </div>;
}

export function TileInspector({ selected }: { selected: string }) {
  const tile = fixtureTiles.find(item => item.id === selected) ?? fixtureTiles[0];
  if (!tile) return null;
  const house = tile.owner ?? copy.unclaimed;
  const share = fixtureTiles.filter(item => item.owner === tile.owner).length;
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
          <span>{copy.share(share, fixtureTiles.length)}</span></span>
      </div>
      <p className="cc-hero-now">{copy.now(tile.id)}</p>
      <p className="cc-hero-house">{copy.territory(house)}</p>
      <p className="cc-hero-note">{copy.steward_note}</p>
      <p className="cc-hero-hint">{copy.hint}</p>
    </PlateBody>
  </Plate>;
}
