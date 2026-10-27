import type { PreviewVisual } from '../../beacons-model.js';

/** A read-only figure of the existing model's curve, never another intensity engine. */
export function KindlingCurve({ item }: { item: PreviewVisual }) {
  const ranges = item.visual.curve.ranges;
  const maximum = ranges.at(-1)?.total || 1;
  const x = (total: number) => Math.min(total / maximum, 1) * 600;
  return <figure className="visuals-room-curve">
    <figcaption className="room-caption">The kindling curve · contribution to blaze</figcaption>
    <div className="visuals-room-curve-labels">{ranges.map(point =>
      <span key={point.total}>{Math.round(point.intensity * 100)}% blaze</span>)}</div>
    <svg viewBox="0 0 600 140" role="img" aria-label={`${item.visual.name} contribution to intensity curve · simulated`}>
      {ranges.slice(0, -1).map((point, index) => <rect key={point.total} x={x(point.total)} y="0"
        width={x(ranges[index + 1]?.total ?? maximum) - x(point.total)} height="140"
        className="visuals-room-curve-band" opacity={0.2 + point.intensity * 0.6} />)}
      <polyline points={ranges.map(point => `${x(point.total)},${140 - point.intensity * 140}`).join(' ')}
        className="visuals-room-curve-line" />
      <line x1={x(item.total)} x2={x(item.total)} y1="0" y2="140" className="visuals-room-curve-current" />
    </svg>
    <p>{item.total.toFixed(1)} weighted subs · {Math.round(item.intensity * 100)}% blaze · simulated</p>
  </figure>;
}
