import { readFileSync } from 'node:fs';
import { describe, expect, test, vi } from 'vitest';
import type { ArtAssetKind } from '@castle-control/contract';
import { closestAsset, directArt, loadLibrary, parseLibrary, presetsOf, prompt_limit, searchLibrary, size_options, translate } from './custom.js';

const raw: unknown = JSON.parse(readFileSync(new URL('../../../../apps/desktop/public/art/library/library.json', import.meta.url), 'utf8'));
const catalog = parseLibrary(raw);
const kinds: readonly ArtAssetKind[] = ['beacon', 'frame', 'vote_bar', 'draw_vessel'];
const franchise = /valorant|elden|souls|fortnite|minecraft|apex|overwatch|diablo|destiny|halo|hollow knight|warcraft|league of legends|baldur|monster hunter/i;
const vague = ['make it look cool', 'something for my valorant stream', 'dark souls vibes', 'cyberpunk', 'like fortnite but not fortnite',
  'minecraft beacon but nicer', 'halloween version pls', 'my brand is teal and black, minimal', 'something with a dragon?', 'elden ring style',
  'the lamp from hollow knight kind of mood', 'league of legends style', 'x'.repeat(500)];

describe('scripted art director', () => {
  test.each(kinds)('%s: every vague request becomes a complete, bounded direction', kind => {
    for (const request of vague) {
      const size = size_options[kind][0]!;
      const direction = directArt({ kind, request, width: size.width, height: size.height });
      expect(direction.master_prompt.length).toBeLessThanOrEqual(prompt_limit);
      expect(direction.master_prompt).toContain('no text, no letters, no numbers, no logos, no watermark'.replace(/^n/, 'N'));
      expect(direction.master_prompt).toMatch(/Background: /);
      expect(direction.master_prompt).toMatch(/Technical: /);
      expect(direction.master_prompt).toContain(`${size.width}x${size.height}`);
      expect(direction.master_prompt).not.toMatch(franchise);
      expect(direction.interpretation).not.toMatch(franchise);
      expect(direction.palette.length).toBeGreaterThanOrEqual(4);
      expect(direction.palette.length).toBeLessThanOrEqual(6);
      for (const colour of direction.palette) expect(colour).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(direction.assumptions.length).toBeGreaterThan(0);
      expect(direction.assumptions.length).toBeLessThanOrEqual(3);
      expect(direction.question?.options).toHaveLength(3);
      expect(direction.question?.options).toContain(direction.question?.assumed);
      expect(direction).toMatchObject({ kind, width: size.width, height: size.height });
    }
  });

  test('per-kind hard rules and background rules are in the prompt', () => {
    const frame = directArt({ kind: 'frame', request: 'webcam border', width: 1536, height: 864 });
    expect(frame.master_prompt).toContain('FULL BLEED');
    expect(frame.master_prompt).toContain('fully transparent centre');
    const bar = directArt({ kind: 'vote_bar', request: 'vote bar', width: 1536, height: 512 });
    expect(bar.master_prompt).toContain('track interior must be DARK');
    const beacon = directArt({ kind: 'beacon', request: 'fire', width: 768, height: 1024 });
    expect(beacon.style_name).toBe('Forged Volcanic Ember');
    expect(beacon.master_prompt).toContain('glowing core must be clearly separable');
  });

  test('franchises become style words; named colours lead the palette; the answer is the choice', () => {
    expect(translate('valorant style')).toEqual({ text: 'tactical graphic sci-fi with clean agent-tech shapes style', named: true });
    const branded = directArt({ kind: 'frame', request: 'my brand is teal and black, minimal', width: 1536, height: 864 });
    expect(branded.palette.slice(0, 2)).toEqual(['#14B8A6', '#0B0B0F']);
    const answered = directArt({ kind: 'beacon', request: 'magic crystal', width: 768, height: 1024, answer: 'Wild blaze' });
    expect(answered.question?.assumed).toBe('Wild blaze');
    expect(answered.master_prompt).toContain('Choice: Wild blaze.');
    const spooky = directArt({ kind: 'draw_vessel', request: 'halloween version pls', width: 1024, height: 1024 });
    expect(spooky.style_name).toBe('Hallowed Night Gothic');
    expect(spooky.master_prompt).toContain('carved jack-o-lantern glow');
    expect(directArt({ kind: 'beacon', request: 'fire', width: 768, height: 1024 })).toEqual(directArt({ kind: 'beacon', request: 'fire', width: 768, height: 1024 }));
  });

  test('every size option fits the provider: multiple of 16, ratio within 3:1, at most 1536', () => {
    for (const kind of kinds) for (const size of size_options[kind]) {
      expect(size.width % 16 + size.height % 16).toBe(0);
      expect(Math.max(size.width, size.height)).toBeLessThanOrEqual(1536);
      expect(Math.max(size.width / size.height, size.height / size.width)).toBeLessThanOrEqual(3);
    }
  });
});

describe('library catalog', () => {
  test('the shipped catalog parses: ten presets per kind, anchors where the kind needs them', () => {
    expect(catalog.assets.length).toBeGreaterThan(80);
    for (const kind of kinds) expect(presetsOf(catalog, kind)).toHaveLength(10);
    for (const bar of catalog.assets.filter(item => item.kind === 'vote_bar')) expect(bar.anchors?.track_rect).toBeDefined();
    for (const frame of catalog.assets.filter(item => item.kind === 'frame')) expect(frame.anchors?.window_rect).toBeDefined();
  });

  test('refuses a bad shape in one place with a plain reason', () => {
    const first = (catalog.assets[0] ?? {}) as object;
    expect(() => parseLibrary({ version: 2, simulated_note: 'x', assets: [first] })).toThrow('library version is unknown');
    expect(() => parseLibrary({ version: 1, simulated_note: 'x', assets: [{ ...first, file: 'https://example.com/a.webp' }] })).toThrow(/not a library file/);
    expect(() => parseLibrary({ version: 1, simulated_note: 'x', assets: [{ ...first, extra: 1 }] })).toThrow(/extra is unknown/);
    expect(() => parseLibrary({ version: 1, simulated_note: 'x', assets: [{ ...first, palette: ['red'] }] })).toThrow(/palette/);
    expect(() => parseLibrary({ version: 1, simulated_note: 'x', assets: [first, first] })).toThrow('library ids repeat');
    expect(() => parseLibrary({ version: 1, simulated_note: 'x', assets: [{ ...first, anchors: { mouth: { x: 2, y: 0 } } }] })).toThrow(/mouth.x/);
  });

  test('loads once, and a failed load is retried on the next call', async () => {
    const failing = vi.fn(async () => ({ ok: false, json: async () => raw }));
    await expect(loadLibrary(failing)).rejects.toThrow('The art library did not load.');
    const working = vi.fn(async () => ({ ok: true, json: async () => raw }));
    const [a, b] = await Promise.all([loadLibrary(working), loadLibrary(working)]);
    expect(a).toBe(b);
    expect(working).toHaveBeenCalledExactlyOnceWith('/art/library/library.json');
  });
});

describe('library search', () => {
  test('a request that matches an asset ranks it first, within its kind', () => {
    expect(searchLibrary(catalog, 'beacon', 'reactor core, cyberpunk')[0]?.asset.id).toBe('beacon-03');
    expect(searchLibrary(catalog, 'vote_bar', 'runes')[0]?.asset.id).toBe('votebar-11');
    expect(searchLibrary(catalog, 'frame', 'ice')[0]?.asset.id).toBe('frame-19');
    expect(searchLibrary(catalog, 'draw_vessel', 'halloween')[0]?.asset.id).toBe('vessel-20');
    for (const match of searchLibrary(catalog, 'frame', 'cyberpunk hud', 10)) expect(match.asset.kind).toBe('frame');
  });

  test('franchise names and moods find the translated style; nonsense falls back to presets', () => {
    expect(searchLibrary(catalog, 'beacon', 'elden ring')[0]?.asset.style_name).toBe('Gilded Dark Reliquary');
    expect(searchLibrary(catalog, 'beacon', 'lava')[0]?.asset.id).toBe('beacon-05');
    const nothing = searchLibrary(catalog, 'vote_bar', 'qqqq zzzz');
    expect(nothing).toHaveLength(3);
    expect(nothing.every(item => item.asset.preset)).toBe(true);
  });

  test('closest asset skips ones already shown', () => {
    const first = closestAsset(catalog, 'beacon', 'fire');
    expect(first?.id).toBe('beacon-05');
    expect(closestAsset(catalog, 'beacon', 'fire', ['beacon-05'])?.id).not.toBe('beacon-05');
  });
});
