import { useState } from 'react';
import { FieldGroup, InkButton } from '@castle-control/ui';
import { beaconsCopy as copy } from '../../beacons-copy.js';
import { findPreset, presets, styleChoice } from './presets.js';
import type { BeaconsPort } from '../../beacons-model.js';
import type { Visual } from '@castle-control/contract';

export function StylePickerFields({ choice, custom_id, busy, on_change, local = false }: {
  choice: string; custom_id: string; busy: boolean; on_change: (choice: string) => void; local?: boolean;
}) {
  const preset = findPreset(choice);
  return <>
    <FieldGroup label={copy.art_style} control_id="beacon-art-style" variant="select">
      <select id="beacon-art-style" aria-label={copy.art_style} name="design_choice" value={choice} disabled={busy}
        onChange={event => {
          const next = event.currentTarget.value;
          if (next === '' || next === 'custom' || findPreset(next)) on_change(next);
        }}>
        <option value="">{copy.no_design}</option>
        {presets.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
        <option value="custom">{copy.custom_design}</option>
      </select>
    </FieldGroup>
    {choice === 'custom' ? <FieldGroup label={copy.design_id} control_id="beacon-design-id" variant="input">
      <input id="beacon-design-id" name="design_id" defaultValue={custom_id} disabled={busy} />
    </FieldGroup> : <input type="hidden" name="design_id" value={preset?.id ?? ''} />}
    {preset && <figure>
      <img src={preset.url} alt={preset.label} width={preset.width} height={preset.height}
        style={{ width: '100%', maxHeight: 'calc(var(--space-56) * 2)', objectFit: 'contain' }} />
      <figcaption>{local ? copy.style_local : copy.style_saved}</figcaption>
    </figure>}
  </>;
}

export function StylePicker({ design_id, busy, local = false }: { design_id?: string; busy: boolean; local?: boolean }) {
  const [choice, setChoice] = useState(() => styleChoice(design_id));
  return <StylePickerFields choice={choice} custom_id={styleChoice(design_id) === 'custom' ? design_id ?? '' : ''}
    busy={busy} on_change={setChoice} local={local} />;
}

export function FixtureStylePicker({ visual, port }: { visual: Visual; port: Pick<BeaconsPort, 'design'> }) {
  return <form className="visuals-appearance-fields" aria-label={copy.style_local_form} onSubmit={event => {
    event.preventDefault();
    const design_id = new FormData(event.currentTarget).get('design_id');
    if (typeof design_id === 'string') port.design(design_id);
  }}>
    <StylePicker key={`${visual.visual_id}-${visual.design_id ?? ''}`}
      {...(visual.design_id ? { design_id: visual.design_id } : {})} busy={false} local />
    <InkButton type="submit" size="wrap">{copy.save_style_local}</InkButton>
    <p className="visuals-note">{copy.style_local}</p>
  </form>;
}
