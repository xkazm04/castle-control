import { useEffect, useId, useMemo, useState } from 'react';
import type { ChangeEvent } from 'react';
import { InkButton, Notice, StatusChip, VerdictChip } from '@castle-control/ui';
import { clockText } from '../../moat/clock.js';
import { actionWords, fateWords, moatCopy as copy } from '../../moat/moat-copy.js';
import { heldCount, replayedCount, scrubTicks, stopNeighbour, windowFor } from '../../moat/moat-model.js';
import type { MoatMarker, MoatModel, ScrubTick } from '../../moat/moat-model.js';
import { moatSpeeds } from '../../moat/moat-player.js';
import type { MoatClock, MoatPlayerState, MoatSpeed } from '../../moat/moat-player.js';
import { MoatScene, sceneNotes } from '../../moat/moat-scene.jsx';
import { MoatReportPortal } from '../../moat/moat-report.jsx';
import type { MoatReportInfo } from '../../moat/moat-report.jsx';
import { useMoatPlayer } from '../../moat/use-moat-player.js';
import { ClockTime } from './presentation.jsx';

/** Where a stamped rule can be taken for editing. Only rules the bench can edit are offered. */
export type RuleBenchLink = {
  can_open: (rule_id: string) => boolean; open: (rule_id: string) => void;
  /** The rule as the room lists it now: its name and whether it only watches or acts. */
  describe?: (rule_id: string) => string | undefined;
};

export function MarkerInspector({ marker, bench }: { marker: MoatMarker | undefined; bench?: RuleBenchLink | undefined }) {
  return <aside className="moat-inspector" aria-label={copy.inspector} data-empty={!marker}>
    <h4>{marker ? marker.message_id : copy.inspect_none}</h4>
    {marker ? <dl>
      <dt>{copy.outcome}</dt><dd>{fateWords[marker.fate]}</dd>
      <dt>{copy.state}</dt><dd>{marker.state.replaceAll('_', ' ')}</dd>
      <dt>{copy.verdict}</dt><dd>{marker.verdict ? <VerdictChip verdict={marker.verdict} /> : copy.none}</dd>
      <dt>{copy.action}</dt><dd>{marker.action ? actionWords[marker.action] : copy.none}</dd>
      <dt>{copy.rule}</dt><dd>{marker.rule_id ? <><code>{marker.rule_id}</code>{bench?.describe?.(marker.rule_id) && <small> · {bench.describe(marker.rule_id)}</small>}</> : copy.none}</dd>
      <dt>{copy.evaluation}</dt><dd>{copy.evaluation_words[marker.passed === undefined ? 'none' : marker.passed ? 'true' : 'false']}</dd>
      <dt>{copy.source}</dt><dd>{marker.source}</dd>
      <dt>{copy.at}</dt><dd><ClockTime at={marker.at} /></dd>
    </dl> : <p>{copy.inspect_empty}</p>}
    {marker?.rule_id && bench?.can_open(marker.rule_id) && <a className="moat-open-rule" href="#/chamber/moderator" data-rule={marker.rule_id}
      onClick={() => { if (marker.rule_id) bench.open(marker.rule_id); }}>{copy.open_rule(marker.rule_id)}</a>}
    <p className="moat-small">{copy.no_text}</p>
  </aside>;
}

function Legend() {
  const dot = (kind: string) => <svg viewBox="0 0 12 12" aria-hidden="true" className="moat-legend-dot" data-kind={kind}>
    {kind === 'gap' ? <rect x="1" y="1" width="10" height="10" /> : kind === 'unresolved' ? <rect x="2.5" y="2.5" width="7" height="7" transform="rotate(45 6 6)" />
      : <circle cx="6" cy="6" r="4" />}</svg>;
  return <ul className="moat-legend" aria-label="Legend">
    {(['aired', 'stopped', 'unresolved', 'waiting', 'gap'] as const).map(kind =>
      <li key={kind}>{dot(kind)}{copy.legend[kind]}</li>)}</ul>;
}

export type MoatControlsProps = {
  state: MoatPlayerState; ticks: readonly ScrubTick[]; position: string; reduced: boolean; range_id: string;
  on_play: () => void; on_pause: () => void; on_seek: (playhead_ms: number) => void; on_speed: (speed: MoatSpeed) => void;
  /** Jump to the previous or next stop. Absent when there is none to offer. */
  on_stop?: ((direction: 1 | -1) => void) | undefined; can_stop?: { previous: boolean; next: boolean } | undefined;
};
/** Plain buttons and a range input only: Space belongs to the seal key in the shared keymap. */
export function MoatControls({ state, ticks, position, reduced, range_id, on_play, on_pause, on_seek, on_speed, on_stop, can_stop }: MoatControlsProps) {
  return <div className="moat-controls">
    <InkButton type="button" size="small" variant={state.playing ? 'primary' : 'outline'} disabled={reduced}
      onClick={state.playing ? on_pause : on_play}>{state.playing ? copy.pause : copy.play}</InkButton>
    <div className="moat-speeds" role="group" aria-label={copy.speed}>
      {moatSpeeds.map(speed => <InkButton key={speed} type="button" size="small" aria-pressed={state.speed === speed}
        onClick={() => { on_speed(speed); }}>{copy.speed_label(speed)}</InkButton>)}</div>
    {on_stop && <div className="moat-stops" role="group" aria-label={copy.stops}>
      <InkButton type="button" size="small" disabled={!can_stop?.previous} onClick={() => { on_stop(-1); }}>{copy.previous_stop}</InkButton>
      <InkButton type="button" size="small" disabled={!can_stop?.next} onClick={() => { on_stop(1); }}>{copy.next_stop}</InkButton></div>}
    <div className="moat-scrub"><label htmlFor={range_id} className="moat-sr">{copy.position}</label>
      <input id={range_id} type="range" min={0} max={state.run_ms} step={Math.max(Math.round(state.run_ms / 200), 100)} value={state.playhead_ms}
        aria-valuetext={position} onChange={(event: ChangeEvent<HTMLInputElement>) => { on_seek(Number(event.currentTarget.value)); }} />
      <div className="moat-ticks" aria-hidden="true">{ticks.map(tick => <i key={tick.at} style={{ left: `${tick.at * 100}%` }} data-many={tick.held > 1} />)}</div></div>
    <output className="moat-readout" aria-live="off">{position}</output>
  </div>;
}

export type MoatPanelProps = {
  model: MoatModel; delay_s?: number | undefined; clock?: MoatClock | undefined;
  selected_id?: string | undefined; on_select: (message_id: string | undefined) => void; rule_bench?: RuleBenchLink | undefined;
  /** When given, the panel offers a printable night report of this replay. */
  report?: MoatReportInfo | undefined;
};

/** Play, scrubber, strip and inspector over one replay. The table below the panel stays the text equivalent. */
export function MoatPanel({ model, delay_s, clock, selected_id, on_select, rule_bench, report }: MoatPanelProps) {
  const heading_id = useId(); const range_id = useId(); const uid = useId();
  const [printing, setPrinting] = useState(false);
  // The report is mounted for one print only, so several drills on a page never print each other.
  useEffect(() => { if (printing) { window.print(); setPrinting(false); } }, [printing]);
  const { player, state, reduced } = useMoatPlayer(model.run_ms, clock ? { clock } : {});
  const selected = useMemo(() => selected_id === undefined ? undefined : model.markers.find(marker => marker.message_id === selected_id), [model, selected_id]);
  const ticks = useMemo(() => scrubTicks(model), [model]);
  const view = windowFor(model, state.playhead_ms);
  const notes = useMemo(() => sceneNotes(model, view), [model, view.from_ms, view.to_ms]);
  const held = heldCount(model, state.playhead_ms);
  const position = copy.position_text(clockText(model.start_ms + Math.min(state.playhead_ms, model.span_ms)), replayedCount(model, state.playhead_ms), model.counts.total);
  if (model.markers.length === 0) return <section className="moat-panel" aria-labelledby={heading_id}>
    <h3 id={heading_id}>{copy.title}</h3><p>{copy.empty}</p></section>;
  return <section className="moat-panel" aria-labelledby={heading_id} data-playing={state.playing}>
    <header className="moat-head"><h3 id={heading_id}>{copy.title}</h3>
      <Notice className="moat-live" message={<StatusChip variant="azure">{copy.summary(held, model.counts.total)}</StatusChip>} />
      <p className="moat-small moat-breakdown">{copy.breakdown(model.counts)}</p>
      {report && <InkButton type="button" size="small" variant="ghost" onClick={() => { setPrinting(true); }}>{copy.print}</InkButton>}</header>
    {report && printing && <MoatReportPortal model={model} info={report} delay_s={delay_s} uid={uid} />}
    <MoatControls state={state} ticks={ticks} position={position} reduced={reduced} range_id={range_id} on_play={player.play}
      on_pause={player.pause} on_speed={player.setSpeed} on_seek={playhead_ms => { player.pause(); player.seek(playhead_ms); }}
      on_stop={direction => {
        const stop = stopNeighbour(model, state.playhead_ms, direction);
        if (!stop) return;
        player.pause(); player.seek(stop.at_ms); on_select(stop.marker.message_id);
      }}
      can_stop={{ previous: !!stopNeighbour(model, state.playhead_ms, -1), next: !!stopNeighbour(model, state.playhead_ms, 1) }} />
    {reduced && <p className="moat-small">{copy.reduced}</p>}
    <div className="moat-body">
      <div className="moat-scroll" role="group" aria-label={copy.region}>
        <MoatScene model={model} playhead_ms={state.playhead_ms} window={view} selected={selected?.index} delay_s={delay_s} uid={uid}
          on_select={index => { on_select(model.markers[index]?.message_id); }} />
        <Legend />
        <p className="moat-small">{copy.honesty}</p>
        {view.paged && <p className="moat-small">{copy.page}</p>}
        {notes.thinned > 0 && <p className="moat-small">{copy.thinned(notes.thinned)}</p>}
        {notes.overflow > 0 && <p className="moat-small">{copy.overflow(notes.overflow)}</p>}
      </div>
      <MarkerInspector marker={selected} bench={rule_bench} />
    </div>
  </section>;
}
