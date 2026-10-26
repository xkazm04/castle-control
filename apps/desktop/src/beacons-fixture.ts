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

/** Illustrative, fictional contributions ported as data from prototype/ai-first/data/sample.js.
 * Kept separate from the existing 600-event model stress fixture. Never live input. */
export type Offering = { t: number; kind: 'points' | 'bits' | 'sub' | 'gift' | 'hype_train'; amount: number; login: string };
export const fixtureOfferings: readonly Offering[] = [
  {"t":31,"kind":"points","amount":500,"login":"gravebard50"},
  {"t":61,"kind":"points","amount":500,"login":"bonewarden20"},
  {"t":119,"kind":"bits","amount":100,"login":"ashnewt81"},
  {"t":176,"kind":"sub","amount":1,"login":"sabletoad35"},
  {"t":255,"kind":"sub","amount":1,"login":"rookscribe69"},
  {"t":265,"kind":"bits","amount":250,"login":"embernewt86"},
  {"t":307,"kind":"points","amount":5000,"login":"bonewisp72"},
  {"t":339,"kind":"bits","amount":100,"login":"rookscribe69"},
  {"t":411,"kind":"points","amount":500,"login":"sablemonk52"},
  {"t":433,"kind":"sub","amount":1,"login":"cinderpage29"},
  {"t":502,"kind":"points","amount":500,"login":"fogwisp96"},
  {"t":512,"kind":"bits","amount":500,"login":"hollowsmith82"},
  {"t":586,"kind":"bits","amount":1000,"login":"candlewisp37"},
  {"t":648,"kind":"bits","amount":100,"login":"cryptpage25"},
  {"t":693,"kind":"sub","amount":1,"login":"mothmonk54"},
  {"t":766,"kind":"bits","amount":250,"login":"lanternwisp75"},
  {"t":828,"kind":"points","amount":1000,"login":"fogwisp40"},
  {"t":863,"kind":"points","amount":1000,"login":"candlewisp93"},
  {"t":940,"kind":"bits","amount":250,"login":"ashelk27"},
  {"t":981,"kind":"gift","amount":10,"login":"inkrat69"},
  {"t":1044,"kind":"bits","amount":100,"login":"sableclerk53"},
  {"t":1131,"kind":"sub","amount":1,"login":"mothmonk45"},
  {"t":1179,"kind":"bits","amount":500,"login":"boneowl83"},
  {"t":1257,"kind":"bits","amount":500,"login":"sablebard69"},
  {"t":1325,"kind":"bits","amount":100,"login":"hollowpage39"},
  {"t":1376,"kind":"points","amount":500,"login":"duskwolf63"},
  {"t":1388,"kind":"gift","amount":20,"login":"boneelk8"},
  {"t":1467,"kind":"bits","amount":250,"login":"bonescribe24"},
  {"t":1473,"kind":"points","amount":5000,"login":"ashhare42"},
  {"t":1507,"kind":"sub","amount":1,"login":"mothowl31"},
  {"t":1567,"kind":"bits","amount":1000,"login":"gravebard50"},
  {"t":1627,"kind":"gift","amount":10,"login":"fogwisp40"},
  {"t":1646,"kind":"bits","amount":1000,"login":"duskfox44"},
  {"t":1653,"kind":"bits","amount":500,"login":"hollowscribe89"},
  {"t":1704,"kind":"bits","amount":250,"login":"duskowl39"},
  {"t":1778,"kind":"points","amount":500,"login":"duskcrow55"},
  {"t":1842,"kind":"points","amount":500,"login":"lanternrat58"},
  {"t":1907,"kind":"bits","amount":1000,"login":"duskelk88"},
  {"t":1946,"kind":"points","amount":500,"login":"cindermonk35"},
  {"t":2030,"kind":"bits","amount":250,"login":"sableclerk53"},
  {"t":2064,"kind":"bits","amount":250,"login":"candlesmith38"},
  {"t":2115,"kind":"points","amount":500,"login":"ledgerrat11"},
  {"t":2178,"kind":"bits","amount":250,"login":"rookscribe69"},
  {"t":2219,"kind":"sub","amount":1,"login":"duskmage99"},
  {"t":2229,"kind":"points","amount":1000,"login":"duskmage99"},
  {"t":2291,"kind":"sub","amount":1,"login":"candlesmith38"},
  {"t":2353,"kind":"hype_train","amount":2,"login":"quillpage50"},
  {"t":2390,"kind":"bits","amount":100,"login":"hollowknight44"},
  {"t":2463,"kind":"bits","amount":250,"login":"inkwarden42"},
  {"t":2497,"kind":"sub","amount":1,"login":"fogwisp40"},
  {"t":2559,"kind":"points","amount":500,"login":"embernewt86"},
  {"t":2575,"kind":"sub","amount":1,"login":"boneowl6"},
  {"t":2639,"kind":"bits","amount":100,"login":"mothclerk93"},
  {"t":2687,"kind":"points","amount":500,"login":"inkrat69"},
  {"t":2696,"kind":"bits","amount":250,"login":"sabletoad68"},
  {"t":2722,"kind":"sub","amount":1,"login":"graveclerk74"},
  {"t":2738,"kind":"points","amount":1000,"login":"sabletoad35"},
  {"t":2761,"kind":"points","amount":5000,"login":"fogwisp34"},
  {"t":2808,"kind":"points","amount":5000,"login":"fogwisp40"},
  {"t":2839,"kind":"gift","amount":50,"login":"rookscribe69"},
];
