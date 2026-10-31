import { FieldGroup, InkButton, Plate, PlateBody, SectionHeading } from '@castle-control/ui';
import type { CSSProperties } from 'react';
import { art, styles } from '../../demo/model.js';
import { studioCopy as copy } from '../../studio-copy.js';
import { STUDIO_SAMPLE_BOARD } from './fixture.js';
import { boardGeometry } from './board.js';
import type { StudioBoard } from './board.js';
import { boardForSize, mapAnchors, mapColours, mapSizes } from './session.js';
import type { SessionField, StudioSession } from './session.js';
import './design.css';

export function BannerInspector({ board = STUDIO_SAMPLE_BOARD, selected, on_select }: {
  board?: StudioBoard; selected: string; on_select: (side: string) => void;
}) {
  const geometry = boardGeometry(board);
  const current = geometry.tiles.find(tile => tile.id === selected);
  const banners = [...geometry.sides, { id: '', label: copy.unclaimed, count: geometry.unclaimed }];
  return <section className="studio-banners" aria-label={copy.banners}>
    <SectionHeading variant="inline" title={copy.banners} />
    <div role="group" aria-label={copy.banner_choices}>
      {banners.map(side => <InkButton key={side.id} size="small"
        aria-label={copy.inspect_banner(side.label)} aria-pressed={!!current && (current.side?.id ?? '') === side.id}
        disabled={side.count === 0} onClick={() => on_select(side.id)}>
        {side.label}
      </InkButton>)}
    </div>
    <p className="cc-side-fine">{copy.banner_hint}</p>
  </section>;
}

export function StudioDesignControls({ session, on_change, board }: {
  session: StudioSession; on_change: (field: SessionField, value?: string) => void; board?: StudioBoard;
}) {
  const { design } = session;
  const geometry = boardGeometry(board ?? boardForSize(design.size));
  return <Plate className="studio-design" border_ink="rule" aria-label={copy.design}>
    <PlateBody>
      <SectionHeading variant="ruled" title={copy.design} />
      <p className="cc-side-fine">{copy.session_only}</p>
      <div className="studio-design-fields">
        <FieldGroup control_id="studio-map-size" label={copy.size} variant="select">
          <select id="studio-map-size" value={design.size} disabled={!!board} onChange={event => on_change('size', event.currentTarget.value)}>
            {board ? <option value={design.size}>{geometry.columns} × {geometry.rows}</option>
              : mapSizes.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </FieldGroup>
        <FieldGroup control_id="studio-map-anchor" label={copy.anchor} variant="select" hint={copy.anchor_hint}>
          <select id="studio-map-anchor" aria-describedby="studio-map-anchor-hint" value={design.anchor} onChange={event => on_change('anchor', event.currentTarget.value)}>
            {mapAnchors.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </FieldGroup>
        <FieldGroup control_id="studio-map-colour" label={copy.colour} variant="select" hint={copy.colour_hint}>
          <select id="studio-map-colour" aria-describedby="studio-map-colour-hint" value={design.colour} onChange={event => on_change('colour', event.currentTarget.value)}>
            {mapColours.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </FieldGroup>
        <FieldGroup control_id="studio-map-style" label={copy.art_style} variant="select" hint={copy.art_style_hint}>
          <select id="studio-map-style" aria-describedby="studio-map-style-hint" value={design.art_style} onChange={event => on_change('art_style', event.currentTarget.value)}>
            {styles.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </FieldGroup>
        <FieldGroup control_id="studio-map-reveal" label={copy.reveal} hint={copy.reveal_hint}>
          <input id="studio-map-reveal" type="number" min={0} max={60000} step={1} value={session.reveal_input}
            aria-invalid={!!session.error} aria-describedby={`studio-map-reveal-hint${session.error ? ' studio-reveal-error' : ''}`}
            onChange={event => on_change('reveal_ms', event.currentTarget.value)} />
        </FieldGroup>
      </div>
      {session.error && <p id="studio-reveal-error" role="alert">{session.error}</p>}
      <MapPreview session={session} {...(board ? { board } : {})} />
      <div className="studio-design-actions">
        <InkButton size="small" onClick={() => on_change('replay')}>{copy.replay}</InkButton>
        <InkButton size="small" onClick={() => on_change('reset')}>{copy.reset}</InkButton>
      </div>
    </PlateBody>
  </Plate>;
}

export function MapPreview({ session, board }: { session: StudioSession; board?: StudioBoard }) {
  const { design } = session;
  const dimensions = boardGeometry(board ?? boardForSize(design.size));
  const style: CSSProperties & { '--studio-colour': string; '--studio-reveal': string } = {
    '--studio-colour': `var(--${design.colour})`, '--studio-reveal': `${design.reveal_ms}ms`,
  };
  return <figure className="studio-map-preview" aria-label={copy.preview} style={style}
    data-size={design.size} data-anchor={design.anchor} data-colour={design.colour}
    data-reveal-ms={design.reveal_ms} data-reveal-run={session.reveal_run}>
    <div className="studio-map-art">
      <img key={`${design.art_style}-${design.size}-${design.reveal_ms}-${session.reveal_run}`}
        src={art(design.art_style, 'hexmap')} alt={copy.art_alt} />
    </div>
    <figcaption>{copy.simulated_art} · {dimensions.columns} × {dimensions.rows} · {design.reveal_ms} ms</figcaption>
  </figure>;
}
