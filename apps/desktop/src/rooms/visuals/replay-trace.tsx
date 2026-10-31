import type { CSSProperties } from 'react';
import type { Offering } from '../../beacons-fixture.js';
import type { ReplayTrace } from '../../beacons-replay.js';
import { minute } from '../../beacons-replay.js';

const width = 600;
const plot = 118;
const y = (intensity: number) => 4 + (1 - intensity) * (plot - 4);
const line = (trace: ReplayTrace) => {
  const x = (t: number) => t / trace.duration_s * width;
  return trace.points.map(point => `${x(point.t).toFixed(2)},${y(point.intensity).toFixed(2)}`).join(' ');
};
const percent = (t: number, duration: number): CSSProperties => ({ left: `${t / duration * 100}%` });

/** The night as one figure: pinned bands, the lit threshold, the before/after traces and every offering tick. */
export function TraceFigure({ trace, before, offerings, counted, position, lit_intensity, label }: {
  trace: ReplayTrace; before?: ReplayTrace | undefined; offerings: readonly Offering[]; counted: ReadonlySet<number>;
  position: number; lit_intensity: number; label: string;
}) {
  const x = (t: number) => t / trace.duration_s * width;
  const marks = Array.from({ length: Math.floor(trace.duration_s / 360) + 1 }, (_, index) => index * 360);
  return <figure className="visuals-replay-figure">
    <div className="visuals-replay-plot">
      <svg viewBox={`0 0 ${width} 140`} preserveAspectRatio="none" role="img" aria-label={label}>
        {trace.pinned.map(band => <rect key={band.from} className="visuals-replay-pinned" data-pinned-band={band.from}
          x={x(band.from)} width={Math.max(1, x(band.to) - x(band.from))} y="0" height={plot} />)}
        <path className="visuals-replay-grid" d={`M0 ${y(1)}H${width}M0 ${y(0.5)}H${width}`} />
        <path className="visuals-replay-lit" d={`M0 ${y(lit_intensity)}H${width}`} />
        {before && <polyline className="visuals-replay-before" points={line(before)} data-trace="before" />}
        <polyline className="visuals-replay-line" points={line(trace)} data-trace="current" />
        <path className="visuals-replay-floor" d={`M0 ${plot}H${width}`} />
        {offerings.map((item, index) => <line key={index} data-offering-tick={index}
          className={counted.has(index) ? 'visuals-replay-tick' : 'visuals-replay-tick-muted'}
          x1={x(item.t)} x2={x(item.t)} y1={plot + 4} y2={counted.has(index) ? 138 : 128} />)}
        <line className="visuals-replay-playhead" x1={x(position)} x2={x(position)} y1="0" y2="140" />
      </svg>
      {trace.pinned.filter(band => band.to - band.from >= 120).map(band =>
        <span key={band.from} className="visuals-replay-band-label" style={percent(band.from, trace.duration_s)}>pinned at max</span>)}
      <span className="visuals-replay-axis-top" aria-hidden="true">100%</span>
      <span className="visuals-replay-axis-zero" aria-hidden="true">0%</span>
    </div>
    <div className="visuals-replay-time" aria-hidden="true">{marks.map(t =>
      <span key={t} style={percent(t, trace.duration_s)}>{minute(t)} min</span>)}</div>
  </figure>;
}
