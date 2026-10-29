import type { ContributionSource } from '@castle-control/contract';
import { contributionInput, contribution_sources, source_labels } from './contribution-input.js';
import './input-picker.css';

export function InputPicker({ source, busy, on_change }: {
  source: ContributionSource | ''; busy: boolean; on_change: (source: ContributionSource | '') => void;
}) {
  return <div className="visuals-input-picker">
    <label>Driven by<select name="input_source" aria-label="Driven by" value={source} disabled={busy}
      onChange={event => {
        const value = event.currentTarget.value;
        const next = contribution_sources.find(item => item === value);
        if (!value || next) on_change(next ?? '');
      }}>
      <option value="">Not routed</option>
      {contribution_sources.map(item => <option key={item} value={item}>{source_labels[item]}</option>)}
    </select></label>
    <span>Native unit: <output aria-label="Native unit">{source ? contributionInput(source).unit : 'Not routed'}</output></span>
  </div>;
}
