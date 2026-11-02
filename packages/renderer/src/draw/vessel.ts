import { parseJson } from '@castle-control/contract/door';
import type { ArtPoint, ArtRect, VesselArt } from '@castle-control/contract';

// The contract ships no compiled LotsPlateSnapshot validator for the overlay yet, so this
// mirrors the cc-types schema exactly: deny unknown keys, Intensity 0..1, OverlayAssetUrl.
const ASSET = /^\/assets\/[a-z0-9]+(-[a-z0-9]+)*\/[0-9a-f]{64}\/[\w-][\w.-]*(\/[\w-][\w.-]*)*$/;
const record = (value: unknown, required: readonly string[], optional: readonly string[] = []): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
  && Object.keys(value).every((key) => required.includes(key) || optional.includes(key))
  && required.every((key) => key in value);
const unit = (value: unknown): boolean => typeof value === 'number' && value >= 0 && value <= 1;
const asset = (value: unknown): boolean => typeof value === 'string' && ASSET.test(value);
const rect = (value: unknown): value is ArtRect => record(value, ['x', 'y', 'w', 'h'])
  && unit(value['x']) && unit(value['y']) && unit(value['w']) && unit(value['h']);
const point = (value: unknown): value is ArtPoint => record(value, ['x', 'y']) && unit(value['x']) && unit(value['y']);
function vesselArt(value: unknown): value is VesselArt {
  return record(value, ['asset_url', 'chamber_rect', 'mouth'], ['token_url']) && asset(value['asset_url'])
    && (!('token_url' in value) || asset(value['token_url'])) && rect(value['chamber_rect']) && point(value['mouth']);
}

/** The `cc-vessel` island (a LotsPlateSnapshot); absent, empty or invalid keeps the vector plate. */
export function readVessel(doc: Document): VesselArt | undefined {
  const text = doc.getElementById('cc-vessel')?.textContent;
  if (!text) return undefined;
  try {
    const plate: unknown = parseJson(text);
    if (!record(plate, [], ['vessel']) || !vesselArt(plate['vessel'])) return undefined;
    return plate['vessel'];
  } catch {
    return undefined; // Malformed JSON: the vector artwork plate remains the display.
  }
}

const pct = (n: number): string => `${n * 100}%`;

/** One entry token: the art sprite, or a CSS orb in the plate colour when the vessel has none. */
function token(doc: Document, vessel: VesselArt, size: number): HTMLElement {
  const node = doc.createElement(vessel.token_url ? 'img' : 'b');
  node.className = 'draw-token';
  if (vessel.token_url) node.setAttribute('src', vessel.token_url);
  node.style.width = pct(size);
  return node;
}

export interface VesselPaint {
  readonly figure: HTMLElement;
  /** Flies one token from the mouth to the newly revealed winner row. */
  fly(plate: HTMLElement, row: HTMLElement): void;
}

/** Vessel image with entries idling inside chamber_rect; positions are fixed per index, not random. */
export function paintVessel(doc: Document, vessel: VesselArt, entries: number): VesselPaint {
  const figure = doc.createElement('div');
  figure.className = 'draw-vessel';
  const image = doc.createElement('img');
  image.setAttribute('alt', 'Draw vessel');
  image.setAttribute('src', vessel.asset_url);
  figure.append(image);
  const { x, y, w, h } = vessel.chamber_rect;
  const width = Math.min(w, 1 - x), height = Math.min(h, 1 - y);
  const size = Math.min(width, height) * 0.3;
  for (let index = 0; index < Math.min(entries, 9); index += 1) {
    const entry = token(doc, vessel, size);
    entry.style.left = pct(x + ((index * 0.7549 + 0.1) % 1) * Math.max(0, width - size));
    entry.style.top = pct(y + ((index * 0.5698 + 0.3) % 1) * Math.max(0, height - size));
    entry.style.animationDelay = `${-index * 0.7}s`;
    figure.append(entry);
  }
  return {
    figure,
    fly(plate, row) {
      const box = plate.getBoundingClientRect(), art = figure.getBoundingClientRect(), to = row.getBoundingClientRect();
      const node = token(doc, vessel, size);
      node.style.width = `${art.width * size}px`;
      node.classList.add('draw-fly');
      const sx = art.left - box.left + vessel.mouth.x * art.width, sy = art.top - box.top + vessel.mouth.y * art.height;
      const ex = to.left - box.left, ey = to.top - box.top + to.height / 2;
      const at = (px: number, py: number, scale: number): Keyframe => ({ transform: `translate(${px}px,${py}px) translate(-50%,-50%) scale(${scale})` });
      plate.append(node);
      node.animate([at(sx, sy, 0.6), at((sx + ex) / 2, Math.min(sy, ey) / 2, 1.2), { ...at(ex, ey, 1), opacity: 0 }],
        { duration: 900, easing: 'cubic-bezier(.3,.6,.4,1)', fill: 'forwards' }).addEventListener('finish', () => node.remove());
    },
  };
}
