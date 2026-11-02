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
  if (!picture) return fixture ? 'Duel · semifinal' : 'Ready';
  if (picture.phase === 'empty' || picture.phase === 'called_off') return 'No duel';
  if (picture.phase === 'done') return 'Duel · champion';
  const size = picture.rounds[0]?.length ? picture.rounds[0].length * 2 : 2;
  return `Duel · ${roundName(size, picture.round).toLowerCase()}`;
}

/** The Keep's Map Room plaque reads the duel itself: "Chat duel" over its tournament and round. */
export function duelPlaque(picture: DuelPicture | undefined, fixture: boolean): { word: string; line: string } {
  // With no duel read yet, core reads like the other three rooms: ready, and where the state shows.
  if (!picture) return fixture ? { word: 'Chat duel', line: 'Sample tournament · semifinal' } : { word: 'Ready', line: core_readings.studio };
  if (picture.phase === 'empty' || picture.phase === 'called_off') return { word: 'No duel', line: 'Ask the Steward to set one up' };
  const sample = picture.simulated ? 'sample ' : '';
  if (picture.phase === 'done') return { word: 'Chat duel', line: `${picture.title} · ${sample}champion` };
  const size = picture.rounds[0]?.length ? picture.rounds[0].length * 2 : 2;
  return { word: 'Chat duel', line: `${picture.title} · ${sample}${roundName(size, picture.round).toLowerCase()}` };
}

/**
 * Core mode cannot read every chamber from the Keep without opening it. Those readings
 * stay honest without a wall of "Unknown": the room is ready, and the line says where
 * the state shows and which Steward flow sets it up.
 */
export const core_readings = {
  lottery: 'Your draw shows in the room · ask the Steward to set one up',
  moderator: 'Held messages show in the room · ask the Steward for rules',
  visuals: 'Your beacons show in the room · ask the Steward to light one',
  studio: 'Your duel shows in the room · ask the Steward to start one',
  delay: 'set in the Gatehouse',
} as const;

export type KeepState = { word: string; line: string; stamp?: StampProps; plaque?: { word: string; line: string } };

export function keepReadModel(snapshot: Snapshot) {
  const fixture = snapshot.mode === 'fixture';
  const gate = snapshot.status?.gatehouse;
  const duel = duelHost.picture();
  const states: Record<ModuleId, KeepState> = {
    lottery: { word: fixture ? 'No draw' : 'Ready', line: fixture ? `${fixtureEntries().length} sample lots · waiting for a writ` : core_readings.lottery,
      ...(fixture ? { stamp: { kind: 'simulated' as const } } : {}) },
    moderator: { word: fixture ? `${fixtureHeld.length} held` : 'Ready',
      line: gate ? `Armed ${gate.armed_rules} · Watching ${gate.shadow_rules}` : core_readings.moderator,
      ...(fixture ? { stamp: { kind: 'shadow' as const, ...(gate ? { word: `Shadow · ${gate.shadow_rules}` } : {}) } } : {}) },
    visuals: { word: fixture ? fixtureVisuals[0]?.name ?? 'Ready' : 'Ready', line: fixture ? `${fixtureVisuals.length} sample visuals · contribution-driven` : core_readings.visuals,
      ...(fixture ? { stamp: { kind: 'simulated' as const } } : {}) },
    studio: { word: duelWord(duel, fixture), line: duel && duel.phase !== 'empty' ? `${duel.title} · chat duel` : fixture ? 'Sample chat duel · simulated ballots' : core_readings.studio,
      plaque: duelPlaque(duel, fixture), ...(fixture ? { stamp: { kind: 'simulated' as const } } : {}) },
  };
  return { states, delay: fixture ? `${fixtureDelay.delay_s} s` : core_readings.delay, ...(fixture ? { delay_s: fixtureDelay.delay_s } : {}),
    consensus: fixture ? fixtureCharts[0]?.directions ?? [] : [] };
}
