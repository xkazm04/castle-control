import { memo, useMemo } from 'react';
import type { VisualId } from '@castle-control/contract';
import type { PreviewVisual } from '../../beacons-model.js';
import type { ReplayBurst } from '../../beacons-replay.js';
import { minute, replayTrace, replayVerdict } from '../../beacons-replay.js';

export const verdict_words = { pinned: 'Tops out', never_lit: 'Never lit', balanced: 'Climbs' } as const;

/** Every beacon against the same night, side by side; choosing one tunes it below. */
export const NightCompare = memo(function NightCompare({ visuals, selected, bursts, on_select }: {
  visuals: readonly PreviewVisual[]; selected: VisualId; bursts: readonly ReplayBurst[]; on_select: (id: VisualId) => void;
}) {
  const rows = useMemo(() => visuals.map(item => ({ item, trace: replayTrace(item.visual.curve, item.gift_weight, bursts) })),
    [visuals, bursts]);
  return <div className="visuals-replay-compare" role="group" aria-label="Tonight across your beacons">
    {rows.map(({ item, trace }) => {
      const verdict = replayVerdict(trace);
      const x = (t: number) => (t / trace.duration_s * 120).toFixed(1);
      const pinned = Math.round(trace.pinned_s / 60);
      return <button type="button" key={item.visual.visual_id} className="visuals-replay-compare-row" data-tone={verdict.tone}
        aria-pressed={item.visual.visual_id === selected} onClick={() => on_select(item.visual.visual_id)}
        aria-label={`${item.visual.name}: ${verdict_words[verdict.tone]}. ${verdict.text}`}>
        <span className="visuals-replay-compare-name">{item.visual.name}</span>
        <svg viewBox="0 0 120 24" preserveAspectRatio="none" aria-hidden="true">
          {trace.pinned.map(band => <rect key={band.from} className="visuals-replay-pinned" x={x(band.from)} y="0" height="24"
            width={Math.max(0.5, (band.to - band.from) / trace.duration_s * 120).toFixed(1)} />)}
          <polyline className="visuals-replay-line" points={trace.points.map(point =>
            `${x(point.t)},${(22 - point.intensity * 20).toFixed(1)}`).join(' ')} />
        </svg>
        <span className="visuals-replay-compare-word">{verdict_words[verdict.tone]}</span>
        <span className="visuals-replay-compare-stats">
          {trace.pinned_s > 0 ? `full blaze ${Math.max(1, pinned)} min` : `peak ${Math.round(trace.peak.intensity * 100)}%`}
          {` · lit ${minute(trace.lit_s)} of ${minute(trace.duration_s)} min`}
        </span>
      </button>;
    })}
  </div>;
});
