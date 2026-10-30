import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { tokens } from '@castle-control/tokens';
import { createBeaconsPreview } from '../../beacons-model.js';
import { BeaconArtwork } from './artwork.jsx';

type Point = readonly [number, number];
type Bounds = { left: number; top: number; right: number; bottom: number };
const style = readFileSync(new URL('./room.css', import.meta.url), 'utf8');
const coreStyle = readFileSync(new URL('./core.css', import.meta.url), 'utf8');

function bounds(points: readonly Point[]): Bounds {
  return { left: Math.min(...points.map(p => p[0])), top: Math.min(...points.map(p => p[1])),
    right: Math.max(...points.map(p => p[0])), bottom: Math.max(...points.map(p => p[1])) };
}

function cubicValue(a: number, b: number, c: number, d: number, t: number) {
  return (1 - t) ** 3 * a + 3 * (1 - t) ** 2 * t * b + 3 * (1 - t) * t ** 2 * c + t ** 3 * d;
}

/** Exact cubic extrema, rather than the (larger) control-point hull. */
function cubicPoints(start: Point, first: Point, second: Point, end: Point): Point[] {
  const times = [0, 1];
  for (const axis of [0, 1] as const) {
    const a = -start[axis] + 3 * first[axis] - 3 * second[axis] + end[axis];
    const b = 2 * (start[axis] - 2 * first[axis] + second[axis]);
    const c = first[axis] - start[axis];
    if (a === 0) {
      if (b !== 0) times.push(-c / b);
    } else {
      const discriminant = b * b - 4 * a * c;
      if (discriminant >= 0) times.push((-b + Math.sqrt(discriminant)) / (2 * a),
        (-b - Math.sqrt(discriminant)) / (2 * a));
    }
  }
  return times.filter(t => t >= 0 && t <= 1).map(t => [
    cubicValue(start[0], first[0], second[0], end[0], t),
    cubicValue(start[1], first[1], second[1], end[1], t),
  ]);
}

/** Resolves every command used by this artwork, including implicit repeats and
 * relative moves after close. Unsupported commands fail instead of being ignored. */
function pathBounds(path: string): Bounds {
  const parts = path.match(/[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+)(?:e[-+]?\d+)?/g) ?? [];
  let index = 0; let command = ''; let current: Point = [0, 0]; let start: Point = current;
  const points: Point[] = [];
  const number = () => {
    const value = Number(parts[index++]);
    if (!Number.isFinite(value)) throw new Error('Missing SVG coordinate');
    return value;
  };
  while (index < parts.length) {
    if (/^[a-zA-Z]$/.test(parts[index] ?? '')) command = parts[index++] ?? '';
    const relative = command === command.toLowerCase();
    const point = (): Point => [number() + (relative ? current[0] : 0),
      number() + (relative ? current[1] : 0)];
    switch (command.toLowerCase()) {
      case 'm': current = point(); start = current; points.push(current); command = relative ? 'l' : 'L'; break;
      case 'l': current = point(); points.push(current); break;
      case 'h': current = [number() + (relative ? current[0] : 0), current[1]]; points.push(current); break;
      case 'v': current = [current[0], number() + (relative ? current[1] : 0)]; points.push(current); break;
      case 'c': {
        const first = point(); const second = point(); const end = point();
        points.push(...cubicPoints(current, first, second, end)); current = end; break;
      }
      case 'z': current = start; points.push(current); command = ''; break;
      default: throw new Error(`Unsupported SVG command: ${command}`);
    }
  }
  return bounds(points);
}

function attribute(element: string, name: string): string {
  const value = element.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1];
  if (value === undefined) throw new Error(`Missing ${name}: ${element}`);
  return value;
}

function drawnBounds(markup: string): Bounds {
  const points: Point[] = [];
  const shapes = [...markup.matchAll(/<(path|rect|circle)\b[^>]*>/g)];
  expect(shapes.length).toBeGreaterThan(0);
  for (const [element, tag] of shapes) {
    const num = (name: string) => Number(attribute(element, name));
    let box: Bounds;
    if (tag === 'path') box = pathBounds(attribute(element, 'd'));
    else if (tag === 'rect') box = { left: num('x'), top: num('y'),
      right: num('x') + num('width'), bottom: num('y') + num('height') };
    else if (tag === 'circle') box = { left: num('cx') - num('r'), top: num('cy') - num('r'),
      right: num('cx') + num('r'), bottom: num('cy') + num('r') };
    else throw new Error(`Unsupported shape: ${tag}`);
    // The only stroked shape is the glow: include its actual token stroke width.
    const stroke = attribute(element, 'class') === 'visuals-room-glow'
      ? Number.parseFloat(tokens.layout['space-8']) / 2 : 0;
    points.push([box.left - stroke, box.top - stroke], [box.right + stroke, box.bottom + stroke]);
  }
  return bounds(points);
}

const preview = createBeaconsPreview().getSnapshot();
const cases = [...preview.visuals, ...preview.visuals.slice(0, 1).map(item => ({ ...item,
  visual: { ...item.visual, design_id: 'other-border' as NonNullable<typeof item.visual.design_id> } })),
  ...preview.visuals.slice(0, 1).map(item => {
    const visual = { ...item.visual }; delete visual.design_id;
    return { ...item, visual };
  })];

test('geometry resolves relative subpaths and cubic extrema, not control-point bounds', () => {
  expect(pathBounds('m48 190 20-60 15 32 17-85 22 113zm190 0 20-75 13 42 23-36 20 69Z'))
    .toEqual({ left: 48, top: 77, right: 314, bottom: 190 });
  expect(pathBounds('M125 183c0-70 110-70 110 0Z'))
    .toEqual({ left: 125, top: 130.5, right: 235, bottom: 183 });
});

for (const item of cases) {
  test(`hero ${item.visual.design_id ?? 'unassigned'} fits all painted bounds with 4–8 units of margin`, () => {
    const expected = item.visual.design_id === 'altar'
      ? { left: 90, top: 31, right: 270, bottom: 237 }
      : { left: 20, top: 30, right: 340, bottom: 210 };
    for (const intensity of [0, item.intensity, 1]) {
      const html = renderToStaticMarkup(<BeaconArtwork item={{ ...item, intensity }} hero />);
      const measured = drawnBounds(html);
      expect(measured).toEqual(expected);
      const [x = NaN, y = NaN, width = NaN, height = NaN] = attribute(html, 'viewBox').split(' ').map(Number);
      for (const margin of [measured.left - x, measured.top - y,
        x + width - measured.right, y + height - measured.bottom]) {
        expect(margin).toBeGreaterThanOrEqual(4);
        expect(margin).toBeLessThanOrEqual(8);
      }
      const ratio = attribute(html, 'style').match(/--room-art-aspect:([\d.]+)\s*\/\s*([\d.]+)/);
      expect(ratio).not.toBeNull();
      expect(Number(ratio?.[1]) / Number(ratio?.[2])).toBeCloseTo(width / height, 10);
      // C bottom-aligns each hero inside its 112px plate; crop bounds remain identical.
      expect(html).toContain('preserveAspectRatio="xMidYMax meet"');
      expect(html).toContain('role="img"');
      expect(attribute(html, 'aria-label')).toBe(`${item.visual.name} · simulated local preview`);
    }
    const thumbnail = renderToStaticMarkup(<BeaconArtwork item={item} />);
    expect(attribute(thumbnail, 'viewBox')).toBe('0 0 360 240');
    expect(thumbnail).not.toContain('--room-art-aspect');
    expect(thumbnail).not.toContain('preserveAspectRatio');
  });
}

test('hero flame retains the blaze transform at partial intensity', () => {
  const altar = preview.visuals.find(item => item.visual.design_id === 'altar');
  if (!altar) throw new Error('Missing simulated altar');
  const html = renderToStaticMarkup(<BeaconArtwork item={{ ...altar, intensity: 0.39 }} hero />);
  expect(attribute(html, 'class')).toContain('visuals-room-art-hero');
  expect(attribute(html, 'style')).toMatch(/--room-blaze:0\.39(?:;|$)/);
  expect(html).toMatch(/<path\b[^>]*class="visuals-room-fire"/);
  expect(style).not.toMatch(/\.visuals-room-art-hero[^{}]*\.visuals-room-fire\s*\{[^}]*\btransform:\s*none\b/);
  const fireRule = style.match(/(?:^|\})\s*\.visuals-room-fire\s*\{([^}]+)\}/)?.[1];
  expect(fireRule).toMatch(/transform-origin:\s*bottom;/);
  expect(fireRule).toMatch(/\btransform:\s*scaleY\(calc\(\.3\s*\+\s*var\(--room-blaze\)\s*\*\s*\.7\)\)/);
});

// C replaces the former standalone aspect-sized hero with three fixed-height plate viewports.
test('C hero fits the token-sized plate without cropping any painted geometry', () => {
  expect(style).toMatch(/\.visuals-plate-art\s*\{[^}]*height: calc\(var\(--space-56\) \* 2\)/);
  const heroRule = style.match(/\.visuals-room-art-hero svg\s*\{([^}]+)\}/)?.[1];
  expect(heroRule).toContain('width: 100%');
  expect(heroRule).toContain('height: 100%');
  expect(heroRule).toContain('max-width: 100%');
  expect(heroRule).toContain('max-height: 100%');
  expect(style).not.toMatch(/object-fit:\s*cover|overflow:\s*clip/);
});

test('hero keeps its viewBox fit and non-flame shapes remain untransformed', () => {
  // Only the flame scales, within its full-intensity painted bounds. The other
  // shapes keep those bounds at every intensity.
  for (const name of ['stone', 'fire-core', 'glow', 'cutout']) {
    const rule = style.match(new RegExp(`\\.visuals-room-${name}\\s*\\{([^}]+)\\}`))?.[1];
    expect(rule).toBeDefined();
    expect(rule).not.toMatch(/\b(?:transform|scale|translate)\s*:/);
  }
  expect(coreStyle).not.toMatch(/\b(?:transform|scale|translate)\s*:/);
});
