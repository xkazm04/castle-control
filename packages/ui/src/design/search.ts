import type { LibraryAsset, LibraryCatalog, LibraryKind } from './library.js';
import { pickTheme, translate, words } from './vocabulary.js';

export type LibraryMatch = { asset: LibraryAsset; score: number };

/** How well one asset answers a request: its original request, its style name, its tags and its theme. */
export function scoreAsset(asset: LibraryAsset, request: string): number {
  const said = request.trim().toLowerCase();
  if (!said) return asset.preset ? 1 : 0;
  const translated = translate(said).text;
  const asked = new Set([...words(said), ...words(translated)]);
  const original = new Set(words(asset.request));
  const style = new Set(words(asset.style_name));
  const tags = new Set(asset.tags.map(tag => tag.toLowerCase()));
  let score = 0;
  if (asset.request.toLowerCase() === said || asset.style_name.toLowerCase() === said) score += 12;
  for (const word of asked) {
    if (original.has(word)) score += 3;
    if (style.has(word)) score += 3;
    if (tags.has(word)) score += 2;
  }
  // Same mood family (fire, ice, neon...) counts even when no word is shared.
  const theme = pickTheme(translated);
  if (theme.id !== 'house' && pickTheme(`${asset.request} ${asset.style_name} ${asset.tags.join(' ')}`).id === theme.id) score += 4;
  return score + (asset.preset ? 0.5 : 0);
}

/**
 * Top suggestions of one kind for a request. Matches lead; when fewer than `limit` match,
 * the kind's presets fill the rest so the streamer always sees ready-made options.
 */
export function searchLibrary(catalog: LibraryCatalog, kind: LibraryKind, request: string, limit = 3): LibraryMatch[] {
  const pool = catalog.assets.filter(asset => asset.kind === kind);
  const ranked = pool.map(asset => ({ asset, score: scoreAsset(asset, request) }))
    .sort((a, b) => b.score - a.score || a.asset.id.localeCompare(b.asset.id));
  const matched = ranked.filter(item => item.score >= 2);
  const fill = ranked.filter(item => item.score < 2 && item.asset.preset);
  return [...matched, ...fill].slice(0, limit);
}

/** The single closest asset: what the SIMULATED generation shows in fixture mode. */
export function closestAsset(catalog: LibraryCatalog, kind: LibraryKind, request: string, skip: readonly string[] = []): LibraryAsset | undefined {
  const ranked = searchLibrary(catalog, kind, request, catalog.assets.length);
  return (ranked.find(item => !skip.includes(item.asset.id)) ?? ranked[0])?.asset;
}
