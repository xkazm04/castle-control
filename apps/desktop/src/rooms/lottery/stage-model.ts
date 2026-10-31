import { buildDrawScene } from '@castle-control/renderer';
import type { DrawContent, LotsCastLabel, LotsHandle } from '@castle-control/contract';
import type { DrawArtworkLayer, DrawOutcome, DrawScene, DrawShape } from '@castle-control/renderer';

/** UI-local stage data. Never sent over RPC; outcome input is a verified cast only. */
export type StageEntry = { readonly handle: LotsHandle; readonly weight: number; readonly cohort?: 'subscriber' | 'new_account' | 'raider' };
export type StageMark = { readonly handle: LotsHandle; readonly x: number; readonly y: number; readonly r: number;
  readonly cohort?: StageEntry['cohort']; readonly angle?: number };
export type StageCast = { readonly winners: readonly LotsHandle[]; readonly label: LotsCastLabel };

export const draw_shapes: readonly DrawShape[] = ['urn', 'wheel', 'deck', 'ballot_box'];
export const stage_mark_limit = 240;
/** Same logical coordinate space as the renderer's artwork layer (viewBox 0 0 320 240). */
export const stage_view_box = '0 0 320 240';

export function isDrawShape(value: string): value is DrawShape {
  return draw_shapes.some(shape => shape === value);
}

/** The renderer's scene for a verified cast, or an idle scene (no events) before one exists. */
export function stageScene(shape: DrawShape, cast: StageCast | undefined, content: DrawContent, reduced_motion: boolean): DrawScene {
  const outcome: DrawOutcome = cast ? { winners: [...cast.winners], label: cast.label } : { winners: [], label: 'streamer-controlled' };
  // Prize scenes carry the canonical Twitch disclaimer layer; the guardrails require it before any cast.
  return buildDrawScene(shape, outcome, { content, disclaimer: content === 'prize', reduced_motion });
}

export function artworkOf(scene: DrawScene): DrawArtworkLayer | undefined {
  return scene.layers.find((layer): layer is DrawArtworkLayer => layer.kind === 'artwork');
}

/** Evenly sampled marks; every winner is always drawn so its reveal has a place on stage. */
export function sampleEntries(entries: readonly StageEntry[], winners: readonly LotsHandle[], limit = stage_mark_limit): readonly StageEntry[] {
  if (entries.length <= limit) return entries;
  const keep = new Set(winners);
  const step = entries.length / Math.max(1, limit - keep.size);
  return entries.filter((entry, index) => keep.has(entry.handle) || Math.floor(index / step) !== Math.floor((index - 1) / step));
}

const golden = Math.PI * (3 - Math.sqrt(5));

/** Per-shape positions in artwork space. Dot area follows weight, so concave odds are visible. */
export function layoutMarks(shape: DrawShape, entries: readonly StageEntry[]): readonly StageMark[] {
  const count = entries.length;
  if (!count) return [];
  const heaviest = Math.max(1, ...entries.map(entry => entry.weight));
  const base = Math.max(1.1, Math.min(4.2, 46 / Math.sqrt(count)));
  const radius = (weight: number) => Math.round(base * (0.6 + 0.4 * Math.sqrt(weight / heaviest)) * 100) / 100;
  const at = (entry: StageEntry, x: number, y: number, angle?: number): StageMark => ({
    handle: entry.handle, x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100, r: radius(entry.weight),
    ...(entry.cohort ? { cohort: entry.cohort } : {}), ...(angle === undefined ? {} : { angle }),
  });
  if (shape === 'wheel') {
    return entries.map((entry, index) => {
      const angle = (index / count) * Math.PI * 2 - Math.PI / 2;
      return at(entry, 160 + 104 * Math.cos(angle), 116 + 104 * Math.sin(angle), Math.round(angle * 1800 / Math.PI) / 10);
    });
  }
  if (shape === 'urn') {
    return entries.map((entry, index) => {
      const spread = Math.sqrt((index + 0.5) / count);
      return at(entry, 160 + 58 * spread * Math.cos(index * golden), 142 + 40 * spread * Math.sin(index * golden));
    });
  }
  // Deck pips on the top card face; ballot slips stacked inside the box.
  const area = shape === 'deck' ? { x: 118, y: 44, w: 88, h: 102 } : { x: 82, y: 112, w: 164, h: 88 };
  const columns = Math.max(1, Math.round(Math.sqrt(count * area.w / area.h)));
  const rows = Math.ceil(count / columns);
  return entries.map((entry, index) => {
    const column = index % columns; const row = Math.floor(index / columns);
    return at(entry, area.x + (column + 0.5) * area.w / columns, area.y + (row + 0.5) * area.h / rows);
  });
}
