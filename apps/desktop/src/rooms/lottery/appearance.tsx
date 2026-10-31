import { useState, useSyncExternalStore } from 'react';
import { FieldGroup, HeraldicCard } from '@castle-control/ui';
import { art, styles } from '../../demo/model.js';
import { lotsCopy as copy } from '../../lots-copy.js';
import type { DrawDisplay, DrawDisplayPort } from './display.js';
import { revealStyle } from './display.js';
import './appearance.css';

export function DrawPreview({ display }: { display: DrawDisplay }) {
  const [failed, setFailed] = useState(false);
  return <figure className="lottery-shape-preview" data-size={display.size} data-anchor={display.anchor}
    data-colour={display.colour} data-art-style={display.art_style} aria-label={copy.stream}
    style={revealStyle(display.reveal_ms)}>
    <div className="lottery-preview-object">
      {!failed ? <img src={art(display.art_style, 'urn')} alt={copy.journey.sample_art} onError={() => setFailed(true)} />
        : <svg viewBox="0 0 100 100" role="img" aria-label={copy.journey.fallback}>
          <path d="M30 12h40v12l-8 10c22 10 22 38 0 48v8H38v-8c-22-10-22-38 0-48l-8-10z" />
        </svg>}
    </div>
    <figcaption>{copy.journey.sample_art}</figcaption>
  </figure>;
}

export function DrawAppearance({ port }: { port: DrawDisplayPort }) {
  const display = useSyncExternalStore(port.subscribe, port.getSnapshot, port.getSnapshot);
  const [revealDraft, setRevealDraft] = useState<string>();
  const commitReveal = (value: string) => { port.commitReveal(value); setRevealDraft(undefined); };
  return <HeraldicCard variant="raised" aria-label={copy.stream}>
    <h2 className="lottery-card-title">{copy.stream}</h2>
    <div className="lottery-settings">
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
    <DrawPreview key={`${display.art_style}-${display.reveal_ms}`} display={display} />
    <p className="cc-aside">{copy.journey.display_hint}</p>
  </HeraldicCard>;
}
