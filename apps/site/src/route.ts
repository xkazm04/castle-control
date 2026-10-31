// The landing's single URL boundary. Product room names never enter site URLs.
export const chamberIds = ['lots', 'gate', 'beacons', 'map'] as const;
export const roomIds = [...chamberIds, 'steward'] as const;
export type ChamberId = typeof chamberIds[number];
export type SiteRoom = typeof roomIds[number];
export type Route = Readonly<{ room: SiteRoom | null; features: boolean }>;
export type Review = Readonly<{ hover?: SiteRoom; seed?: string }>;
export const artRoom = {
  lots: 'lottery', gate: 'moderator', beacons: 'visuals', map: 'studio', steward: 'steward',
} as const;

export function isRoom(value: string | null | undefined): value is SiteRoom {
  return roomIds.some((room) => room === value);
}

export function parse(hash: string): Route {
  const match = /^#([^/]+)(\/features)?$/.exec(hash);
  const room = match?.[1];
  const features = Boolean(match?.[2]);
  return isRoom(room) && (room !== 'steward' || !features)
    ? { room, features } : { room: null, features: false };
}

export function parseReview(search: string): Review {
  const params = new URLSearchParams(search);
  const hover = params.get('hover');
  const seed = params.get('seed');
  return {
    ...(isRoom(hover) ? { hover } : {}),
    ...(seed !== null && /^\w{1,40}$/.test(seed) ? { seed } : {}),
  };
}

export function encode(route: Route): string {
  return route.room === null ? '#' : `#${route.room}${route.features && route.room !== 'steward' ? '/features' : ''}`;
}

export function writeRoute(route: Route, location: Pick<Location, 'hash'>): void {
  location.hash = encode(route);
}
