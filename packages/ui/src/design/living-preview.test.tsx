import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { LivingPreview } from './living-preview.jsx';
import type { PreviewArt } from './living-preview.jsx';

const base = { label: 'Sample', palette: ['#111111', '#222222', '#FF8A24', '#00E5FF'] } as const;

test('every kind renders SIMULATED, labelled, and placed by its anchors', () => {
  const arts: PreviewArt[] = [
    { ...base, kind: 'beacon', base: '/art/b.webp', effect: '/art/e.webp', effect_blend: 'behind', width: 576, height: 768,
      anchors: { core_rect: { x: 0.29, y: 0.352, w: 0.42, h: 0.315 } } },
    { ...base, kind: 'frame', base: '/art/f.webp', width: 768, height: 432, anchors: { window_rect: { x: 0.02, y: 0.05, w: 0.96, h: 0.9 } } },
    { ...base, kind: 'vote_bar', base: '/art/v.webp', width: 768, height: 256,
      anchors: { track_rect: { x: 0.1, y: 0.4, w: 0.8, h: 0.2 }, track_radius: 0.5, segments: ['#20D9E8', '#FF9E32', '#B16CFF'] } },
    { ...base, kind: 'draw_vessel', base: '/art/u.webp', token: '/art/t.webp', width: 768, height: 768, anchors: { mouth: { x: 0.4, y: 0.9 } } },
  ];
  for (const art of arts) {
    const html = renderToStaticMarkup(<LivingPreview art={art} />);
    expect(html).toContain('SIMULATED');
    expect(html).toMatch(/living preview · Sample · SIMULATED/);
    expect(html).toContain(art.base);
  }
  const beacon = renderToStaticMarkup(<LivingPreview art={arts[0]!} />);
  expect(beacon).toContain('data-blend="behind"');
  expect(beacon).toContain('left:29.00%;top:35.20%;width:42.00%;height:31.50%');
  const bar = renderToStaticMarkup(<LivingPreview art={arts[2]!} />);
  // The radius is a share of the track height, so its horizontal half is divided by the track's own aspect (12:1 here).
  expect(bar).toContain('border-radius:4.17% / 50.00%');
  expect(bar).toContain('background:#FF9E32');
  expect(bar).toMatch(/Go left 4\d%/);
});

test('missing anchors fall back to a sensible box; an empty palette still renders', () => {
  const html = renderToStaticMarkup(<LivingPreview art={{ kind: 'beacon', label: 'Bare', palette: [], width: 600, height: 800, anchors: {} }} note="Core preview" />);
  expect(html).toContain('left:30.00%;top:28.00%');
  expect(html).toContain('Core preview');
  expect(html).not.toContain('<img');
});
