import { parseMethodParams, parseMethodResult, beaconsVisualList, beaconsSimulate, beaconsSourceUrl } from '@castle-control/contract';
import type { SimulatedBurst, Visual, VisualId } from '@castle-control/contract';

// Generated demo data crosses the same schema door as an eventual response.
export const fixtureVisuals: readonly Visual[] = parseMethodResult(beaconsVisualList, JSON.stringify({ visuals: [
  { visual_id: 'offering-altar', name: 'Offering altar', design_id: 'altar',
    curve: { ranges: [{ total: 0, intensity: 0 }, { total: 10, intensity: 0.25 }, { total: 30, intensity: 0.6 }, { total: 100, intensity: 1 }],
      decay: { kind: 'exponential', half_life_s: 300 } } },
  { visual_id: 'gilded-frame', name: 'Gilded camera frame', design_id: 'camera-frame',
    curve: { ranges: [{ total: 0, intensity: 0 }, { total: 10, intensity: 0.35 }, { total: 30, intensity: 0.7 }, { total: 100, intensity: 1 }],
      decay: { kind: 'exponential', half_life_s: 120 } } },
  { visual_id: 'hype-border', name: 'Hype border', design_id: 'border',
    curve: { ranges: [{ total: 0, intensity: 0 }, { total: 10, intensity: 0.2 }, { total: 30, intensity: 0.5 }, { total: 100, intensity: 1 }],
      decay: { kind: 'exponential', half_life_s: 900 } } },
] })).visuals;

export type PreviewEvent = {
  id: string; at: string; visual_id: VisualId; burst: SimulatedBurst; label: 'simulated';
};
export function fixtureBurst(visual_id: VisualId, source: 'gift' | 'subscribe', amount: number): SimulatedBurst {
  return parseMethodParams(beaconsSimulate, { visual_id, burst: { source, amount } }).burst;
}
export const fixtureEvents: readonly PreviewEvent[] = Array.from({ length: 600 }, (_, index) => {
  const visual = fixtureVisuals[index % fixtureVisuals.length];
  if (!visual) throw new Error('Missing generated beacon fixture');
  return { id: `simulated-event-${index}`, at: new Date(Date.UTC(2026, 9, 26, 12, 0, 0) - index * 1000).toISOString(),
    visual_id: visual.visual_id, burst: fixtureBurst(visual.visual_id, index % 2 ? 'gift' : 'subscribe', 1), label: 'simulated' };
});

export function fixtureSourceUrl(visual_id: VisualId): string {
  return parseMethodResult(beaconsSourceUrl, JSON.stringify({ url: `http://localhost:4821/fixture-not-live/${visual_id}` })).url;
}
