import { useSyncExternalStore } from 'react';
import type { CSSProperties } from 'react';
import { FieldGroup, StatusChip } from '@castle-control/ui';
import type { Visual } from '@castle-control/contract';
import { beaconsCopy as copy } from '../../beacons-copy.js';
import { anchors, colours, initialAppearance, sizes } from './appearance-state.js';
import type { AppearanceSession } from './appearance-state.js';
import { BeaconArtwork } from './artwork.jsx';
import { FixtureStylePicker } from './style-picker.jsx';
import type { BeaconsPort } from '../../beacons-model.js';
import './appearance.css';

export function AppearanceControls({ session, visual, intensity, burst = 0, design_port }: {
  session: AppearanceSession; visual: Visual; intensity?: number; burst?: number | string;
  design_port?: Pick<BeaconsPort, 'design'>;
}) {
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);
  const value = state[visual.visual_id] ?? initialAppearance;
  const scale = { S: 0.5, M: 0.75, L: 1 }[value.size];
  const style: CSSProperties & Record<string, string | number> = {
    '--beacon-scale': scale, '--beacon-blaze': intensity ?? 0,
    '--beacon-colour': `var(--${value.colour === 'key' ? 'ink' : value.colour})`,
    '--beacon-burst-duration': `${value.burst_ms}ms`,
  };
  return <section className="visuals-appearance" aria-label={copy.parameters}>
    <p className="visuals-note">{copy.session_only}</p>
    <section className="visuals-appearance-preview" aria-label={copy.appearance_preview}
      data-size={value.size} data-anchor={value.anchor} data-colour={value.colour}
      data-burst-ms={value.burst_ms} data-intensity={intensity} style={style}>
      <div className="visuals-appearance-object" key={`${visual.visual_id}-${burst}`}>
        <BeaconArtwork item={{ visual, intensity: intensity ?? 0, total: 0, gift_weight: 1 }} />
      </div>
      <StatusChip variant="dash">{`SIMULATED · ${intensity === undefined ? copy.live_unavailable : `${Math.round(intensity * 100)}% blaze`}`}</StatusChip>
    </section>
    {design_port && <FixtureStylePicker visual={visual} port={design_port} />}
    <div className="visuals-appearance-fields">
      <FieldGroup label={copy.size} control_id="beacon-size" variant="select">
        <select id="beacon-size" value={value.size} onChange={event => session.change(visual.visual_id, 'size', event.currentTarget.value)}>
          {sizes.map(size => <option key={size}>{size}</option>)}
        </select>
      </FieldGroup>
      <FieldGroup label={copy.anchor} control_id="beacon-anchor" variant="select">
        <select id="beacon-anchor" value={value.anchor} onChange={event => session.change(visual.visual_id, 'anchor', event.currentTarget.value)}>
          {anchors.map(anchor => <option key={anchor}>{anchor}</option>)}
        </select>
      </FieldGroup>
      <FieldGroup label={copy.colour} control_id="beacon-colour" variant="select">
        <select id="beacon-colour" value={value.colour} onChange={event => session.change(visual.visual_id, 'colour', event.currentTarget.value)}>
          {colours.map(colour => <option key={colour} value={colour}>{colour === 'key' ? 'Key' : colour === 'or' ? 'Gold' : colour === 'gules' ? 'Red' : 'Blue'}</option>)}
        </select>
      </FieldGroup>
      <FieldGroup label={copy.burst_timing} control_id="beacon-burst-ms" variant="input">
        <input id="beacon-burst-ms" type="number" min="0" max="60000" step="1" value={value.burst_ms}
          onChange={event => session.change(visual.visual_id, 'burst_ms', event.currentTarget.valueAsNumber)} />
      </FieldGroup>
    </div>
  </section>;
}
