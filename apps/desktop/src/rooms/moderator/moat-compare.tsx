import { useId, useMemo, useState } from 'react';
import type { DrillDiffResult } from '@castle-control/contract';
import { Notice, StatusChip } from '@castle-control/ui';
import { clockText } from '../../moat/clock.js';
import { actionWords, fateWords, moatCopy as copy } from '../../moat/moat-copy.js';
import { compareMoats } from '../../moat/moat-compare.js';
import { buildMoat, crossingMs, heldCount, replayedCount, scrubTicks, windowFor } from '../../moat/moat-model.js';
import type { MoatMarker, MoatModel } from '../../moat/moat-model.js';
import type { MoatClock } from '../../moat/moat-player.js';
import { MoatScene, compareGeometry } from '../../moat/moat-scene.jsx';
import { useMoatPlayer } from '../../moat/use-moat-player.js';
import { MoatControls } from './moat-panel.jsx';

const words = copy.compare;
const cell = (marker: MoatMarker | undefined, field: 'fate' | 'state' | 'verdict' | 'action' | 'rule_id'): string => {
  if (!marker) return words.absent;
  switch (field) {
    case 'fate': return fateWords[marker.fate];
    case 'state': return marker.state.replaceAll('_', ' ');
    case 'verdict': return marker.verdict ?? copy.none;
    case 'action': return marker.action ? actionWords[marker.action] : copy.none;
    case 'rule_id': return marker.rule_id ?? copy.none;
  }
};

/** What the candidate does to one message, side by side with the baseline. */
export function CompareInspector({ before, after, changed }: { before: MoatMarker | undefined; after: MoatMarker | undefined; changed: boolean }) {
  const marker = before ?? after;
  return <aside className="moat-inspector" aria-label={copy.inspector} data-empty={!marker}>
    <h4>{marker ? marker.message_id : copy.inspect_none}</h4>
    {marker ? <>
      <p><b>{changed ? words.changed_word : words.same_word}</b></p>
      <dl className="moat-compare-table">
        <dt data-head>{words.field}</dt><dd data-head>{words.baseline}</dd><dd data-head>{words.candidate}</dd>
        {([['fate', copy.outcome], ['state', copy.state], ['verdict', copy.verdict], ['action', copy.action], ['rule_id', copy.rule]] as const).map(([field, name]) =>
          [<dt key={`${field}-name`}>{name}</dt>, <dd key={`${field}-before`}>{cell(before, field)}</dd>, <dd key={`${field}-after`}>{cell(after, field)}</dd>])}
      </dl></> : <p>{words.inspect_empty}</p>}
    <p className="moat-small">{copy.no_text}</p>
  </aside>;
}

export type MoatCompareProps = { diff: DrillDiffResult; note: string; delay_s?: number | undefined; clock?: MoatClock | undefined };

/** Baseline above, candidate below, one playhead. Same recording, so the same times line up. */
export function MoatCompare({ diff, note, delay_s, clock }: MoatCompareProps) {
  const heading_id = useId(); const range_id = useId(); const uid = useId();
  const [selected, setSelected] = useState<string | undefined>();
  const cross = delay_s && delay_s > 0 ? delay_s * 1000 : crossingMs;
  const before = useMemo(() => buildMoat(diff.baseline, cross), [diff.baseline, cross]);
  const after = useMemo(() => buildMoat(diff.candidate, cross), [diff.candidate, cross]);
  const comparison = useMemo(() => compareMoats(before, after, diff.changes), [before, after, diff.changes]);
  const ticks = useMemo(() => scrubTicks(after), [after]);
  const { player, state, reduced } = useMoatPlayer(before.run_ms, clock ? { clock } : {});
  const view = windowFor(before, state.playhead_ms);
  if (!comparison.aligned || before.markers.length === 0) return <section className="moat-panel moat-compare" aria-labelledby={heading_id}>
    <h3 id={heading_id}>{words.title}</h3><p>{words.unaligned}</p></section>;
  const position = copy.position_text(clockText(before.start_ms + Math.min(state.playhead_ms, before.span_ms)), replayedCount(before, state.playhead_ms), before.counts.total);
  const picked = (model: MoatModel) => model.markers.find(marker => marker.message_id === selected);
  const pick = (model: MoatModel) => (at: number) => { setSelected(model.markers[at]?.message_id); };
  return <section className="moat-panel moat-compare" aria-labelledby={heading_id} data-playing={state.playing}>
    <header className="moat-head"><h3 id={heading_id}>{words.title}</h3>
      <Notice className="moat-live" message={<StatusChip variant="azure">{words.summary(heldCount(before, state.playhead_ms), heldCount(after, state.playhead_ms), before.counts.total)}</StatusChip>} />
      <p className="moat-small moat-breakdown">{words.breakdown(comparison.changed.size, comparison.newly_held, comparison.released)}</p></header>
    <p className="moat-small">{note}</p>
    <MoatControls state={state} ticks={ticks} position={position} reduced={reduced} range_id={range_id} on_play={player.play}
      on_pause={player.pause} on_speed={player.setSpeed} on_seek={playhead_ms => { player.pause(); player.seek(playhead_ms); }} />
    {reduced && <p className="moat-small">{copy.reduced}</p>}
    <div className="moat-body">
      <div className="moat-scroll" role="group" aria-label={words.region}>
        <div className="moat-compare-strips">
          <MoatScene model={before} playhead_ms={state.playhead_ms} window={view} geometry={compareGeometry} axis={false} uid={`${uid}-before`}
            caption={words.caption(words.baseline, before.counts.held, before.counts.total)} delay_s={delay_s} changed={comparison.changed}
            selected={picked(before)?.index} on_select={pick(before)} />
          <MoatScene model={after} playhead_ms={state.playhead_ms} window={view} geometry={compareGeometry} uid={`${uid}-after`}
            caption={words.caption(words.candidate, after.counts.held, after.counts.total)} delay_s={delay_s} changed={comparison.changed}
            selected={picked(after)?.index} on_select={pick(after)} />
        </div>
        <p className="moat-small">{copy.honesty}</p>
      </div>
      <CompareInspector before={picked(before)} after={picked(after)} changed={selected !== undefined && comparison.changed.has(selected)} />
    </div>
  </section>;
}
