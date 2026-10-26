import { parseMethodParams, beaconsCurveSet } from '@castle-control/contract';
import type { IntensityCurve, IntensityDecay, IntensityRange, Visual, VisualId } from '@castle-control/contract';
import type { PreviewEvent } from './beacons-fixture.js';
import { fixtureBurst, fixtureEvents, fixtureVisuals } from './beacons-fixture.js';

export type PreviewVisual = { visual: Visual; gift_weight: number; total: number; intensity: number };
export type BeaconsPreview = { selected: VisualId; visuals: readonly PreviewVisual[]; events: readonly PreviewEvent[]; elapsed_s: number; notice: string };
export type BeaconsPort = {
  getSnapshot: () => BeaconsPreview; subscribe: (listener: () => void) => () => void;
  select: (id: VisualId) => void; point: (index: number, point: IntensityRange) => void;
  decay: (decay: IntensityDecay) => void; weight: (weight: number) => void;
  fire: (source: 'gift' | 'subscribe', count: number) => void; advance: () => void; reset: () => void;
};

export function curveIntensity(curve: IntensityCurve, total: number): number {
  let previous = curve.ranges[0];
  if (!previous) return 0;
  if (total <= previous.total) return previous.intensity;
  for (const next of curve.ranges.slice(1)) {
    if (total <= next.total) return previous.intensity + (next.intensity - previous.intensity)
      * (total - previous.total) / (next.total - previous.total);
    previous = next;
  }
  return previous.intensity;
}

/** UI-only sandbox. The historical feed and initial totals are illustrative,
 * not reconstructed live accounting. No RPC, identities, ledger or OBS adapter. */
export function createBeaconsPreview(): BeaconsPort {
  const first = fixtureVisuals[0];
  if (!first) throw new Error('Missing generated beacon fixture');
  let serial = 600;
  let snapshot: BeaconsPreview = {
    selected: first.visual_id, visuals: fixtureVisuals.map((visual, index) => ({ visual, gift_weight: 1,
      total: 18 + index * 6, intensity: curveIntensity(visual.curve, 18 + index * 6) })),
    events: fixtureEvents, elapsed_s: 0, notice: 'Simulated snapshot · no live input.',
  };
  const listeners = new Set<() => void>();
  const publish = (next: BeaconsPreview) => { snapshot = next; for (const listener of listeners) listener(); };
  const update = (change: (item: PreviewVisual) => PreviewVisual, notice: string) => publish({ ...snapshot, notice,
    visuals: snapshot.visuals.map(item => {
      if (item.visual.visual_id !== snapshot.selected) return item;
      const next = change(item);
      return { ...next, intensity: curveIntensity(next.visual.curve, next.total) };
    }),
  });
  const setCurve = (curve: IntensityCurve) => {
    const parsed = parseMethodParams(beaconsCurveSet, { visual_id: snapshot.selected, curve });
    if (parsed.curve.ranges.some((point, index, points) => index > 0 && point.total <= (points[index - 1]?.total ?? 0))) {
      publish({ ...snapshot, notice: 'Keep point totals strictly increasing. Curve unchanged.' });
      return;
    }
    update(item => ({ ...item, visual: { ...item.visual, curve: parsed.curve } }), 'Curve changed locally · preview follows the curve.');
  };
  const selected = () => snapshot.visuals.find(item => item.visual.visual_id === snapshot.selected);
  return {
    getSnapshot: () => snapshot,
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    select(id) { if (snapshot.visuals.some(item => item.visual.visual_id === id)) publish({ ...snapshot, selected: id }); },
    point(index, point) {
      const item = selected();
      if (!item || !item.visual.curve.ranges[index] || !Number.isInteger(point.total) || point.total < 0 || point.total > 100
        || !Number.isFinite(point.intensity) || point.intensity < 0 || point.intensity > 1) return;
      setCurve({ ...item.visual.curve, ranges: item.visual.curve.ranges.map((old, position) => position === index ? point : old) });
    },
    decay(decay) { const item = selected(); if (item) setCurve({ ...item.visual.curve, decay }); },
    weight(weight) {
      if (Number.isInteger(weight) && weight >= 1 && weight <= 6) update(item => ({ ...item, gift_weight: weight }),
        'Gift weighting changed for future test fires only.');
    },
    fire(source, count) {
      const item = selected();
      if (!item || !Number.isInteger(count) || count < 1 || count > 50) return;
      const burst = fixtureBurst(snapshot.selected, source, 1);
      const events: PreviewEvent[] = Array.from({ length: count }, () => ({ id: `simulated-event-${serial++}`,
        at: new Date(Date.UTC(2026, 9, 26, 12, 0, snapshot.elapsed_s)).toISOString(),
        visual_id: snapshot.selected, burst, label: 'simulated' }));
      const total = item.total + count * (source === 'gift' ? item.gift_weight : 1);
      publish({ ...snapshot, events: [...events, ...snapshot.events],
        visuals: snapshot.visuals.map(old => old === item ? { ...old, total, intensity: curveIntensity(old.visual.curve, total) } : old),
        notice: `Simulated ${count} ${source} event${count === 1 ? '' : 's'} added locally. Nothing sent.`,
      });
    },
    advance() {
      publish({ ...snapshot, elapsed_s: snapshot.elapsed_s + 60, notice: 'Simulated clock advanced 60 s · decay applied locally.',
        visuals: snapshot.visuals.map(item => {
          const decay = item.visual.curve.decay;
          const total = item.total * (decay.kind === 'none' ? 1 : 2 ** (-60 / decay.half_life_s));
          return { ...item, total, intensity: curveIntensity(item.visual.curve, total) };
        }),
      });
    },
    reset() {
      const original = fixtureVisuals.find(item => item.visual_id === snapshot.selected);
      if (original) update(item => ({ ...item, visual: original, gift_weight: 1 }), 'Curve, decay and weighting reset locally.');
    },
  };
}
