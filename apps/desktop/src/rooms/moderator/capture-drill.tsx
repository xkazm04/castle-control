import { useId, useState } from 'react';
import { FieldGroup, InkButton, WindowedRows, rowHeight } from '@castle-control/ui';
import type { CoreGatehousePort, CoreGatehouseSnapshot } from '../../gatehouse-core.js';
import { ClockTime } from './presentation.jsx';
import { captureCanReplay } from '../../gatehouse-core.js';
import { moderationCopy as copy } from '../../moderation-copy.js';

export function CaptureList({ state, port, scroll_top = 0 }: {
  state: CoreGatehouseSnapshot; port: CoreGatehousePort; scroll_top?: number;
}) {
  const page = state.live_runs;
  return <section className="moderator-card"><h3>{copy.captures_title}</h3>
    <p>{copy.capture_intro}</p>
    <p>{page ? copy.captures_page(page.items.length, page.unavailable_count) : copy.captures_pending}</p>
    <WindowedRows key={page?.next_cursor ?? 'last'} rows={page?.items ?? []} label={copy.captures_title} row_height={rowHeight * 8} scroll_top={scroll_top}
      row_key={item => item.decision_id} empty_state={copy.captures_empty}>
      {item => {
        const reason = item.coverage === 'unavailable' ? item.reason
          : item.capture.replay_gap ?? (item.capture.gaps.length ? 'bridge_gap' : undefined);
        return <div className="moderator-capture-row" data-capture-id={item.decision_id}>
          <p>{item.decision_id}{item.coverage === 'retained' && <> · {item.provenance}</>}</p>
          {item.coverage === 'retained' && <>
            <p>{item.capture.recording} · <ClockTime at={item.capture.from} /> → <ClockTime at={item.capture.to} /></p>
            <p>{copy.capture_hash}</p><code className="room-hash">{item.capture.instrument_hash}</code>
          </>}
          {reason && <p>{copy.capture_gap}: {copy.capture_gaps[reason]}</p>}
          <InkButton size="room" type="button" disabled={state.busy || !captureCanReplay(item)}
            onClick={() => { port.selectCapture(item.decision_id); }}>{copy.capture_select}</InkButton>
        </div>;
      }}
    </WindowedRows>
    <InkButton size="room" type="button" disabled={state.busy} onClick={() => { void port.loadLiveRuns(); }}>{copy.captures_load}</InkButton>
    <InkButton size="room" type="button" disabled={state.busy || !page?.next_cursor} onClick={() => { void port.moreLiveRuns(); }}>{copy.captures_more}</InkButton>
  </section>;
}

export function CaptureConfiguration({ state, port }: { state: CoreGatehouseSnapshot; port: CoreGatehousePort }) {
  const field_id = useId();
  const capture = state.selected_capture?.capture;
  const [bank, setBank] = useState(capture?.configuration.bank ?? '');
  const [judge, setJudge] = useState(capture?.configuration.judge ?? '');
  const [prompts, setPrompts] = useState(capture?.configuration.prompts.join('\n') ?? '');
  if (!capture) return null;
  return <section className="moderator-card"><h3>{copy.configuration_title}</h3>
    <p>{capture.recording} · {state.selected_capture?.provenance}</p>
    <p>{copy.capture_interval}: <ClockTime at={capture.from} /> → <ClockTime at={capture.to} /></p>
    <p>{copy.capture_hash}</p><code className="room-hash">{capture.instrument_hash}</code>
    <p>{copy.capture_configuration_note}</p>
    <FieldGroup label={copy.bank} control_id={`${field_id}-bank`}><input id={`${field_id}-bank`} value={bank} disabled={state.busy} onChange={event => setBank(event.currentTarget.value)} /></FieldGroup>
    <FieldGroup label={copy.judge} control_id={`${field_id}-judge`}><input id={`${field_id}-judge`} value={judge} disabled={state.busy} onChange={event => setJudge(event.currentTarget.value)} /></FieldGroup>
    <FieldGroup label={copy.prompts} control_id={`${field_id}-prompts`}><textarea id={`${field_id}-prompts`} value={prompts} disabled={state.busy} onChange={event => setPrompts(event.currentTarget.value)} /></FieldGroup>
    <div className="moderator-actions">
      <InkButton size="room" type="button" disabled={state.busy} onClick={() => { void port.runCapture(); }}>{copy.run_replay}</InkButton>
      <InkButton size="room" type="button" disabled={state.busy || !bank.trim() || !judge.trim()} onClick={() => {
        void port.compareCapture({ rules: [...state.rules], bank, judge, prompts: prompts.split('\n').filter(text => text.trim()) });
      }}>{copy.compare}</InkButton>
      <InkButton size="room" type="button" disabled={state.busy} onClick={() => { port.selectCapture(); }}>{copy.manual_select}</InkButton>
    </div>
  </section>;
}
