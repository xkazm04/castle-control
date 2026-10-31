import { memo } from 'react';
import type { CSSProperties, PointerEvent } from 'react';
import type { Offering } from '../../beacons-fixture.js';
import type { ReplayTrace } from '../../beacons-replay.js';
import { clockLabel, minute } from '../../beacons-replay.js';

const width = 600;
const plot = 118;
const y = (intensity: number) => 4 + (1 - intensity) * (plot - 4);
const line = (trace: ReplayTrace) => {
  const x = (t: number) => t / trace.duration_s * width;
  return trace.points.map(point => `${x(point.t).toFixed(2)},${y(point.intensity).toFixed(2)}`).join(' ');
};
const percent = (t: number, duration: number): CSSProperties => ({ left: `${t / duration * 100}%` });
const kinds = { points: 'channel points', bits: 'bits', sub: 'sub', gift: 'gift subs', hype_train: 'Hype Train level' } as const;

/** Everything but the playhead: redrawn only when the night, curve or weighting changes. */
const TraceLayers = memo(function TraceLayers({ trace, before, offerings, counted, lit_intensity }: {
  trace: ReplayTrace; before?: ReplayTrace | undefined; offerings: readonly Offering[]; counted: ReadonlySet<number>; lit_intensity: number;
}) {
  const x = (t: number) => Math.round(t / trace.duration_s * width * 100) / 100;
  return <>
    {trace.pinned.map(band => <rect key={band.from} className="visuals-replay-pinned" data-pinned-band={band.from}
      x={x(band.from)} width={Math.max(1, x(band.to) - x(band.from))} y="0" height={plot} />)}
    <path className="visuals-replay-grid" d={`M0 ${y(1)}H${width}M0 ${y(0.5)}H${width}`} />
    <path className="visuals-replay-lit" d={`M0 ${y(lit_intensity)}H${width}`} />
    {before && <polyline className="visuals-replay-before" points={line(before)} data-trace="before" />}
    <polyline className="visuals-replay-line" points={line(trace)} data-trace="current" />
    <path className="visuals-replay-floor" d={`M0 ${plot}H${width}`} />
    {offerings.map((item, index) => <line key={index} data-offering-tick={index}
      className={counted.has(index) ? 'visuals-replay-tick' : 'visuals-replay-tick-muted'}
      x1={x(item.t)} x2={x(item.t)} y1={plot + 4} y2={counted.has(index) ? 138 : 128}>
      <title>{`${clockLabel(item.t)} · ${item.login} · ${item.amount} ${kinds[item.kind]} · ${counted.has(index) ? 'counted' : 'not counted'} · fictional`}</title>
    </line>)}
  </>;
});

/** Pointer x on the plot to a night second, on the same 10 s steps as the range. */
export function scrubSeconds(client_x: number, rect: { left: number; width: number }, duration: number): number | undefined {
  if (!(rect.width > 0)) return undefined;
  return Math.max(0, Math.min(duration, Math.round((client_x - rect.left) / rect.width * duration / 10) * 10));
}
function seekFrom(event: PointerEvent<HTMLDivElement>, duration: number, seek: (seconds: number) => void) {
  const seconds = scrubSeconds(event.clientX, event.currentTarget.getBoundingClientRect(), duration);
  if (seconds !== undefined) seek(seconds);
}

/** The night as one figure: pinned bands, the lit threshold, the before/after traces and every offering tick.
 * Pressing on the figure scrubs too; the labelled range above stays the keyboard control. */
export function TraceFigure({ trace, before, offerings, counted, position, lit_intensity, label, on_seek, now_intensity }: {
  trace: ReplayTrace; before?: ReplayTrace | undefined; offerings: readonly Offering[]; counted: ReadonlySet<number>;
  position: number; lit_intensity: number; label: string; on_seek?: (seconds: number) => void; now_intensity?: number;
}) {
  const share = position / trace.duration_s;
  const lit_at = trace.first_lit_s === undefined ? undefined
    : trace.points.find(point => point.t === trace.first_lit_s && point.total >= trace.lit_total);
  const lit_share = lit_at ? lit_at.t / trace.duration_s : 0;
  // A climbing night names its peak at the plot's foot: the space straight under the highest point is always clear.
  const peak = trace.first_lit_s !== undefined && trace.pinned_s === 0 ? trace.peak : undefined;
  const peak_share = peak ? peak.t / trace.duration_s : 0;
  const marks = Array.from({ length: Math.floor(trace.duration_s / 360) + 1 }, (_, index) => index * 360);
  return <figure className="visuals-replay-figure">
    <div className="visuals-replay-plot" data-scrub={on_seek ? 'pointer' : undefined}
      onPointerDown={event => {
        if (!on_seek || event.button !== 0) return;
        event.currentTarget.setPointerCapture?.(event.pointerId);
        seekFrom(event, trace.duration_s, on_seek);
      }}
      onPointerMove={event => { if (on_seek && event.currentTarget.hasPointerCapture?.(event.pointerId)) seekFrom(event, trace.duration_s, on_seek); }}>
      <svg viewBox={`0 0 ${width} 140`} preserveAspectRatio="none" role="img" aria-label={label}>
        <TraceLayers trace={trace} before={before} offerings={offerings} counted={counted} lit_intensity={lit_intensity} />
        {peak && <line className="visuals-replay-peak-guide" x1={peak_share * width} x2={peak_share * width}
          y1={y(peak.intensity)} y2={plot} />}
        <line className="visuals-replay-playhead" x1={position / trace.duration_s * width} x2={position / trace.duration_s * width} y1="0" y2="140" />
      </svg>
      {trace.pinned.filter(band => band.to - band.from >= 120).map(band =>
        <span key={band.from} className="visuals-replay-band-label" style={percent(band.from, trace.duration_s)}>pinned at max</span>)}
      {now_intensity !== undefined && <span className="visuals-replay-now-label" aria-hidden="true"
        style={{ left: `${share * 100}%`, top: `${y(now_intensity) / 140 * 100}%` }}
        data-edge={share > 0.92 ? 'end' : share < 0.04 ? 'start' : undefined}>{`${Math.round(now_intensity * 100)}%`}</span>}
      {lit_at && <span className="visuals-replay-first-lit" aria-hidden="true" data-first-lit={lit_at.t}
        style={{ left: `${lit_share * 100}%`, top: `${y(lit_at.intensity) / 140 * 100}%` }}
        data-edge={lit_share > 0.85 ? 'end' : undefined} data-place={lit_at.intensity > 0.8 ? 'below' : undefined}>{`first lit · ${clockLabel(lit_at.t)}`}</span>}
      {peak && <>
        <span className="visuals-replay-peak-dot" aria-hidden="true"
          style={{ left: `${peak_share * 100}%`, top: `${y(peak.intensity) / 140 * 100}%` }} />
        <span className="visuals-replay-peak-label" aria-hidden="true" data-peak={peak.t} style={percent(peak.t, trace.duration_s)}
          data-edge={peak_share > 0.85 ? 'end' : undefined}>{`peak ${Math.round(peak.intensity * 100)}% · ${clockLabel(peak.t)}`}</span>
      </>}
      <span className="visuals-replay-axis-lit" aria-hidden="true" style={{ top: `${y(lit_intensity) / 140 * 100}%` }}>lit</span>
      <span className="visuals-replay-axis-top" aria-hidden="true">100%</span>
      <span className="visuals-replay-axis-zero" aria-hidden="true">0%</span>
    </div>
    <div className="visuals-replay-time" aria-hidden="true">{marks.map(t =>
      <span key={t} style={percent(t, trace.duration_s)}>{minute(t)} min</span>)}</div>
  </figure>;
}
