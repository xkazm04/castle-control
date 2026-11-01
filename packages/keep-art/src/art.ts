import { defs, overlays, sky, structure } from './art-shell.js';
import { keepViewBox } from './geometry.js';
import { beaconsRoom } from './room-beacons.js';
import { gatehouseRoom } from './room-gatehouse.js';
import { heraldRoom } from './room-herald.js';
import { lotsRoom } from './room-lots.js';
import { stewardRoom } from './room-steward.js';
import { studioRoom } from './room-studio.js';
import type { ArtNode } from './types.js';

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
