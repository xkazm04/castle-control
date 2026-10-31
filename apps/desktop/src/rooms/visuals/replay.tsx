import { useId, useMemo, useState, useSyncExternalStore } from 'react';
import { CardBody, CardHead, HeraldicCard, InkButton, StatusChip } from '@castle-control/ui';
import { proposalQueue } from '@castle-control/ui/steward';
import type { ProposalQueue } from '@castle-control/ui/steward';
import type { PreviewVisual } from '../../beacons-model.js';
import { curveIntensity } from '../../beacons-model.js';
import { fixtureOfferings } from '../../beacons-fixture.js';
import { clockLabel, night_duration_s, nightBursts, replayTrace, replayVerdict, traceAt } from '../../beacons-replay.js';
import type { CurveEditor } from './curve-editor.js';
import { CurvePoints } from './kindling-curve.jsx';
import { BeaconArtwork } from './artwork.jsx';
import { createReplayClock, replay_speeds } from './replay-clock.js';
import { useReducedMotion, useReplayDriver } from './replay-driver.js';
import { curveText, openCurveDraft, proposeCurve, sameCurve, sealedCurve } from './replay-proposal.js';
import { TraceFigure } from './replay-trace.jsx';
import './replay.css';

const bursts = nightBursts(fixtureOfferings);
const counted = new Set(bursts.map(burst => burst.offering));
const kinds = { points: 'channel points', bits: 'bits', sub: 'sub', gift: 'gift subs', hype_train: 'Hype Train level' } as const;

function latestOffering(position: number) {
  let found = -1;
  fixtureOfferings.forEach((item, index) => { if (item.t <= position) found = index; });
  return found;
}

/** Replays the sample night through the preview model's own intensity. Curve edits re-run the whole trace. */
export function NightReplay({ item, editor, queue = proposalQueue }: {
  item: PreviewVisual; editor: CurveEditor; queue?: ProposalQueue;
}) {
  const [clock] = useState(() => createReplayClock(night_duration_s));
  const reduced = useReducedMotion();
  useReplayDriver(clock, reduced);
  const time = useSyncExternalStore(clock.subscribe, clock.getSnapshot, clock.getSnapshot);
  const editing = useSyncExternalStore(editor.subscribe, editor.getSnapshot, editor.getSnapshot);
  useSyncExternalStore(queue.subscribe, queue.getSnapshot, queue.getSnapshot);
  const [notice, setNotice] = useState({ visual_id: '', text: '' });
  const help_id = useId();
  const { curve } = item.visual;
  const trace = useMemo(() => replayTrace(curve, item.gift_weight, bursts), [curve, item.gift_weight]);
  const sealed = sealedCurve(item.visual.visual_id, queue);
  const before = useMemo(() => sealed && !sameCurve(sealed, curve) ? replayTrace(sealed, item.gift_weight, bursts) : undefined,
    [sealed, curve, item.gift_weight]);
  const verdict = replayVerdict(trace);
  const now = traceAt(trace, curve, time.position_s);
  const latest = latestOffering(time.position_s);
  const offering = fixtureOfferings[latest];
  const draft = openCurveDraft(item.visual.visual_id, queue);
  const ended = time.position_s >= night_duration_s;
  const send = () => {
    const result = proposeCurve(item.visual, verdict.text, queue);
    setNotice({ visual_id: item.visual.visual_id, text: result.ok
      ? `Sent to the Steward as “${result.proposal.title}” · revision ${result.proposal.revision}. Hold to seal in the seal panel.`
      : `Not sent: ${result.reason}` });
  };
  return <HeraldicCard variant="panel" className="visuals-replay" aria-label="Night replay">
    <CardHead title="Replay a night" gloss="tune against time, not single events" />
    <CardBody>
    <div className="visuals-replay-transport" role="group" aria-label="Replay controls">
      <InkButton size="wrap" variant="offset" ink="or" disabled={reduced} aria-pressed={time.playing}
        onClick={clock.toggle}>{time.playing ? 'Pause' : ended ? 'Replay' : time.position_s > 0 ? 'Resume' : 'Play'}</InkButton>
      <span className="visuals-replay-speeds" role="group" aria-label="Replay speed">{replay_speeds.map(speed =>
        <InkButton key={speed} size="small" aria-pressed={time.speed === speed} disabled={reduced}
          onClick={() => clock.setSpeed(speed)}>{`${speed}×`}</InkButton>)}</span>
      <p className="visuals-replay-clock"><b>Sample night · {clockLabel(time.position_s)} / {clockLabel(night_duration_s)}</b>
        <span>{fixtureOfferings.length} fictional offerings · gifts + subs count</span></p>
      <StatusChip variant="dash">SIMULATED</StatusChip>
    </div>
    {reduced && <p className="visuals-note">Reduced motion: the whole night is drawn at once and nothing animates. Scrub to inspect any minute.</p>}
    <label className="visuals-replay-scrub">Scrub the night
      <input type="range" min="0" max={night_duration_s} step="10" value={Math.round(time.position_s)}
        aria-valuetext={`${clockLabel(time.position_s)} · ${Math.round(now.intensity * 100)}% blaze`}
        onChange={event => clock.seek(event.currentTarget.valueAsNumber)} />
    </label>
    <TraceFigure trace={trace} before={before} offerings={fixtureOfferings} counted={counted} position={time.position_s}
      lit_intensity={curveIntensity(curve, trace.lit_total)}
      label={`${item.visual.name} intensity across the simulated 48-minute night · ${verdict.text}`} />
    <p className="visuals-replay-verdict" data-tone={verdict.tone} role="status" aria-live="polite">
      <b>{verdict.tone === 'never_lit' ? 'Never lit' : verdict.tone === 'pinned' ? 'Saturates' : 'Climbs'}</b> {verdict.text}
      {before && <span> · dashed line: the last sealed curve</span>}</p>
    <div className="visuals-replay-tune">
      <section className="visuals-replay-curve" aria-label="Tune the curve against the night">
        <h3>Kindling curve <span>· weighted subs → blaze</span></h3>
        <p id={help_id} className="visuals-note">Drag a point, or focus it and use arrows (Shift = coarse). The trace re-runs on every move.</p>
        <div className="visuals-curve-editor visuals-replay-points">
          <CurvePoints editor={editor} state={editing} disabled={editing.phase === 'saving'} described_by={help_id}
            label={`Editable curve for ${item.visual.name}, replayed against the night`}
            underlay={x => <g aria-hidden="true">
              <line className="visuals-replay-lit" x1={x(trace.lit_total)} x2={x(trace.lit_total)} y1="0" y2="140" />
              <circle className="visuals-replay-now" cx={Math.min(600, x(now.total))} cy={140 - now.intensity * 140} r="6" />
            </g>} />
        </div>
        <p className="visuals-note">{curveText(curve)} · lit at {trace.lit_total}</p>
      </section>
      <section className="visuals-replay-beacon" aria-label="Beacon preview at the playhead">
        <h3>Beacon preview <span>· {Math.round(now.intensity * 100)}% blaze</span></h3>
        <div className="visuals-replay-art" data-intensity={now.intensity.toFixed(3)}>
          <BeaconArtwork item={{ ...item, total: now.total, intensity: now.intensity }}
            label={`${item.visual.name} at ${clockLabel(time.position_s)} · ${Math.round(now.intensity * 100)}% blaze · simulated`} />
        </div>
        <p className="visuals-readout">{now.total.toFixed(1)} weighted subs at {clockLabel(time.position_s)}<br />
          {offering ? <>{clockLabel(offering.t)} · {offering.login} · {offering.amount} {kinds[offering.kind]}
            {counted.has(latest) ? ' · counted' : ' · not counted (gifts + subs only)'}</> : 'No offerings yet'}</p>
      </section>
    </div>
    <div className="visuals-replay-handoff">
      <InkButton size="wrap" variant="offset" ink="or" onClick={send}>{draft ? 'Update the Steward proposal' : 'Send curve to the Steward'}</InkButton>
      <p className="visuals-note">Never a direct write: the Steward drafts a proposal and nothing changes on air until you hold to seal. Money affects visuals only.</p>
      {notice.visual_id === item.visual.visual_id && <p className="visuals-note" role="status">{notice.text}</p>}
    </div>
    </CardBody>
  </HeraldicCard>;
}
