import type { ModuleId, StampProps } from '@castle-control/ui';
import type { Snapshot } from '../model.js';
import { fixtureDelay, fixtureHeld, fixtureCharts } from '../moderation-fixture.js';
import { fixtureVisuals } from '../beacons-fixture.js';
import { fixtureEntries } from '../lots-fixture.js';
import { duelHost } from '../rooms/studio/duel-host.js';
import { roundName } from '../rooms/studio/duel-model.js';
import type { DuelPicture } from '../rooms/studio/duel-model.js';

/** The Map Room is duel-first: its tab reads the duel's state ("Duel · semifinal", "No duel"). */
export function duelWord(picture: DuelPicture | undefined, fixture: boolean): string {
  // Before the stage first mounts, the fixture duel waits on its sample four-contestant list.
  if (!picture) return fixture ? 'Duel · semifinal' : 'Unknown';
  if (picture.phase === 'empty' || picture.phase === 'called_off') return 'No duel';
  if (picture.phase === 'done') return 'Duel · champion';
  const size = picture.rounds[0]?.length ? picture.rounds[0].length * 2 : 2;
  return `Duel · ${roundName(size, picture.round).toLowerCase()}`;
}

/** The Keep's Map Room plaque reads the duel itself: "Chat duel" over its tournament and round. */
export function duelPlaque(picture: DuelPicture | undefined, fixture: boolean): { word: string; line: string } {
  if (!picture) return { word: 'Chat duel', line: fixture ? 'Sample tournament · semifinal' : 'Duel status unavailable' };
  if (picture.phase === 'empty' || picture.phase === 'called_off') return { word: 'No duel', line: 'Ask the Steward to set one up' };
  const sample = picture.simulated ? 'sample ' : '';
  if (picture.phase === 'done') return { word: 'Chat duel', line: `${picture.title} · ${sample}champion` };
  const size = picture.rounds[0]?.length ? picture.rounds[0].length * 2 : 2;
  return { word: 'Chat duel', line: `${picture.title} · ${sample}${roundName(size, picture.round).toLowerCase()}` };
}

export type KeepState = { word: string; line: string; stamp?: StampProps; plaque?: { word: string; line: string } };

export function keepReadModel(snapshot: Snapshot) {
  const fixture = snapshot.mode === 'fixture';
  const gate = snapshot.status?.gatehouse;
  const duel = duelHost.picture();
  const states: Record<ModuleId, KeepState> = {
    lottery: { word: fixture ? 'No draw' : 'Unknown', line: fixture ? `${fixtureEntries().length} sample lots · waiting for a writ` : 'Draw status unavailable',
      ...(fixture ? { stamp: { kind: 'simulated' as const } } : {}) },
    moderator: { word: fixture ? `${fixtureHeld.length} held` : 'Unknown',
      line: gate ? `Armed ${gate.armed_rules} · Watching ${gate.shadow_rules}` : 'Moderation status unknown',
      ...(fixture ? { stamp: { kind: 'shadow' as const, ...(gate ? { word: `Shadow · ${gate.shadow_rules}` } : {}) } } : {}) },
    visuals: { word: fixture ? fixtureVisuals[0]?.name ?? 'Unknown' : 'Unknown', line: fixture ? `${fixtureVisuals.length} sample visuals · contribution-driven` : 'Visual status unavailable',
      ...(fixture ? { stamp: { kind: 'simulated' as const } } : {}) },
    studio: { word: duelWord(duel, fixture), line: duel && duel.phase !== 'empty' ? `${duel.title} · chat duel` : fixture ? 'Sample chat duel · simulated ballots' : 'Duel status unavailable',
      plaque: duelPlaque(duel, fixture), ...(fixture ? { stamp: { kind: 'simulated' as const } } : {}) },
  };
  return { states, delay: fixture ? `${fixtureDelay.delay_s} s` : 'unknown', ...(fixture ? { delay_s: fixtureDelay.delay_s } : {}),
    consensus: fixture ? fixtureCharts[0]?.directions ?? [] : [] };
}
