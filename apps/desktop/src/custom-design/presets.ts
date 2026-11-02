import type { ArtAssetKind } from '@castle-control/contract';

/**
 * The library's ten presets per kind, as a small static table so pickers and the Custom design
 * request chips need no catalog fetch. Mirrors library.json (presets.test.ts fails on drift);
 * the full catalog with tags and anchors loads lazily inside the flow.
 */
export type LibraryPreset = { id: string; kind: ArtAssetKind; file: string; width: number; height: number; style_name: string };
export const library_presets: readonly LibraryPreset[] = [
  { id: 'beacon-01', kind: 'beacon', file: 'library/beacon/beacon-01.webp', width: 574, height: 768, style_name: 'Arcane Relic Containment' },
  { id: 'beacon-03', kind: 'beacon', file: 'library/beacon/beacon-03.webp', width: 576, height: 768, style_name: 'Industrial Cyberpunk Realism' },
  { id: 'beacon-05', kind: 'beacon', file: 'library/beacon/beacon-05.webp', width: 576, height: 768, style_name: 'Forged Volcanic Brazier' },
  { id: 'beacon-06', kind: 'beacon', file: 'library/beacon/beacon-06.webp', width: 574, height: 768, style_name: 'High-Fantasy Arcane Reliquary' },
  { id: 'beacon-10', kind: 'beacon', file: 'library/beacon/beacon-10.webp', width: 574, height: 768, style_name: 'Pastel Arcane Relic' },
  { id: 'beacon-12', kind: 'beacon', file: 'library/beacon/beacon-12.webp', width: 574, height: 768, style_name: 'Retro-Futuristic Synthwave' },
  { id: 'beacon-13', kind: 'beacon', file: 'library/beacon/beacon-13.webp', width: 574, height: 768, style_name: 'Stylized Druidic Craft' },
  { id: 'beacon-16', kind: 'beacon', file: 'library/beacon/beacon-16.webp', width: 574, height: 768, style_name: 'Subterranean Soul Lantern' },
  { id: 'beacon-18', kind: 'beacon', file: 'library/beacon/beacon-18.webp', width: 574, height: 768, style_name: 'Stormforged Tactical Sci-Fi' },
  { id: 'beacon-20', kind: 'beacon', file: 'library/beacon/beacon-20.webp', width: 574, height: 768, style_name: 'Hallowed Night Gothic' },
  { id: 'frame-01', kind: 'frame', file: 'library/frame/frame-01.webp', width: 768, height: 432, style_name: 'Graphite Precision' },
  { id: 'frame-02', kind: 'frame', file: 'library/frame/frame-02.webp', width: 768, height: 432, style_name: 'Electric Arena Armor' },
  { id: 'frame-03', kind: 'frame', file: 'library/frame/frame-03.webp', width: 768, height: 432, style_name: 'Amethyst Gothic Relic' },
  { id: 'frame-04', kind: 'frame', file: 'library/frame/frame-04.webp', width: 768, height: 432, style_name: 'Neon Titanium HUD' },
  { id: 'frame-06', kind: 'frame', file: 'library/frame/frame-06.webp', width: 768, height: 432, style_name: 'Cozy Botanical Oak' },
  { id: 'frame-12', kind: 'frame', file: 'library/frame/frame-12.webp', width: 768, height: 432, style_name: 'Orbital Visor' },
  { id: 'frame-15', kind: 'frame', file: 'library/frame/frame-15.webp', width: 768, height: 432, style_name: 'Norse Ironwood' },
  { id: 'frame-19', kind: 'frame', file: 'library/frame/frame-19.webp', width: 768, height: 432, style_name: 'Glacial Citadel' },
  { id: 'frame-10', kind: 'frame', file: 'library/frame/frame-10.webp', width: 768, height: 432, style_name: 'Imperial Baroque Strategy' },
  { id: 'frame-20', kind: 'frame', file: 'library/frame/frame-20.webp', width: 768, height: 432, style_name: 'Hallowed Night Gothic' },
  { id: 'votebar-01', kind: 'vote_bar', file: 'library/votebar/votebar-01.webp', width: 768, height: 256, style_name: 'Forged Gatehouse Steel' },
  { id: 'votebar-03', kind: 'vote_bar', file: 'library/votebar/votebar-03.webp', width: 768, height: 256, style_name: 'Oxblood Gothic Iron' },
  { id: 'votebar-04', kind: 'vote_bar', file: 'library/votebar/votebar-04.webp', width: 768, height: 256, style_name: 'Neon Gunmetal' },
  { id: 'votebar-05', kind: 'vote_bar', file: 'library/votebar/votebar-05.webp', width: 768, height: 256, style_name: 'Forged Hemp Rivalry' },
  { id: 'votebar-07', kind: 'vote_bar', file: 'library/votebar/votebar-07.webp', width: 768, height: 256, style_name: 'Sapphire Oathsteel' },
  { id: 'votebar-11', kind: 'vote_bar', file: 'library/votebar/votebar-11.webp', width: 768, height: 256, style_name: 'Runeforged Iron' },
  { id: 'votebar-12', kind: 'vote_bar', file: 'library/votebar/votebar-12.webp', width: 768, height: 256, style_name: 'Neon Stage Hardware' },
  { id: 'votebar-13', kind: 'vote_bar', file: 'library/votebar/votebar-13.webp', width: 768, height: 256, style_name: 'Ironbound Slate Gatehouse' },
  { id: 'votebar-16', kind: 'vote_bar', file: 'library/votebar/votebar-16.webp', width: 768, height: 256, style_name: 'Pastel Jewel Gatehouse' },
  { id: 'votebar-20', kind: 'vote_bar', file: 'library/votebar/votebar-20.webp', width: 768, height: 256, style_name: 'Hallowed Night Gothic' },
  { id: 'vessel-01', kind: 'draw_vessel', file: 'library/vessel/vessel-01.webp', width: 768, height: 768, style_name: 'Arcane-Tech Loot Vessel' },
  { id: 'vessel-03', kind: 'draw_vessel', file: 'library/vessel/vessel-03.webp', width: 768, height: 768, style_name: 'Grimdark Ember Reliquary' },
  { id: 'vessel-04', kind: 'draw_vessel', file: 'library/vessel/vessel-04.webp', width: 768, height: 768, style_name: 'Neon Street-Tech Dispenser' },
  { id: 'vessel-07', kind: 'draw_vessel', file: 'library/vessel/vessel-07.webp', width: 768, height: 768, style_name: 'Dark Fantasy ARPG Relic' },
  { id: 'vessel-09', kind: 'draw_vessel', file: 'library/vessel/vessel-09.webp', width: 768, height: 768, style_name: 'Cozy Harvest Craft' },
  { id: 'vessel-12', kind: 'draw_vessel', file: 'library/vessel/vessel-12.webp', width: 768, height: 768, style_name: '90s Arcade Capsule Machine' },
  { id: 'vessel-13', kind: 'draw_vessel', file: 'library/vessel/vessel-13.webp', width: 768, height: 768, style_name: 'Art Deco VIP' },
  { id: 'vessel-17', kind: 'draw_vessel', file: 'library/vessel/vessel-17.webp', width: 768, height: 768, style_name: 'Dragonforged Dark Fantasy' },
  { id: 'vessel-19', kind: 'draw_vessel', file: 'library/vessel/vessel-19.webp', width: 768, height: 768, style_name: 'Motorsport Carbon Telemetry' },
  { id: 'vessel-20', kind: 'draw_vessel', file: 'library/vessel/vessel-20.webp', width: 768, height: 768, style_name: 'Hallowed Night Gothic' },
];

export const presetUrl = (preset: Pick<LibraryPreset, 'file'>): string => `/art/${preset.file}`;
export const presetsFor = (kind: ArtAssetKind): readonly LibraryPreset[] => library_presets.filter(item => item.kind === kind);
/** Library picks travel as design ids `library-<id>` until the core imports them (beacons.library.import). */
export const library_prefix = 'library-';
export function libraryPreset(design_id: string | undefined): LibraryPreset | undefined {
  return design_id?.startsWith(library_prefix) ? library_presets.find(item => item.id === design_id.slice(library_prefix.length)) : undefined;
}
