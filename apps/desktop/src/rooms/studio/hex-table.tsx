import type { CSSProperties } from 'react';
import type { DesignOutput } from '@castle-control/ui/design';
import { EmptyState, HeroReadout, Pennant, Plate, PlateBand, PlateBody, SectionHeading } from '@castle-control/ui';
import { studioCopy as copy } from '../../studio-copy.js';
import { STUDIO_SAMPLE_BOARD } from './fixture.js';
import { boardGeometry } from './board.js';
import type { StudioBoard } from './board.js';
import type { MapSize } from './session.js';

type HexPosition = CSSProperties & { '--x': number; '--y': number };
const hexPosition = (x: number, y: number): HexPosition => ({ '--x': x, '--y': y });

export function HexTable({ selected, on_select, board = STUDIO_SAMPLE_BOARD, size = 'm', look }: {
  selected: string; on_select: (id: string) => void; board?: StudioBoard; size?: MapSize; look?: DesignOutput['style'];
}) {
  const geometry = boardGeometry(board);
  const style: CSSProperties & Record<string, number> = { '--board-w': geometry.width, '--board-h': geometry.height,
    '--fit-w': geometry.fit_width, '--fit-h': geometry.fit_height };
  return <div className="cc-herald-field" role="region" aria-label={copy.board_label(geometry.columns, geometry.rows, board.title)}
    data-look-ink={look?.ink} data-treatment={look?.treatment} data-density={look?.density}>
    <SectionHeading variant="inline" level={2} title={copy.board_title(geometry.columns, geometry.rows, board.title)} gloss={copy.board_gloss} />
    <div className="cc-hexfield" data-map-size={size} style={style}><div className="cc-hexfield-plate" role="group" aria-label={copy.tiles_label(geometry.tiles.length)}>
      {geometry.tiles.map(tile => <button type="button" className="cc-hex" key={tile.id} data-hex-tile={tile.id}
        data-house={tile.side?.label ?? 'unclaimed'} data-ink={tile.side?.ink} data-unclaimed={!tile.side}
        style={hexPosition(tile.centre.x, tile.centre.y)}
        aria-label={copy.tile_label(tile.id, tile.side?.label ?? 'unclaimed')} aria-pressed={selected === tile.id}
        onClick={() => on_select(tile.id)}>
        <span className="cc-hex-face" aria-hidden="true" />
        <span className="cc-hex-id">{tile.id}</span>
        <span className="cc-hex-house">{tile.side?.short ?? copy.free}</span>
      </button>)}
    </div></div>
    <ul className="cc-pennants">{geometry.sides.map(side => <li key={side.id} data-house={side.label} data-ink={side.ink}>
      <Pennant variant="standing" word={side.label} count={String(side.count)} style={{ '--cc-ink': 'var(--house)' }} />
    </li>)}<li data-house="unclaimed" data-unclaimed="true">
      <Pennant variant="standing" word={copy.unclaimed} count={String(geometry.unclaimed)}
        style={{ '--cc-ink': 'var(--house)', borderLeftColor: 'var(--hair)', borderLeftStyle: 'dashed' }} />
    </li></ul>
  </div>;
}

export function TileInspector({ selected, board = STUDIO_SAMPLE_BOARD }: { selected: string; board?: StudioBoard }) {
  const geometry = boardGeometry(board);
  const tile = geometry.tiles.find(item => item.id === selected);
  if (!tile) return <EmptyState title={copy.no_tile} description={copy.no_tile_hint} />;
  const house = tile.side?.label ?? copy.unclaimed;
  const share = tile.side ? geometry.sides.find(side => side.id === tile.side?.id)?.count ?? 0 : geometry.unclaimed;
  return <Plate className="cc-hero" data-house={tile.side?.label ?? 'unclaimed'} data-ink={tile.side?.ink} data-unclaimed={!tile.side} border_ink="rule"
    aria-label={copy.selected_tile} aria-live="polite" offset="space-6"
    style={{ '--cc-ink': 'var(--house)', '--cc-band-text': 'var(--house-press)', '--cc-shadow-ink': 'var(--house-shadow)' }}
    band={<PlateBand variant="hero" title={house} count={copy.sample} />}>
    <PlateBody className="cc-hero-body" style={{ '--cc-body-padding': 'var(--space-14)' }}>
      <p className="cc-hero-kicker">{copy.turn}</p>
      <div className="studio-tile-figure">
        <svg className="cc-swatch" viewBox="0 0 28 32" aria-hidden="true"><polygon points="14,1 27,8.5 27,23.5 14,31 1,23.5 1,8.5" /></svg>
        <HeroReadout value={tile.id} caption={copy.tile_title(tile.id)} scale="display" ghost="shadow"
          style={{ '--cc-ink': 'var(--house-shadow)' }} />
        <span className="cc-hero-sub"><span>{copy.column} <strong>{tile.column_label}</strong> · {copy.row} <strong>{tile.row + 1}</strong></span>
          <span>{copy.share(share, geometry.tiles.length)}</span></span>
      </div>
      <p className="cc-hero-now">{copy.now(tile.id)}</p>
      <p className="cc-hero-house">{copy.territory(house)}</p>
      <p className="cc-hero-note">{copy.steward_note}</p>
      <p className="cc-hero-hint">{copy.hint}</p>
    </PlateBody>
  </Plate>;
}
