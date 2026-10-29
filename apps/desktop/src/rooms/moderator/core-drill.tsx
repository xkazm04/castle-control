import { useState } from 'react';
import type { DrillConfiguration } from '@castle-control/contract';
import { WindowedRows } from '@castle-control/ui';
import type { CoreGatehousePort, CoreGatehouseSnapshot } from '../../gatehouse-core.js';
import { Drill } from './drill.jsx';
import { CaptureList, CaptureConfiguration } from './capture-drill.jsx';
import { moderationCopy as copy } from '../../moderation-copy.js';

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
  return <section className="moderator-core-drill"><h2>{copy.core_drill_title}</h2>
    <a href="#/chamber/moderator">{copy.back}</a>
    <p>{copy.core_drill_note}</p>
    <CaptureList state={state} port={port} />
    {state.selected_capture ? <CaptureConfiguration key={state.selected_capture.decision_id} state={state} port={port} /> : <>
    <p role="status">{copy.live_parity}</p>
    <section className="moderator-card"><h3>{copy.recording_title}</h3>
      <label>{copy.recording_import_json}<textarea value={importText} disabled={state.busy}
        onChange={event => setImportText(event.currentTarget.value)} /></label>
      <p>{copy.recording_import_note}</p>
      <button type="button" disabled={state.busy || !importText.trim()} onClick={() => { void port.importRecordingJson(importText); }}>{copy.recording_import}</button>
      {state.recording && <p>{copy.recording_imported(state.recording.message_count, state.recording.source, state.recording.recording)}</p>}
      <label>{copy.recording_name}<input value={recording} disabled={state.busy} onChange={event => setRecordingName(event.currentTarget.value)} /></label>
    </section>
    <section className="moderator-card"><h3>{copy.configuration_title}</h3>
      <p>{copy.configuration_note(state.rules.length)}</p>
      <label>{copy.bank}<input value={bank} disabled={state.busy} onChange={event => setBank(event.currentTarget.value)} /></label>
      <label>{copy.judge}<input value={judge} disabled={state.busy} onChange={event => setJudge(event.currentTarget.value)} /></label>
      <label>{copy.prompts}<textarea value={prompts} disabled={state.busy} onChange={event => setPrompts(event.currentTarget.value)} /></label>
      <div className="moderator-actions">
        <button type="button" disabled={!ready} onClick={() => { void port.runDrill({ recording, configuration }); }}>{copy.run_replay}</button>
        <button type="button" disabled={!ready} onClick={() => { void port.saveBaseline({ recording, configuration }); }}>{copy.save_baseline}</button>
        <button type="button" disabled={!ready || !baseline} onClick={() => {
          if (baseline) void port.diffDrill({ recording, baseline, candidate: configuration });
        }}>{copy.compare}</button>
      </div><p>{baseline ? copy.baseline_saved : copy.baseline_empty}</p>
    </section></>}
    {state.drill && <Drill result={state.drill} origin="core" capture_hash={state.replay_capture?.instrument_hash} />}
    {state.diff && <section className="moderator-card" aria-label={copy.comparison_label}><h3>{copy.comparison_title}</h3>
      <p>{copy.comparison_note}</p>
      <WindowedRows rows={state.diff.changes} label={copy.changes_label} row_key={change => change.message_id}
        empty_state={copy.changes_empty}>
        {change => <p>{change.message_id}: {change.before.replaceAll('_', ' ')} → {change.after.replaceAll('_', ' ')}</p>}
      </WindowedRows>
      <h3>{copy.baseline}</h3><Drill result={state.diff.baseline} origin="core" capture_hash={state.replay_capture?.instrument_hash} />
      <h3>{copy.candidate}</h3><Drill result={state.diff.candidate} origin="core" capture_hash={state.replay_capture?.instrument_hash} />
    </section>}
    {!state.drill && !state.diff && <p role="status">{copy.replay_empty}</p>}
  </section>;
}
