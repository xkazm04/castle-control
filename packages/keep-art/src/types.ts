import type { RoomId } from './geometry.js';

export type ArtTag =
  | 'svg' | 'g' | 'defs' | 'pattern' | 'radialGradient' | 'stop' | 'clipPath'
  | 'rect' | 'circle' | 'ellipse' | 'path' | 'polygon' | 'text';

// The complete D10 vocabulary; role names omit the CSS custom-property prefix.
export type ArtPaint =
  | 'art-key' | 'art-gules' | 'art-azure' | 'art-or' | 'art-paper' | 'art-stone'
  | 'art-azure-text' | 'art-gules-text' | 'art-night'
  | 'art-room-1' | 'art-room-2' | 'art-room-3' | 'art-floor' | 'art-wood'
  | 'art-void' | 'art-sheet' | 'art-table' | 'art-sun-1' | 'art-sun-2' | 'art-hatch'
  | `url(#${string})` | 'none';

export type ArtNode = {
  tag: ArtTag;
  attrs: Readonly<Record<string, string>>;
  paint?: { fill?: ArtPaint; stroke?: ArtPaint; stop?: ArtPaint };
  cls?: readonly string[];
  id?: string;
  room?: RoomId;
  children?: readonly ArtNode[];
  text?: string;
};
