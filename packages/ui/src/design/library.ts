import type { ArtAnchors, ArtAssetKind, ArtPoint, ArtRect } from '@castle-control/contract';
import { parseJson } from '@castle-control/contract/door';

/**
 * The built-in art library (apps/desktop/public/art/library/library.json): ready-made
 * stream assets with presets and measured anchors. The file crosses into the app here
 * and only here; parseLibrary is the one place its shape is checked.
 */
export type LibraryKind = ArtAssetKind | 'map';
export type LibraryAsset = {
  id: string; kind: LibraryKind; file: string; width: number; height: number;
  style_name: string; palette: readonly string[]; request: string; tags: readonly string[];
  preset: boolean; source?: string; anchors?: ArtAnchors;
  effect?: string; effect_blend?: 'screen' | 'behind'; token?: string;
};
export type LibraryCatalog = { version: 1; simulated_note: string; assets: readonly LibraryAsset[] };

export const library_url = '/art/library/library.json';
const kinds: readonly LibraryKind[] = ['beacon', 'frame', 'vote_bar', 'draw_vessel', 'map'];
const asset_keys = new Set(['id', 'kind', 'file', 'width', 'height', 'style_name', 'palette', 'request', 'tags', 'preset',
  'source', 'anchors', 'effect', 'effect_blend', 'token']);
const anchor_keys = new Set(['core_rect', 'window_rect', 'track_rect', 'chamber_rect', 'track_radius', 'mouth', 'segments']);
const hex = /^#[0-9a-fA-F]{6}$/;
const file = /^library\/[a-z]+\/[a-z0-9-]+\.webp$/;

type Bag = Record<string, unknown>;
function bag(value: unknown, where: string): Bag {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error(`${where} is not an object`);
  return Object.fromEntries(Object.entries(value));
}
function text(value: unknown, where: string, max = 500): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new Error(`${where} is not a short text`);
  return value;
}
function unit(value: unknown, where: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) throw new Error(`${where} is not 0..1`);
  return value;
}
function texts(value: unknown, where: string, test: (item: string) => boolean = () => true): string[] {
  if (!Array.isArray(value)) throw new Error(`${where} is not a list`);
  return value.map((item, index) => { const read = text(item, `${where}[${index}]`, 80); if (!test(read)) throw new Error(`${where}[${index}] is invalid`); return read; });
}
function rect(value: unknown, where: string): ArtRect {
  const raw = bag(value, where);
  return { x: unit(raw.x, `${where}.x`), y: unit(raw.y, `${where}.y`), w: unit(raw.w, `${where}.w`), h: unit(raw.h, `${where}.h`) };
}
function point(value: unknown, where: string): ArtPoint {
  const raw = bag(value, where);
  return { x: unit(raw.x, `${where}.x`), y: unit(raw.y, `${where}.y`) };
}
function anchors(value: unknown, where: string): ArtAnchors {
  const raw = bag(value, where);
  for (const key of Object.keys(raw)) if (!anchor_keys.has(key)) throw new Error(`${where}.${key} is unknown`);
  const out: ArtAnchors = {};
  for (const key of ['core_rect', 'window_rect', 'track_rect', 'chamber_rect'] as const)
    if (raw[key] !== undefined) out[key] = rect(raw[key], `${where}.${key}`);
  if (raw.track_radius !== undefined) out.track_radius = unit(raw.track_radius, `${where}.track_radius`);
  if (raw.mouth !== undefined) out.mouth = point(raw.mouth, `${where}.mouth`);
  if (raw.segments !== undefined) {
    const segments = texts(raw.segments, `${where}.segments`, item => hex.test(item));
    if (segments.length !== 3) throw new Error(`${where}.segments needs three colours`);
    out.segments = segments;
  }
  return out;
}
function dimension(value: unknown, where: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 16 || value > 4096) throw new Error(`${where} is not a pixel size`);
  return value;
}

function asset(value: unknown, index: number): LibraryAsset {
  const where = `assets[${index}]`;
  const raw = bag(value, where);
  for (const key of Object.keys(raw)) if (!asset_keys.has(key)) throw new Error(`${where}.${key} is unknown`);
  const id = text(raw.id, `${where}.id`, 64);
  if (!/^[a-z0-9-]{1,64}$/.test(id)) throw new Error(`${where}.id is not a library id`);
  const kind = kinds.find(item => item === raw.kind);
  if (!kind) throw new Error(`${where}.kind is unknown`);
  const path = (key: string) => { const read = text(raw[key], `${where}.${key}`, 120); if (!file.test(read)) throw new Error(`${where}.${key} is not a library file`); return read; };
  if (typeof raw.preset !== 'boolean') throw new Error(`${where}.preset is not a boolean`);
  const blend = raw.effect_blend;
  if (blend !== undefined && blend !== 'screen' && blend !== 'behind') throw new Error(`${where}.effect_blend is unknown`);
  return {
    id, kind, file: path('file'), width: dimension(raw.width, `${where}.width`), height: dimension(raw.height, `${where}.height`),
    style_name: text(raw.style_name, `${where}.style_name`, 80), palette: texts(raw.palette, `${where}.palette`, item => hex.test(item)).slice(0, 6),
    request: text(raw.request, `${where}.request`), tags: texts(raw.tags, `${where}.tags`), preset: raw.preset,
    ...(raw.source === undefined ? {} : { source: text(raw.source, `${where}.source`, 64) }),
    ...(raw.anchors === undefined ? {} : { anchors: anchors(raw.anchors, `${where}.anchors`) }),
    ...(raw.effect === undefined ? {} : { effect: path('effect') }),
    ...(blend === undefined ? {} : { effect_blend: blend }),
    ...(raw.token === undefined ? {} : { token: path('token') }),
  };
}

/** The one parser of library.json. Throws a plain message naming the first bad field. */
export function parseLibrary(value: unknown): LibraryCatalog {
  const raw = bag(value, 'library');
  if (raw.version !== 1) throw new Error('library version is unknown');
  if (!Array.isArray(raw.assets) || !raw.assets.length) throw new Error('library has no assets');
  const assets = raw.assets.map(asset);
  const ids = new Set(assets.map(item => item.id));
  if (ids.size !== assets.length) throw new Error('library ids repeat');
  return { version: 1, simulated_note: text(raw.simulated_note, 'library.simulated_note'), assets };
}

/** Same-origin URL of a library file ("library/beacon/beacon-03.webp" -> "/art/library/beacon/beacon-03.webp"). */
export function libraryUrl(path: string): string { return `/art/${path}`; }

export type Fetcher = (url: string) => Promise<{ ok: boolean; text(): Promise<string> }>;
let loaded: Promise<LibraryCatalog> | undefined;
/** Read and parse the catalog once through the app's own same-origin reader (the design
 * sources never touch the network themselves); a failure is not cached, so the next call tries again. */
export function loadLibrary(fetcher: Fetcher): Promise<LibraryCatalog> {
  loaded ??= (async () => {
    const response = await fetcher(library_url);
    if (!response.ok) throw new Error('The art library did not load.');
    return parseLibrary(parseJson(await response.text(), { max_bytes: 512 * 1024 }));
  })().catch((error: unknown) => { loaded = undefined; throw error; });
  return loaded;
}

export function presetsOf(catalog: LibraryCatalog, kind: LibraryKind): LibraryAsset[] {
  return catalog.assets.filter(item => item.kind === kind && item.preset).slice(0, 10);
}
