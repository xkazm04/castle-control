export type RoomId = 'lottery' | 'moderator' | 'visuals' | 'studio' | 'herald' | 'steward';
export type Point = Readonly<{ x: number; y: number }>;
export type Rect = Readonly<{ x: number; y: number; w: number; h: number }>;
export type RoomGeometry = Readonly<{
  rect: Rect;
  frame: Rect;
  hit: Rect;
  plaque?: Point;
  appFrame?: Rect;
  ink: 'gules' | 'azure' | 'or' | 'key';
}>;

// Geometry from .port/winner/keep-art.js ROOMS, index.html HITS and app.html PL/cam.
// Property order also preserves the winner's room-light and overlay drawing order.
export const keepRooms: Readonly<Record<RoomId, RoomGeometry>> = {
  studio: {
    rect: { x: 422, y: 92, w: 356, h: 200 },
    frame: { x: 410, y: 60, w: 380, h: 240 },
    hit: { x: 422, y: 92, w: 356, h: 200 },
    plaque: { x: 436, y: 104 }, ink: 'key',
  },
  lottery: {
    rect: { x: 422, y: 312, w: 356, h: 228 },
    frame: { x: 410, y: 300, w: 380, h: 252 },
    hit: { x: 422, y: 312, w: 356, h: 228 },
    plaque: { x: 436, y: 320 }, ink: 'gules',
  },
  moderator: {
    rect: { x: 116, y: 360, w: 242, h: 180 },
    frame: { x: 20, y: 346, w: 350, h: 226 },
    hit: { x: 78, y: 360, w: 280, h: 180 },
    plaque: { x: 124, y: 368 },
    appFrame: { x: 60, y: 346, w: 310, h: 200 }, ink: 'azure',
  },
  visuals: {
    rect: { x: 842, y: 160, w: 256, h: 180 },
    frame: { x: 836, y: 4, w: 268, h: 346 },
    hit: { x: 842, y: 20, w: 256, h: 320 },
    plaque: { x: 852, y: 168 },
    appFrame: { x: 836, y: 140, w: 268, h: 210 }, ink: 'or',
  },
  herald: {
    rect: { x: 102, y: 180, w: 256, h: 160 },
    frame: { x: 96, y: 170, w: 268, h: 180 },
    hit: { x: 102, y: 180, w: 256, h: 160 }, ink: 'key',
  },
  steward: {
    rect: { x: 842, y: 360, w: 256, h: 180 },
    frame: { x: 836, y: 350, w: 268, h: 200 },
    hit: { x: 842, y: 360, w: 256, h: 180 }, ink: 'key',
  },
};

export const keepViewBox = [0, 0, 1200, 640] as const;
// Site overview: castle-space frame into its 1440 x 900 stage target (contain).
export const siteOverviewFrame: Rect = { x: 0, y: -30, w: 1200, h: 670 };
export const siteOverviewTarget: Rect = { x: 160, y: 262, w: 1120, h: 600 };
// Site room camera target (contain).
export const siteRoomTarget: Rect = { x: 30, y: 66, w: 874, h: 596 };
// Desktop app overview: castle-space frame into its stage target (contain).
export const appOverviewFrame: Rect = { x: 0, y: -40, w: 1200, h: 680 };
export const appOverviewTarget: Rect = { x: 10, y: 96, w: 1040, h: 600 };
// Desktop app room target (cover); use appFrame when the room supplies one.
export const appRoomTarget: Rect = { x: 0, y: 0, w: 1060, h: 250 };

export function frameTransform(
  rect: Rect, target: Rect, mode: 'contain' | 'cover',
): { s: number; ox: number; oy: number } {
  // Cover deliberately follows app.html's width-only rule, including its 2.3 cap.
  const s = mode === 'cover'
    ? Math.min(target.w / rect.w * 0.92, 2.3)
    : Math.min(target.w / rect.w, target.h / rect.h);
  return {
    s,
    ox: target.x + (target.w - rect.w * s) / 2 - rect.x * s,
    oy: target.y + (target.h - rect.h * s) / 2 - rect.y * s,
  };
}
