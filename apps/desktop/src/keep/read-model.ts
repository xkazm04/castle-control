import type { ModuleId, StampProps } from '@castle-control/ui';
import type { Snapshot } from '../model.js';
import { fixtureDelay, fixtureHeld, fixtureCharts } from '../moderation-fixture.js';
import { fixtureVisuals } from '../beacons-fixture.js';
import { fixtureEntries } from '../lots-fixture.js';

export function keepReadModel(snapshot: Snapshot) {
  const fixture = snapshot.mode === 'fixture';
  const gate = snapshot.status?.gatehouse;
  const states: Record<ModuleId, { word: string; line: string; stamp?: StampProps }> = {
    lottery: { word: fixture ? 'No draw' : 'Unknown', line: fixture ? `${fixtureEntries().length} sample lots · waiting for a writ` : 'Draw status unavailable',
      ...(fixture ? { stamp: { kind: 'simulated' as const } } : {}) },
    moderator: { word: fixture ? `${fixtureHeld.length} held` : 'Unknown',
      line: gate ? `Armed ${gate.armed_rules} · Watching ${gate.shadow_rules}` : 'Moderation status unknown',
      ...(fixture ? { stamp: { kind: 'shadow' as const, ...(gate ? { word: `Shadow · ${gate.shadow_rules}` } : {}) } } : {}) },
    visuals: { word: fixture ? fixtureVisuals[0]?.name ?? 'Unknown' : 'Unknown', line: fixture ? `${fixtureVisuals.length} sample visuals · contribution-driven` : 'Visual status unavailable',
      ...(fixture ? { stamp: { kind: 'simulated' as const } } : {}) },
    studio: { word: fixture ? 'Sand table' : 'Unknown', line: fixture ? 'Illustrative war table · local test only' : 'Extension status unavailable',
      ...(fixture ? { stamp: { kind: 'sample' as const, word: 'Local test' } } : {}) },
  };
  return { states, delay: fixture ? `${fixtureDelay.delay_s} s` : 'unknown',
    consensus: fixture ? fixtureCharts[0]?.directions ?? [] : [] };
}
