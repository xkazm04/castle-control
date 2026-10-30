import type { ContributionSource } from '@castle-control/contract';
import { FieldGroup } from '@castle-control/ui';
import { beaconsCopy as copy } from '../../beacons-copy.js';
import { contributionInput, contribution_sources, source_labels } from './contribution-input.js';
import './input-picker.css';

export function InputPicker({ source, busy, on_change, control_id = 'beacons-input-source' }: {
  source: ContributionSource | ''; busy: boolean; on_change: (source: ContributionSource | '') => void; control_id?: string;
}) {
  return <FieldGroup label={copy.driven_by} control_id={control_id} variant="select">
    <div className="visuals-input-picker">
      <select id={control_id} name="input_source" aria-label={copy.driven_by} value={source} disabled={busy}
        onChange={event => {
          const value = event.currentTarget.value;
          const next = contribution_sources.find(item => item === value);
          if (!value || next) on_change(next ?? '');
        }}>
        <option value="">{copy.not_routed}</option>
        {contribution_sources.map(item => <option key={item} value={item}>{source_labels[item]}</option>)}
      </select>
      <span className="visuals-native-unit"><small>{copy.native_unit}</small>
        <output aria-label={copy.native_unit}>{source ? contributionInput(source).unit : copy.not_routed}</output></span>
    </div>
  </FieldGroup>;
}
