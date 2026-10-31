import type { Offering } from '../../beacons-fixture.js';
import type { PreviewVisual } from '../../beacons-model.js';
import type { ReplayTrace, TracePoint } from '../../beacons-replay.js';
import { clockLabel, replayDomain, timeSpent } from '../../beacons-replay.js';
import type { CurveEditor } from './curve-editor.js';
import { CurvePoints } from './kindling-curve.jsx';
import { BeaconArtwork } from './artwork.jsx';
import { curveText } from './replay-proposal.js';

const cells = 24;
const kinds = { points: 'channel points', bits: 'bits', sub: 'sub', gift: 'gift subs', hype_train: 'Hype Train level' } as const;

/** The same editor as the bench, drawn over where the night spends its minutes. */
export function ReplayCurve({ item, editor, state, trace, now, help_id }: {
  item: PreviewVisual; editor: CurveEditor; state: ReturnType<CurveEditor['getSnapshot']>;
  trace: ReplayTrace; now: TracePoint; help_id: string;
}) {
  const top = item.visual.curve.ranges.at(-1)?.total ?? 0;
  return <section className="visuals-replay-curve" aria-label="Tune the curve against the night">
    <h3>Kindling curve <span>· weighted subs → blaze</span></h3>
    <p id={help_id} className="visuals-note">Drag a point, or Tab to it and use the arrows (Shift = 10). The whole night re-runs on every move.</p>
    <div className="visuals-curve-editor visuals-replay-points">
      <CurvePoints editor={editor} state={state} disabled={state.phase === 'saving'} described_by={help_id}
        domain={replayDomain(trace)} label={`Editable curve for ${item.visual.name}, replayed against the night`}
        underlay={(x, maximum) => {
          const spent = timeSpent(trace, maximum, cells);
          const most = Math.max(1, ...spent);
          const width = 600 / cells;
          return <g aria-hidden="true">
            {spent.map((seconds, cell) => seconds > 0 && <rect key={cell} data-time-spent={cell}
              className={(cell + 1) * maximum / cells > top ? 'visuals-replay-spent-pinned' : 'visuals-replay-spent'}
              x={cell * width} width={width - 1} y={140 - 26 * Math.sqrt(seconds / most)} height={26 * Math.sqrt(seconds / most)} />)}
            <rect className="visuals-replay-past-top" x={x(top)} y="0" width={Math.max(0, 600 - x(top))} height="140" />
            <line className="visuals-replay-lit" x1={x(trace.lit_total)} x2={x(trace.lit_total)} y1="0" y2="140" />
            <circle className="visuals-replay-now" cx={Math.min(600, x(now.total))} cy={140 - now.intensity * 140} r="6" />
          </g>;
        }} />
    </div>
    <p className="visuals-note">{curveText(item.visual.curve)} · bars show where the night spends its minutes; shaded past the top point means pinned.</p>
  </section>;
}

function recent(offerings: readonly Offering[], position: number) {
  const found: number[] = [];
  for (let index = offerings.length - 1; index >= 0 && found.length < 3; index--) {
    if ((offerings[index]?.t ?? Infinity) <= position) found.push(index);
  }
  return found;
}

/** The selected visual's art at the playhead, plus the last offerings to tick by. */
export function ReplayBeacon({ item, now, position, offerings, counted, pinned }: {
  item: PreviewVisual; now: TracePoint; position: number; offerings: readonly Offering[];
  counted: ReadonlySet<number>; pinned: boolean;
}) {
  const ticks = recent(offerings, position);
  const flare = ticks.find(index => counted.has(index));
  return <section className="visuals-replay-beacon" aria-label="Beacon preview at the playhead">
    <h3>Beacon preview <span>· {Math.round(now.intensity * 100)}% blaze</span></h3>
    <div className="visuals-replay-art" data-intensity={now.intensity.toFixed(3)} data-pinned={pinned}>
      <div className="visuals-replay-flare" key={flare ?? 'none'}>
        <BeaconArtwork item={{ ...item, total: now.total, intensity: now.intensity }}
          label={`${item.visual.name} at ${clockLabel(position)} · ${Math.round(now.intensity * 100)}% blaze · simulated`} />
      </div>
      {pinned && <span className="visuals-replay-stamp">Pinned at max</span>}
      <span className="visuals-replay-meter" aria-hidden="true"><i style={{ height: `${now.intensity * 100}%` }} /></span>
    </div>
    <p className="visuals-readout"><b>{now.total.toFixed(1)} weighted subs at {clockLabel(position)}</b></p>
    <ol className="visuals-replay-ticker" aria-label="Latest simulated offerings">
      {ticks.length ? ticks.map(index => {
        const offering = offerings[index];
        return offering && <li key={index} data-counted={counted.has(index)}>
          <span>{clockLabel(offering.t)}</span> {offering.login} · {offering.amount} {kinds[offering.kind]}
          <em>{counted.has(index) ? 'counted' : 'not counted'}</em>
        </li>;
      }) : <li>No offerings yet · press Play</li>}
    </ol>
  </section>;
}
