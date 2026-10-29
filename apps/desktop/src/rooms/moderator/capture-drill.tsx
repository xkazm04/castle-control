import { useState } from 'react';
import { WindowedRows, rowHeight } from '@castle-control/ui';
import type { CoreGatehousePort, CoreGatehouseSnapshot } from '../../gatehouse-core.js';
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
            <p>{item.capture.recording} · <time>{item.capture.from}</time> → <time>{item.capture.to}</time></p>
            <p>{copy.capture_hash}</p><code className="room-hash">{item.capture.instrument_hash}</code>
          </>}
          {reason && <p>{copy.capture_gap}: {copy.capture_gaps[reason]}</p>}
          <button type="button" disabled={state.busy || !captureCanReplay(item)}
            onClick={() => { port.selectCapture(item.decision_id); }}>{copy.capture_select}</button>
        </div>;
      }}
    </WindowedRows>
    <button type="button" disabled={state.busy} onClick={() => { void port.loadLiveRuns(); }}>{copy.captures_load}</button>
    <button type="button" disabled={state.busy || !page?.next_cursor} onClick={() => { void port.moreLiveRuns(); }}>{copy.captures_more}</button>
  </section>;
}

export function CaptureConfiguration({ state, port }: { state: CoreGatehouseSnapshot; port: CoreGatehousePort }) {
  const capture = state.selected_capture?.capture;
  const [bank, setBank] = useState(capture?.configuration.bank ?? '');
  const [judge, setJudge] = useState(capture?.configuration.judge ?? '');
  const [prompts, setPrompts] = useState(capture?.configuration.prompts.join('\n') ?? '');
  if (!capture) return null;
  return <section className="moderator-card"><h3>{copy.configuration_title}</h3>
    <p>{capture.recording} · {state.selected_capture?.provenance}</p>
    <p>{copy.capture_interval}: <time>{capture.from}</time> → <time>{capture.to}</time></p>
    <p>{copy.capture_hash}</p><code className="room-hash">{capture.instrument_hash}</code>
    <p>{copy.capture_configuration_note}</p>
    <label>{copy.bank}<input value={bank} disabled={state.busy} onChange={event => setBank(event.currentTarget.value)} /></label>
    <label>{copy.judge}<input value={judge} disabled={state.busy} onChange={event => setJudge(event.currentTarget.value)} /></label>
    <label>{copy.prompts}<textarea value={prompts} disabled={state.busy} onChange={event => setPrompts(event.currentTarget.value)} /></label>
    <div className="moderator-actions">
      <button type="button" disabled={state.busy} onClick={() => { void port.runCapture(); }}>{copy.run_replay}</button>
      <button type="button" disabled={state.busy || !bank.trim() || !judge.trim()} onClick={() => {
        void port.compareCapture({ rules: [...state.rules], bank, judge, prompts: prompts.split('\n').filter(text => text.trim()) });
      }}>{copy.compare}</button>
      <button type="button" disabled={state.busy} onClick={() => { port.selectCapture(); }}>{copy.manual_select}</button>
    </div>
  </section>;
}
