import { useId, useMemo, useState, useSyncExternalStore } from 'react';
import { CardBody, CardHead, HeraldicCard, InkButton, StatusChip } from '@castle-control/ui';
import { proposalQueue } from '@castle-control/ui/steward';
import type { ProposalQueue } from '@castle-control/ui/steward';
import type { PreviewVisual } from '../../beacons-model.js';
import { curveIntensity } from '../../beacons-model.js';
import { sampleNight, sampleNights } from '../../beacons-nights.js';
import type { NightId } from '../../beacons-nights.js';
import { clockLabel, fitSuggestion, night_duration_s, nightBursts, replayTrace, replayVerdict, traceAt } from '../../beacons-replay.js';
import type { CurveEditor } from './curve-editor.js';
import { createReplayClock, replay_speeds } from './replay-clock.js';
import { useReducedMotion, useReplayDriver } from './replay-driver.js';
import { openCurveDraft, proposeCurve, sameCurve, sealedCurve, sealedHere } from './replay-proposal.js';
import { TraceFigure } from './replay-trace.jsx';
import { ReplayBeacon, ReplayCurve } from './replay-tune.jsx';
import './replay.css';

const verdict_words = { pinned: 'Saturates', never_lit: 'Never lit', balanced: 'Climbs' } as const;

/** Replays a generated night through the preview model's own intensity. Curve edits re-run the whole trace. */
export function NightReplay({ item, editor, queue = proposalQueue, initial_night = 'sample' }: {
  item: PreviewVisual; editor: CurveEditor; queue?: ProposalQueue; initial_night?: NightId;
}) {
  const [clock] = useState(() => createReplayClock(night_duration_s));
  const [night_id, setNight] = useState<NightId>(initial_night);
  const reduced = useReducedMotion();
  useReplayDriver(clock, reduced);
  const time = useSyncExternalStore(clock.subscribe, clock.getSnapshot, clock.getSnapshot);
  const editing = useSyncExternalStore(editor.subscribe, editor.getSnapshot, editor.getSnapshot);
  useSyncExternalStore(queue.subscribe, queue.getSnapshot, queue.getSnapshot);
  const [notice, setNotice] = useState({ key: '', text: '' });
  const help_id = useId();
  const night = sampleNight(night_id);
  const bursts = useMemo(() => nightBursts(night.offerings), [night]);
  const counted = useMemo(() => new Set(bursts.map(burst => burst.offering)), [bursts]);
  const { curve } = item.visual;
  const trace = useMemo(() => replayTrace(curve, item.gift_weight, bursts), [curve, item.gift_weight, bursts]);
  const sealed = sealedCurve(item.visual.visual_id, queue);
  const before = useMemo(() => sealed && !sameCurve(sealed, curve) ? replayTrace(sealed, item.gift_weight, bursts) : undefined,
    [sealed, curve, item.gift_weight, bursts]);
  const verdict = replayVerdict(trace);
  const fit = fitSuggestion(trace, curve);
  const applyFit = () => {
    const point = fit && editing.draft.ranges[fit.index];
    if (!fit || !point) return;
    editor.move(fit.index, fit.total, point.intensity);
    void editor.save();
  };
  const now = traceAt(trace, curve, time.position_s);
  const top = curve.ranges.at(-1)?.total ?? 0;
  const draft = openCurveDraft(item.visual.visual_id, queue);
  const matches_seal = !!sealed && sameCurve(sealed, curve);
  const sealed_here = sealedHere(item.visual.visual_id, queue);
  const ended = time.position_s >= night_duration_s;
  const notice_key = `${item.visual.visual_id}:${draft?.revision ?? 0}`;
  const send = () => {
    const result = proposeCurve(item.visual, `${night.name} · ${verdict.text}`, queue);
    setNotice({ key: `${item.visual.visual_id}:${result.ok ? result.proposal.revision : draft?.revision ?? 0}`, text: result.ok
      ? `Sent to the Steward as “${result.proposal.title}” · revision ${result.proposal.revision}. Hold to seal it in the seal panel below.`
      : `Not sent: ${result.reason}` });
  };
  return <HeraldicCard variant="panel" className="visuals-replay" aria-label="Night replay">
    <CardHead title="Replay a night" gloss="tune against time, not single events" />
    <CardBody>
    <div className="visuals-replay-nights" role="group" aria-label="Sample night">
      {sampleNights.map(option => <InkButton key={option.id} size="small" aria-pressed={option.id === night_id}
        onClick={() => { setNight(option.id); clock.seek(0); }}>{option.name}</InkButton>)}
      <span className="visuals-note">{night.gloss} · {night.offerings.length} fictional offerings; {bursts.length} gifts or subs count,
        gift subs ×{item.gift_weight}</span>
    </div>
    <div className="visuals-replay-transport" role="group" aria-label="Replay controls">
      <InkButton size="wrap" variant="offset" ink="or" disabled={reduced} aria-pressed={time.playing}
        onClick={clock.toggle}>{time.playing ? 'Pause' : ended ? 'Replay' : time.position_s > 0 ? 'Resume' : 'Play'}</InkButton>
      <span className="visuals-replay-speeds" role="group" aria-label="Replay speed">{replay_speeds.map(speed =>
        <InkButton key={speed} size="small" aria-pressed={time.speed === speed} disabled={reduced}
          onClick={() => clock.setSpeed(speed)}>{`${speed}×`}</InkButton>)}</span>
      <p className="visuals-replay-clock"><b>{night.name} · {clockLabel(time.position_s)} / {clockLabel(night_duration_s)}</b>
        <span>{time.speed}× · {Math.round(night_duration_s / time.speed)} s for the whole night</span></p>
      <StatusChip variant="dash">SIMULATED</StatusChip>
    </div>
    {reduced && <p className="visuals-note">Reduced motion: the whole night is drawn at once and nothing animates. Scrub to inspect any minute.</p>}
    <label className="visuals-replay-scrub">Scrub the night
      <input type="range" min="0" max={night_duration_s} step="10" value={Math.round(time.position_s)}
        aria-valuetext={`${clockLabel(time.position_s)} · ${Math.round(now.intensity * 100)}% blaze`}
        onChange={event => clock.seek(event.currentTarget.valueAsNumber)} />
    </label>
    <TraceFigure trace={trace} before={before} offerings={night.offerings} counted={counted} position={time.position_s}
      lit_intensity={curveIntensity(curve, trace.lit_total)} on_seek={clock.seek}
      label={`${item.visual.name} intensity across the simulated 48-minute ${night.name.toLowerCase()} · ${verdict.text}`} />
    <div className="visuals-replay-verdict" data-tone={verdict.tone}>
      <p role="status" aria-live="polite"><b>{verdict_words[verdict.tone]}</b> {verdict.text}
        {before && <span className="visuals-replay-legend"> · dashed: the last sealed curve</span>}</p>
      {fit && <InkButton size="small" disabled={editing.phase === 'saving'} onClick={applyFit}>{fit.label}</InkButton>}
    </div>
    <div className="visuals-replay-tune">
      <ReplayCurve item={item} editor={editor} state={editing} trace={trace} now={now} help_id={help_id} />
      <ReplayBeacon item={item} now={now} position={time.position_s} offerings={night.offerings} counted={counted}
        pinned={now.total >= top && trace.pinned_s > 0} />
    </div>
    <div className="visuals-replay-handoff">
      <InkButton size="wrap" variant="offset" ink="or" onClick={send}>{draft ? 'Update the Steward proposal' : 'Send curve to the Steward'}</InkButton>
      {draft ? <StatusChip variant="dash" stamp="draft">{`Draft · revision ${draft.revision} · not on air`}</StatusChip>
        : matches_seal && <StatusChip variant="ok">{sealed_here ? 'Sealed · this is the curve' : 'Sample curve · unchanged'}</StatusChip>}
      <p className="visuals-note">Never a direct write: the Steward holds a proposal and nothing changes on air until you hold to seal. Money affects visuals only. SIMULATED.</p>
      {notice.key === notice_key && <p className="visuals-note" role="status">{notice.text}</p>}
    </div>
    </CardBody>
  </HeraldicCard>;
}
