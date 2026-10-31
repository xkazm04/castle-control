/** Page identity only. Display values are interpreted by parseOverlayDisplay. */
export type OverlayPage = { kind: 'spike' }
  | { kind: 'vote_bar' }
  | { kind: 'beacons'; visual: string; package_hash?: string }
  | { kind: 'lots'; draw: string };

export function parseOverlayPath(pathname: string, search = ''): OverlayPage | undefined {
  if (pathname === '/') return search === '' ? { kind: 'spike' } : undefined;
  if (pathname === '/gatehouse/current') {
    return search === '' || search.startsWith('?') && search.slice(1).split('&')
      .every(part => ['scale', 'anchor'].includes(part.split('=')[0] ?? '')) ? { kind: 'vote_bar' } : undefined;
  }
  const match = /^\/(beacons|lots)\/([a-z0-9]+(?:-[a-z0-9]+)*)$(?![\s\S])/.exec(pathname);
  if (!match?.[2]) return undefined;
  let package_hash: string | undefined;
  if (search !== '') {
    if (!search.startsWith('?')) return undefined;
    for (const part of search.slice(1).split('&')) {
      const key = part.split('=')[0];
      if (key === 'scale' || key === 'anchor') continue;
      if (match[1] !== 'beacons' || package_hash !== undefined || !/^package_hash=[a-f0-9]{64}$(?![\s\S])/.test(part)) return undefined;
      package_hash = part.slice('package_hash='.length);
    }
  }
  if (match[1] === 'lots') return { kind: 'lots', draw: match[2] };
  return package_hash === undefined ? { kind: 'beacons', visual: match[2] }
    : { kind: 'beacons', visual: match[2], package_hash };
}
