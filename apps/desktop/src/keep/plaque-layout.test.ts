import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { tokens } from '@castle-control/tokens';
import { appOverviewFrame, appOverviewTarget, frameTransform, keepRooms } from '@castle-control/keep-art';
import type { RoomId, Rect } from '@castle-control/keep-art';

const css = readFileSync(new URL('./keep.css', import.meta.url), 'utf8');
const camera = frameTransform(appOverviewFrame, appOverviewTarget, 'contain');

function cappedWidth() {
  const query = /@container keep-surface \(width < ([\d.]+)rem\)\s*\{\s*\.keep-plaque\s*\{\s*max-width: calc\(var\(--(space-[\w-]+)\) \* (\d+)\);/.exec(css);
  if (!query?.[1] || !query[2] || !query[3]) throw new Error('Missing small-host plaque cap');
  const layout: Readonly<Record<string, string>> = tokens.layout;
  const unit = layout[query[2]];
  if (!unit?.endsWith('px')) throw new Error('Missing plaque width token');
  return { breakpoint: Number(query[1]) * 16, width: Number.parseFloat(unit) * Number(query[3]) };
}

function plaqueBox(id: RoomId, width: number, scale: number): Rect {
  const room = keepRooms[id];
  if (!room.plaque) throw new Error('Missing plaque anchor');
  // Use the full room height as the box envelope, rather than a short fixture line.
  return {
    x: (camera.ox + room.plaque.x * camera.s) * scale,
    y: (camera.oy + room.plaque.y * camera.s) * scale,
    w: width * camera.s * scale, h: room.rect.h * camera.s * scale,
  };
}

function intersects(first: Rect, second: Rect) {
  return first.x < second.x + second.w && second.x < first.x + first.w
    && first.y < second.y + second.h && second.y < first.y + first.h;
}

test('the cap applies only below the winner host width, including both smaller windows', () => {
  const { breakpoint, width } = cappedWidth();
  expect(breakpoint).toBe(1060);
  expect(width).toBe(280);
  // The existing Program column occupies 380 units of the desktop window.
  expect(1440 - 380 < breakpoint).toBe(false);
  for (const window_width of [1280, 1180]) expect(window_width - 380 < breakpoint).toBe(true);
  const base = /(?:^|\n)\.keep-plaque\s*\{([^}]+)\}/.exec(css)?.[1];
  expect(base).toBeTruthy();
  expect(base).not.toContain('max-width');
});

test.each([0.85, 800 / 1060])('capped plaque boxes from shared anchors do not intersect at scale %s', scale => {
  const { width } = cappedWidth();
  const ids = ['studio', 'visuals', 'lottery', 'moderator'] as const;
  for (const [index, first] of ids.entries()) {
    for (const second of ids.slice(index + 1)) {
      expect(intersects(plaqueBox(first, width, scale), plaqueBox(second, width, scale)), `${first} / ${second}`).toBe(false);
    }
  }
});


function layoutRule(selector: string) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const body = new RegExp(`(?:^|\\n)${escaped} \\{([^}]+)\\}`).exec(css)?.[1];
  if (!body) throw new Error(`Missing Keep layout rule: ${selector}`);
  return body;
}

test('the desktop moat keeps both flex rows unwrapped and gives the strip the shrinking track', () => {
  expect(layoutRule('.keep-moat')).toContain('flex-wrap: nowrap');
  const heartbeat = layoutRule('.keep-moat .moat-heartbeat');
  const strip = layoutRule('.keep-moat .moat-heartbeat-strip');
  for (const rule of [heartbeat, strip]) {
    expect(rule).toContain('min-width: 0');
    expect(rule).toContain('flex: 1 1 0');
  }
  expect(heartbeat).toContain('flex-wrap: nowrap');
  expect(layoutRule('.keep-moatlab, .keep-moat-link, .keep-moat .moat-heartbeat .cc-button')).toContain('flex: none');
  expect(css).toContain('@media (width < 80rem)');
});

test('Keep heading cells separate the eyebrow and wrapping illustration caption', () => {
  const heading = layoutRule('.keep-khead');
  expect(heading).toContain('display: grid');
  expect(heading).toContain('grid-template-areas: "eyebrow illustration" "name name" "sub sub"');
  expect(layoutRule('.keep-khead .eyebrow')).toContain('grid-area: eyebrow');
  const caption = layoutRule('.keep-vlab');
  expect(caption).toContain('grid-area: illustration');
  expect(caption).toContain('max-width: none');
  expect(css).toMatch(/@media \(width < 90rem\)\s*\{\s*\.keep-vlab \{ max-width: 100%; \}/);
  expect(caption).toContain('overflow-wrap: anywhere');
  expect(caption).not.toContain('position: absolute');
  const wide = css.split('@media (width >= 90rem)')[1];
  expect(wide).toContain('grid-template-columns: fit-content(68%) minmax(0, 1fr)');
  expect(wide).toContain('grid-template-areas: "eyebrow illustration" "name ." "sub ."');
});
