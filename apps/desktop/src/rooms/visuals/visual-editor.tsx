import { useState } from 'react';
import type { ContributionSource, Visual, VisualId, DesignId } from '@castle-control/contract';
import type { CoreBeaconsPort } from '../../beacons-core.js';
import { contributionInput, contribution_sources } from './contribution-input.js';
import { InputPicker } from './input-picker.jsx';
import { StylePicker } from './style-picker.jsx';

type EditorProps = { visual?: Visual; port: CoreBeaconsPort; busy: boolean };

export function VisualForm({ visual, port, busy, source, on_source }: EditorProps & {
  source: ContributionSource | ''; on_source: (source: ContributionSource | '') => void;
}) {
  return <form className="visuals-core-form" onSubmit={event => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const visual_id = form.get('visual_id'); const name = form.get('name'); const design_id = form.get('design_id');
    const source_value = form.get('input_source');
    const input_source = contribution_sources.find(item => item === source_value);
    if (typeof visual_id !== 'string' || typeof name !== 'string' || typeof design_id !== 'string'
      || (source_value !== '' && !input_source)) return;
    // Brands and source/unit pairs are checked by the port's schema before transport.
    void port.upsert({ visual: { visual_id: visual_id as VisualId, name,
      ...(design_id.trim() ? { design_id: design_id as DesignId } : {}),
      ...(input_source ? { input: contributionInput(input_source) } : {}),
      curve: visual?.curve ?? { ranges: [{ total: 0, intensity: 0 }, { total: 50, intensity: 1 }], decay: { kind: 'none' } } } });
  }}>
    <h2>{visual ? 'Edit visual configuration' : 'Create a visual'}</h2>
    <label>Visual ID<input name="visual_id" defaultValue={visual?.visual_id ?? ''} readOnly={!!visual} disabled={busy} required /></label>
    <label>Visual name<input name="name" defaultValue={visual?.name ?? ''} disabled={busy} required /></label>
    <StylePicker key={visual?.visual_id ?? 'new'} {...(visual?.design_id ? { design_id: visual.design_id } : {})} busy={busy} />
    <InputPicker source={source} busy={busy} on_change={on_source} />
    {!visual && <p>New curves start at 0 intensity for 0 units and 100% for 50 units, with no decay. Edit after saving.</p>}
    <button type="submit" disabled={busy}>Save visual to core</button>
  </form>;
}

export function VisualEditor(props: EditorProps) {
  const [source, setSource] = useState<ContributionSource | ''>(props.visual?.input?.source ?? '');
  return <VisualForm {...props} source={source} on_source={setSource} />;
}
