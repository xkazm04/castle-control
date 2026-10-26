import type { PointerEvent } from 'react';
import { InkButton } from '@castle-control/ui';
import type { IntensityRange } from '@castle-control/contract';
import type { BeaconsPort, PreviewVisual } from './beacons-model.js';

// Logical SVG chart coordinates; not CSS layout values. The preview domain is 0..100 subs.
const chart = { width: 560, height: 260, left: 40, top: 20, plot_width: 500, plot_height: 220, maximum: 100 };
export function CurveEditor({ item, port }: { item: PreviewVisual; port: BeaconsPort }) {
  const points = item.visual.curve.ranges;
  const move = (event: PointerEvent<SVGCircleElement>, index: number) => {
    const bounds = event.currentTarget.ownerSVGElement?.getBoundingClientRect();
    if (!bounds?.width || !bounds.height) return;
    const x = (event.clientX - bounds.left) * chart.width / bounds.width;
    const y = (event.clientY - bounds.top) * chart.height / bounds.height;
    const lower = index === 0 ? 0 : (points[index - 1]?.total ?? 0) + 1;
    const upper = (points[index + 1]?.total ?? chart.maximum + 1) - 1;
    port.point(index, { total: Math.min(upper, Math.max(lower, Math.round((x - chart.left) / chart.plot_width * chart.maximum))),
      intensity: Math.min(1, Math.max(0, (chart.plot_height + chart.top - y) / chart.plot_height)) });
  };
  const release = (event: PointerEvent<SVGCircleElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const change = (index: number, point: IntensityRange) => port.point(index, point);
  return <div className="beacons-editor">
    <svg className="beacons-curve" viewBox={`0 0 ${chart.width} ${chart.height}`} role="group" aria-label="Kindling curve · drag points or edit the values below">
      {[0, 0.5, 1].map(value => <g key={value}>
        <line x1="40" x2="540" y1={240 - value * 220} y2={240 - value * 220} className="beacons-gridline" />
        <text x="34" y={244 - value * 220} textAnchor="end">{Math.round(value * 100)}%</text>
      </g>)}
      <polyline points={points.map(point => `${40 + point.total * 5},${240 - point.intensity * 220}`).join(' ')} />
      <line x1={40 + Math.min(100, item.total) * 5} x2={40 + Math.min(100, item.total) * 5} y1="20" y2="240" className="beacons-current" />
      {points.map((point, index) => <circle key={index} cx={40 + point.total * 5} cy={240 - point.intensity * 220} r="6"
        aria-label={`Drag point ${index + 1}`} onPointerDown={event => { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); move(event, index); }}
        onPointerMove={event => { if (event.currentTarget.hasPointerCapture(event.pointerId)) move(event, index); }}
        onPointerUp={release} onPointerCancel={release} />)}
      <text x="40" y="258">0 subs</text><text x="540" y="258" textAnchor="end">100 weighted subs</text>
    </svg>
    <div className="beacons-points">
      {points.map((point, index) => <fieldset key={index}><legend>Point {index + 1}</legend>
        <label>Total<input type="number" min={index === 0 ? 0 : (points[index - 1]?.total ?? 0) + 1}
          max={(points[index + 1]?.total ?? 101) - 1} step="1" value={point.total} aria-label={`Point ${index + 1} total`}
          onChange={event => change(index, { ...point, total: event.currentTarget.valueAsNumber })} /></label>
        <label>Intensity<input type="number" min="0" max="1" step="0.01" value={Number(point.intensity.toFixed(3))}
          aria-label={`Point ${index + 1} intensity`} onChange={event => change(index, { ...point, intensity: event.currentTarget.valueAsNumber })} /></label>
      </fieldset>)}
    </div>
    <div className="beacons-tools">
      <label>Decay<select aria-label="Decay" value={item.visual.curve.decay.kind === 'none' ? 0 : item.visual.curve.decay.half_life_s}
        onChange={event => { const seconds = Number(event.currentTarget.value); port.decay(seconds === 0 ? { kind: 'none' } : { kind: 'exponential', half_life_s: seconds }); }}>
        <option value="120">Halves every 2 min</option><option value="300">Halves every 5 min</option>
        <option value="900">Halves every 15 min</option><option value="0">No decay</option>
      </select></label>
      <label>Gift subs count as {item.gift_weight}×<input type="range" min="1" max="6" step="1" value={item.gift_weight}
        aria-label="Weight of a gift sub" onChange={event => port.weight(event.currentTarget.valueAsNumber)} /></label>
      <InkButton size="small" variant="ghost" onClick={port.reset}>Reset curve</InkButton>
    </div>
    <p className="beacons-meta">Drag a handle or edit its values. Totals stay ordered; intensity is 0–1. Gift weighting applies to future test fires only.</p>
  </div>;
}
