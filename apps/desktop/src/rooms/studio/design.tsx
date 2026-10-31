import { FieldGroup, InkButton, Plate, PlateBody, SectionHeading } from '@castle-control/ui';
import type { CSSProperties } from 'react';
import { art, styles } from '../../demo/model.js';
import { studioCopy as copy } from '../../studio-copy.js';
import { fixtureHouses } from './fixture.js';
import type { HexTile } from './fixture.js';
import { mapAnchors, mapColours, mapSizes } from './session.js';
import type { SessionField, StudioSession } from './session.js';
import './design.css';

export function BannerInspector({ tiles, selected, on_select }: {
  tiles: readonly HexTile[]; selected: string; on_select: (house: string) => void;
}) {
  const current = tiles.find(tile => tile.id === selected);
  return <section className="studio-banners" aria-label={copy.banners}>
    <SectionHeading variant="inline" title={copy.banners} />
    <div role="group" aria-label={copy.banner_choices}>
      {[...fixtureHouses, 'unclaimed'].map(house => <InkButton key={house} size="small"
        aria-label={copy.inspect_banner(house)} aria-pressed={!!current && (current.owner ?? 'unclaimed') === house}
        disabled={!tiles.some(tile => (tile.owner ?? 'unclaimed') === house)} onClick={() => on_select(house)}>
        {house === 'unclaimed' ? copy.unclaimed : house}
      </InkButton>)}
    </div>
    <p className="cc-side-fine">{copy.banner_hint}</p>
  </section>;
}

export function StudioDesignControls({ session, on_change }: {
  session: StudioSession; on_change: (field: SessionField, value?: string) => void;
}) {
  const { design } = session;
  return <Plate className="studio-design" border_ink="rule" aria-label={copy.design}>
    <PlateBody>
      <SectionHeading variant="ruled" title={copy.design} />
      <p className="cc-side-fine" role="status" aria-label={copy.design_status}>{copy.session_only}</p>
      <div className="studio-design-fields">
        <FieldGroup control_id="studio-map-size" label={copy.size} variant="select">
          <select id="studio-map-size" value={design.size} onChange={event => on_change('size', event.currentTarget.value)}>
            {mapSizes.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </FieldGroup>
        <FieldGroup control_id="studio-map-anchor" label={copy.anchor} variant="select">
          <select id="studio-map-anchor" value={design.anchor} onChange={event => on_change('anchor', event.currentTarget.value)}>
            {mapAnchors.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </FieldGroup>
        <FieldGroup control_id="studio-map-colour" label={copy.colour} variant="select" hint={copy.colour_hint}>
          <select id="studio-map-colour" value={design.colour} onChange={event => on_change('colour', event.currentTarget.value)}>
            {mapColours.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </FieldGroup>
        <FieldGroup control_id="studio-map-style" label={copy.art_style} variant="select">
          <select id="studio-map-style" value={design.art_style} onChange={event => on_change('art_style', event.currentTarget.value)}>
            {styles.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </FieldGroup>
        <FieldGroup control_id="studio-map-reveal" label={copy.reveal} hint={copy.reveal_hint}>
          <input id="studio-map-reveal" type="number" min={0} max={60000} step={1} value={session.reveal_input}
            aria-invalid={!!session.error} aria-describedby={session.error ? 'studio-reveal-error' : undefined}
            onChange={event => on_change('reveal_ms', event.currentTarget.value)} />
        </FieldGroup>
      </div>
      {session.error && <p id="studio-reveal-error" role="alert">{session.error}</p>}
      <MapPreview session={session} />
      <div className="studio-design-actions">
        <InkButton size="small" onClick={() => on_change('replay')}>{copy.replay}</InkButton>
        <InkButton size="small" onClick={() => on_change('reset')}>{copy.reset}</InkButton>
      </div>
    </PlateBody>
  </Plate>;
}

export function MapPreview({ session }: { session: StudioSession }) {
  const { design } = session;
  const dimensions = mapSizes.find(item => item.id === design.size) ?? mapSizes[1];
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
