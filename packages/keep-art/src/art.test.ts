import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';
import { keepArt } from './art.ts';
import { defs, overlays, sky, structure } from './art-shell.ts';
import { keepRooms } from './geometry.ts';
import { rectAttrs } from './shapes.ts';
import type { ArtNode } from './types.ts';

function walk(node: ArtNode): ArtNode[] {
  return [node, ...(node.children ?? []).flatMap(walk)];
}

test('keepArt is deterministic and isolates each returned tree', () => {
  const first = keepArt();
  const second = keepArt();
  expect(first).toEqual(second);
  expect(first).not.toBe(second);
  expect(first.children).not.toBe(second.children);
  expect(first.tag).toBe('svg');
  expect(first.attrs).toEqual({
    viewBox: '0 0 1200 640', xmlns: 'http://www.w3.org/2000/svg', role: 'img',
    'aria-label': 'Stylised illustration of a castle in cross-section with four lit chambers: Map Room, Lot Chamber, Gatehouse and Beacons. Drawn, not captured.',
  });
});

test('supplied room nodes follow structure and precede overlays', () => {
  const room: ArtNode = { tag: 'g', attrs: {}, room: 'lottery', id: 'simulated-room' };
  expect(keepArt([room]).children).toEqual([
    defs(), ...sky(), ...structure(), room, ...overlays(),
  ]);
});

test('all definition ids are unique, unchanged and resolve every URL in the complete art', () => {
  const definitions = walk(defs());
  const ids = definitions.flatMap((node) => node.id === undefined ? [] : [node.id]);
  expect(ids).toEqual([
    'htStone', 'htStone2', 'htOr', 'htOrS', 'htAz', 'htAzL', 'htShadow', 'htGu',
    'courses', 'boards', 'roomLight', 'warm', 'sun', 'rollClip',
  ]);
  expect(new Set(ids).size).toBe(ids.length);
  const referenced = walk(keepArt()).flatMap((node) => [
    ...Object.values(node.paint ?? {}), ...Object.values(node.attrs),
  ]).flatMap((value) => [...value.matchAll(/url\(#([^)]*)\)/g)].map((match) => match[1]));
  expect(referenced.length).toBeGreaterThan(0);
  expect(referenced).toContain('rollClip');
  for (const id of referenced) {
    expect(ids).toContain(id);
    expect(definitions.find((node) => node.id === id)?.tag).toMatch(/^(pattern|radialGradient|clipPath)$/);
  }
  expect(definitions.find((node) => node.id === 'rollClip')?.children).toEqual([
    { tag: 'rect', attrs: { x: '226', y: '388', width: '112', height: '100' } },
  ]);
});

test('each product room has exactly one litglow and dim with matching bounds', () => {
  const nodes = walk(keepArt());
  for (const [room, { rect }] of Object.entries(keepRooms)) {
    for (const cls of ['litglow', 'dim']) {
      const matches = nodes.filter((node) => node.room === room && node.cls?.includes(cls));
      expect(matches).toHaveLength(1);
      expect(matches[0]?.tag).toBe('rect');
      expect(matches[0]?.attrs).toEqual(rectAttrs(rect));
      expect(matches[0]?.paint).toEqual(cls === 'litglow' ? { fill: 'url(#warm)' } : undefined);
    }
  }
  expect(overlays()).toHaveLength(12);
});

test('ink groups and ambient groups retain the winner plate order', () => {
  expect(sky().map((node) => node.cls)).toEqual([['ink-o'], ['ink-a']]);
  expect(structure().map((node) => node.cls)).toEqual([
    ['ink-g'], ['ink-k'], ['ink-a'], ['ink-g'], ['ink-o'],
  ]);
  const nodes = walk(keepArt());
  for (const ink of ['ink-k', 'ink-g', 'ink-a', 'ink-o']) {
    expect(nodes.filter((node) => node.tag === 'g' && node.cls?.includes(ink)).length).toBeGreaterThan(0);
  }
  expect(nodes.filter((node) => node.cls?.includes('cloud'))).toHaveLength(3);
  expect(nodes.filter((node) => node.cls?.includes('c2'))).toHaveLength(1);
  expect(nodes.filter((node) => node.cls?.includes('wave'))).toHaveLength(1);
});

test('every source file is free of hex colour literals', () => {
  const directory = new URL('./', import.meta.url);
  const files = readdirSync(directory, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile());
  expect(files.length).toBeGreaterThan(0);
  for (const entry of files) {
    const source = readFileSync(`${entry.parentPath}/${entry.name}`, 'utf8');
    expect(source, `${fileURLToPath(directory)}${entry.name}`).not.toMatch(/#[\da-f]{3,8}\b/i);
  }
});
