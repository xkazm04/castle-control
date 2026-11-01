import { useMemo, useState, useSyncExternalStore } from 'react';
import { entranceStyle, FieldGroup, HeraldicCard } from '@castle-control/ui';
import { art, styles } from '../../demo/model.js';
import { lotsCopy as copy } from '../../lots-copy.js';
import type { DrawDisplay, DrawDisplayPort } from './display.js';
import { revealStyle } from './display.js';
import { artworkOf, isDrawShape, stage_view_box, stageScene } from './stage-model.js';
import './appearance.css';

/** Mini stream frame: the renderer's own artwork for the chosen shape (what the OBS draw page paints),
 * placed by size and anchor, with the sample-art style as a small stamp. */
export function DrawPreview({ display }: { display: DrawDisplay }) {
  const [failed, setFailed] = useState(false);
  const shape = useMemo(() => artworkOf(stageScene(display.shape, undefined, 'question', true)), [display.shape]);
  const label = copy.shapes.find(item => item.value === display.shape)?.label ?? display.shape;
  return <figure className="lottery-shape-preview" data-size={display.size} data-anchor={display.anchor}
    data-colour={display.colour} data-art-style={display.art_style} data-shape={display.shape} aria-label={copy.stream}
    style={revealStyle(display.reveal_ms)}>
    <div className="lottery-preview-object">
      <svg className="lottery-preview-shape" viewBox={stage_view_box} role="img" aria-label={copy.journey.obs_shape(label)}>
        {shape?.paths.map((path, index) => <path key={index} d={path.d} data-ink={path.ink} />)}
      </svg>
      {!failed ? <img className="lottery-preview-style" src={art(display.art_style, 'urn')} alt={copy.journey.sample_art}
        onError={() => setFailed(true)} />
        : <svg className="lottery-preview-style" viewBox="0 0 100 100" role="img" aria-label={copy.journey.fallback}>
          <path d="M30 12h40v12l-8 10c22 10 22 38 0 48v8H38v-8c-22-10-22-38 0-48l-8-10z" />
        </svg>}
    </div>
    <figcaption>{copy.journey.obs_shape(label)} · {copy.journey.sample_art}</figcaption>
  </figure>;
}

export function DrawAppearance({ port, hint = copy.journey.display_hint, preview = true }: {
  port: DrawDisplayPort; hint?: string; preview?: boolean;
}) {
  const display = useSyncExternalStore(port.subscribe, port.getSnapshot, port.getSnapshot);
  const [revealDraft, setRevealDraft] = useState<string>();
  const commitReveal = (value: string) => { port.commitReveal(value); setRevealDraft(undefined); };
  return <HeraldicCard variant="raised" className="panel cc-print-in" style={{ ...entranceStyle(4) }} aria-label={copy.stream}>
    <h2 className="lottery-card-title">{copy.stream}</h2>
    <div className="lottery-settings">
      <FieldGroup label={copy.shape} control_id="lots-shape" variant="select">
        <select id="lots-shape" value={display.shape} onChange={event => {
          const shape = event.currentTarget.value; if (isDrawShape(shape)) port.edit({ shape });
        }}>{copy.shapes.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select>
      </FieldGroup>
      <FieldGroup label={copy.journey.size} control_id="lots-size" variant="select">
        <select id="lots-size" value={display.size} onChange={event => {
          const size = copy.journey.sizes.find(value => value === event.currentTarget.value); if (size) port.edit({ size });
        }}>{copy.journey.sizes.map(size => <option key={size}>{size}</option>)}</select>
      </FieldGroup>
      <FieldGroup label={copy.journey.anchor} control_id="lots-anchor" variant="select">
        <select id="lots-anchor" value={display.anchor} onChange={event => {
          const anchor = copy.journey.anchors.find(item => item.value === event.currentTarget.value); if (anchor) port.edit({ anchor: anchor.value });
        }}>{copy.journey.anchors.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select>
      </FieldGroup>
      <FieldGroup label={copy.journey.colour} control_id="lots-colour" variant="select">
        <select id="lots-colour" value={display.colour} onChange={event => {
          const colour = copy.journey.colours.find(item => item.value === event.currentTarget.value); if (colour) port.edit({ colour: colour.value });
        }}>{copy.journey.colours.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select>
      </FieldGroup>
      <FieldGroup label={copy.journey.art_style} control_id="lots-art" variant="select">
        <select id="lots-art" value={display.art_style} onChange={event => {
          const style = styles.find(item => item.id === event.currentTarget.value); if (style) port.edit({ art_style: style.id });
        }}>{styles.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select>
      </FieldGroup>
      <FieldGroup label={copy.journey.reveal} control_id="lots-reveal">
        <input id="lots-reveal" type="number" min={100} max={10000} value={revealDraft ?? String(display.reveal_ms)}
          onChange={event => setRevealDraft(event.currentTarget.value)}
          onBlur={event => commitReveal(event.currentTarget.value)}
          onKeyDown={event => {
            if (event.key === 'Enter') { event.preventDefault(); commitReveal(event.currentTarget.value); }
          }} />
      </FieldGroup>
    </div>
    {preview && <DrawPreview key={`${display.art_style}-${display.reveal_ms}`} display={display} />}
    <p className="cc-aside">{hint}</p>
  </HeraldicCard>;
}
