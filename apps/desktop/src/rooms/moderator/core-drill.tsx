import { useState } from 'react';
import type { DrillConfiguration } from '@castle-control/contract';
import { WindowedRows } from '@castle-control/ui';
import type { CoreGatehousePort, CoreGatehouseSnapshot } from '../../gatehouse-core.js';
import { Drill } from './drill.jsx';

export function CoreDrill({ state, port }: { state: CoreGatehouseSnapshot; port: CoreGatehousePort }) {
  const [importText, setImportText] = useState('');
  const [recordingName, setRecordingName] = useState(state.baseline_recording ?? '');
  const [bank, setBank] = useState(state.baseline?.bank ?? '');
  const [judge, setJudge] = useState(state.baseline?.judge ?? '');
  const [prompts, setPrompts] = useState(state.baseline?.prompts.join('\n') ?? '');
  const baseline = state.baseline;
  const recording = recordingName || state.recording?.recording || '';
  const configuration: DrillConfiguration = { rules: [...state.rules], bank, judge, prompts: prompts.split('\n').filter(text => text.trim()) };
  const ready = !state.busy && !!recording.trim() && !!bank.trim() && !!judge.trim();
  return <section className="moderator-core-drill"><h2>The drill · simulated replay from core</h2>
    <a href="#/chamber/moderator">Back to the Gatehouse</a>
    <p>Replays and comparisons do not write to the live decision ledger. Sources, recording gaps and instrument hashes come from core.</p>
    <section className="moderator-card"><h3>Recording</h3>
      <label>Import recording JSON<textarea value={importText} disabled={state.busy}
        onChange={event => setImportText(event.currentTarget.value)} /></label>
      <p>Import your channel’s exported recording, including its source, messages and gaps. It stays with the local core.</p>
      <button type="button" disabled={state.busy || !importText.trim()} onClick={() => { void port.importRecordingJson(importText); }}>Import recording</button>
      {state.recording && <p>Imported {state.recording.message_count} messages · source: {state.recording.source} · recording: {state.recording.recording}</p>}
      <label>Recording name<input value={recording} disabled={state.busy} onChange={event => setRecordingName(event.currentTarget.value)} /></label>
    </section>
    <section className="moderator-card"><h3>Replay configuration</h3>
      <p>{state.rules.length} rules loaded. Save a baseline, edit the watching rules in the Gatehouse, then compare the current configuration.</p>
      <label>Test bank<input value={bank} disabled={state.busy} onChange={event => setBank(event.currentTarget.value)} /></label>
      <label>Judge configuration<input value={judge} disabled={state.busy} onChange={event => setJudge(event.currentTarget.value)} /></label>
      <label>Prompts (one per line)<textarea value={prompts} disabled={state.busy} onChange={event => setPrompts(event.currentTarget.value)} /></label>
      <div className="moderator-actions">
        <button type="button" disabled={!ready} onClick={() => { void port.runDrill({ recording, configuration }); }}>Run simulated replay</button>
        <button type="button" disabled={!ready} onClick={() => { void port.saveBaseline({ recording, configuration }); }}>Save comparison baseline</button>
        <button type="button" disabled={!ready || !baseline} onClick={() => {
          if (baseline) void port.diffDrill({ recording, baseline, candidate: configuration });
        }}>Compare rules</button>
      </div><p>{baseline ? 'Comparison baseline saved for this core connection.' : 'No comparison baseline saved.'}</p>
    </section>
    {state.drill && <Drill result={state.drill} origin="core" />}
    {state.diff && <section className="moderator-card" aria-label="Core drill comparison"><h3>Rule comparison · simulated</h3>
      <p>Instrument hashes describe different runs; their results are not merged.</p>
      <WindowedRows rows={state.diff.changes} label="Core drill changes" row_key={change => change.message_id}
        empty_state="No changed outcomes in this comparison.">
        {change => <p>{change.message_id}: {change.before.replaceAll('_', ' ')} → {change.after.replaceAll('_', ' ')}</p>}
      </WindowedRows>
      <h3>Baseline</h3><Drill result={state.diff.baseline} origin="core" />
      <h3>Candidate</h3><Drill result={state.diff.candidate} origin="core" />
    </section>}
    {!state.drill && !state.diff && <p role="status">No core replay results loaded.</p>}
  </section>;
}
