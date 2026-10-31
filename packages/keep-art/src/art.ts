import { defs, overlays, sky, structure } from './art-shell.ts';
import { keepViewBox } from './geometry.ts';
import { beaconsRoom } from './room-beacons.ts';
import { gatehouseRoom } from './room-gatehouse.ts';
import { heraldRoom } from './room-herald.ts';
import { lotsRoom } from './room-lots.ts';
import { stewardRoom } from './room-steward.ts';
import { studioRoom } from './room-studio.ts';
import type { ArtNode } from './types.ts';

export function keepRoomsArt(): readonly ArtNode[] {
  return [
    ...heraldRoom(), ...gatehouseRoom(), ...lotsRoom(),
    ...studioRoom(), ...beaconsRoom(), ...stewardRoom(),
  ];
}

export function keepArt(rooms: readonly ArtNode[] = keepRoomsArt()): ArtNode {
  return {
    tag: 'svg',
    attrs: {
      viewBox: keepViewBox.join(' '),
      xmlns: 'http://www.w3.org/2000/svg',
      role: 'img',
      'aria-label': 'Stylised illustration of a castle in cross-section with four lit chambers: Map Room, Lot Chamber, Gatehouse and Beacons. Drawn, not captured.',
    },
    children: [defs(), ...sky(), ...structure(), ...rooms, ...overlays()],
  };
}
