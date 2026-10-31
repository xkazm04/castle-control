import { Children, isValidElement } from 'react';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync, readdirSync } from 'node:fs';
import { expect, test } from 'vitest';
import { InkButton } from '@castle-control/ui';
import { DemoControls, DemoPreview } from './demo.jsx';
import { initialDemoState, layouts, shots, styles } from './model.js';
import type { DemoState } from './model.js';
import { copy } from './copy.js';

type Control = { children?: ReactNode; onClick?: () => void; 'aria-pressed'?: boolean };
function press(tree: ReactNode, label: string): void {
  let found = false;
  function visit(node: ReactNode) {
    Children.forEach(node, child => {
      if (!isValidElement<Control>(child)) return;
      if (child.type === InkButton && child.props.children === label) {
        child.props.onClick?.(); found = true;
      } else visit(child.props.children);
    });
  }
  visit(tree);
  expect(found).toBe(true);
}
function html(state: DemoState) { return renderToStaticMarkup(<DemoPreview state={state} />); }

test('both layouts retain the provenance labels, atlas captions, nine chat lines and panels', () => {
  for (const { id: layout } of layouts) {
    const markup = html({ ...initialDemoState, layout });
    const text = markup.replace(/<[^>]+>/g, '');
    for (const label of ['SIMULATED', 'SAMPLE ART', 'AI-generated', 'LIVE', 'Chat · simulated',
      'Gatehouse vote · Raze the mill 62% · Spare it 38% · 0:41', 'Beacons · blaze 54%',
      'Lot draw · 128 tickets', 'Map Room · 7 of 31 held', 'Arch-Lich Malakor']) expect(text).toContain(label);
    expect(markup.match(/<li[ >]/g)).toHaveLength(9);
    for (const line of copy.chat) expect(text).toContain(`${line.name ? `${line.name} ` : ''}${line.text}`);
    for (const panel of copy.panels) { expect(text).toContain(panel.title); expect(text).toContain(panel.text); }
  }
});

test('style segmented buttons change every overlay, panel and frame URL together', () => {
  let state: DemoState = initialDemoState;
  for (const { id, label } of styles) {
    press(DemoControls({ state, on_change: next => { state = next; } }), label);
    expect(state.style).toBe(id);
    const markup = html(state);
    for (const asset of ['urn', 'altar', 'votebar', 'hexmap', 'frame2']) {
      expect(markup).toContain(`src="/art/preset-${id}-${asset}.webp"`);
    }
    const imageUrls = [...markup.matchAll(/src="(\/art\/preset-[^"]+)"/g)].map(match => match[1]);
    expect(imageUrls).toHaveLength(8);
    expect(imageUrls.every(url => url?.startsWith(`/art/preset-${id}-`))).toBe(true);
    const controls = renderToStaticMarkup(<DemoControls state={state} on_change={() => undefined} />);
    expect(controls.match(/aria-pressed="true"/g)).toHaveLength(3);
    expect(controls).toContain(`aria-pressed="true"`);
  }
});

test('layout and shot buttons hide the camera and follow the atlas background mapping', () => {
  let state: DemoState = initialDemoState;
  const click = (label: string) => press(DemoControls({ state, on_change: next => { state = next; } }), label);
  for (const shot of shots) {
    click('Game + cam'); click(shot.label);
    expect(html(state)).toContain('class="bg" src="/art/scene-warmap.webp"');
    expect(html(state)).not.toContain('class="cam" hidden');
    click('Just chatting');
    const markup = html(state);
    expect(markup).toContain('stage chatting');
    expect(markup).toContain('class="cam" hidden=""');
    expect(markup).toContain(`class="bg" src="/art/${shot.id === 'malakor-facecam' ? 'malakor-lair-wide' : shot.id}.webp"`);
  }
});

test('both layouts keep the altar in the same position', () => {
  const css = readFileSync(new URL('./demo.css', import.meta.url), 'utf8');
  expect(css).not.toMatch(/\.chatting\s+\.o-altar\s*\{/);
});

test('all producible art URLs exist, are byte-identical to the atlas, and exhaust exactly the 34 allowed files', () => {
  const directory = new URL('../../public/art/', import.meta.url);
  const expected = ['heraldic', 'pixel', 'synthwave', 'watercolor', 'anime', 'glass'].flatMap(style =>
    ['urn', 'altar', 'votebar', 'hexmap', 'frame2'].map(asset => `preset-${style}-${asset}.webp`));
  expected.push('malakor-facecam.webp', 'malakor-lair-wide.webp', 'malakor-laugh.webp', 'scene-warmap.webp');
  const actual = readdirSync(directory).sort();
  expect(actual).toHaveLength(34);
  expect(actual).toEqual(expected.sort());
  const urls = new Set<string>();
  for (const style of styles) for (const layout of layouts) for (const shot of shots) {
    for (const match of html({ style: style.id, layout: layout.id, shot: shot.id }).matchAll(/src="\/art\/([^"]+)"/g)) {
      if (match[1]) urls.add(match[1]);
    }
  }
  expect([...urls].sort()).toEqual(actual);
  for (const file of urls) {
    const produced = readFileSync(new URL(file, directory));
    const atlas = readFileSync(new URL(`../../../../prototype/assets-2026-10-30/web/${file}`, import.meta.url));
    expect(produced.equals(atlas), `${file} must be byte-identical to the atlas`).toBe(true);
  }
}, 30000);
