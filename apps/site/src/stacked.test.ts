import { readFileSync } from 'node:fs';
import { expect, test, vi } from 'vitest';
import { artHooks, keepRooms } from '@castle-control/keep-art';
import { CHAMBERS, principles, releases, words } from './copy.ts';
import { bindLayout, stackedQuery } from './layout.ts';
import { initialState } from './machine.ts';
import { artRoom, parse, parseReview, roomIds } from './route.ts';
import { buildStage } from './stage.ts';
import { buildStacked } from './stacked.ts';
import { FakeDocument } from './test-dom.ts';
import type { FakeNode } from './test-dom.ts';
import { createView } from './view.ts';
import { draw, readLine, curve, band, initialClaims, cycleHex, tallyHex } from './toys.ts';

function fixture(reduced = true, query = '') {
  const document = new FakeDocument(), nodes = buildStage(document as FakeDocument & Document);
  const view = createView(nodes, () => reduced, parseReview(query).seed);
  const mobile = (): FakeNode => document.created.find((node) => node.dataset['role'] === 'stacked')!;
  const panel = (room: string): FakeNode => document.created.find((node) => node.className === 'toy-panel' && node.dataset['room'] === room)!;
  const descendants = (node: FakeNode): FakeNode[] => [node, ...node.children.flatMap(descendants)];
  const role = (room: string, name: string): FakeNode => descendants(panel(room)).find((node) => node.dataset['role'] === name)!;
  const submit = (room: string): void => panel(room).querySelector('form')!.emit('submit');
  const route = (hash: string): void => view.update(initialState(reduced, parse(hash)));
  const id = (name: string): FakeNode => document.created.find((node) => node.id === name)!;
  return { document, nodes, view, mobile, panel, role, submit, route, id, descendants, reduce: (): void => { reduced = true; } };
}

test('one media query switches live at the boundary and unsubscribes cleanly', () => {
  const media = Object.assign(new EventTarget(), { matches: false });
  const change = vi.fn();
  const unbind = bindLayout(media as MediaQueryList & typeof media, change);
  expect(stackedQuery).toBe('(max-width: 1279px)');
  expect(change.mock.calls).toEqual([[false]]);
  for (const matches of [true, false, true]) { media.matches = matches; media.dispatchEvent(new Event('change')); }
  expect(change.mock.calls).toEqual([[false], [true], [false], [true]]);
  unbind(); media.dispatchEvent(new Event('change')); expect(change).toHaveBeenCalledTimes(4);
  const css = readFileSync(new URL('./stacked.css', import.meta.url), 'utf8');
  expect(css).not.toMatch(/@media/);
});

test('stacked landmarks, headings, copy, stamps and public room crops are complete and ordered', () => {
  const f = fixture(); f.view.setStacked(true); f.route('');
  const all = f.descendants(f.mobile());
  expect(f.nodes.stage.hidden).toBe(true); expect(f.document.documentElement.classList.contains('stacked')).toBe(true);
  expect(all.filter((node) => ['HEADER', 'MAIN', 'FOOTER'].includes(node.tagName)).map((node) => node.tagName))
    .toEqual(['HEADER', 'MAIN', 'FOOTER']);
  expect(all.filter((node) => node.tagName === 'H1').map((node) => node.textContent)).toEqual([words.name]);
  expect(all.filter((node) => node.tagName === 'H2').map((node) => node.textContent))
    .toEqual([...CHAMBERS.map((copy) => copy.name), words.steward_title]);
  expect(all.filter((node) => node.dataset['role'] === 'principle').map((node) => node.children.map((child) => child.textContent)))
    .toEqual(principles);
  expect(all.filter((node) => node.tagName === 'KBD')).toHaveLength(0);
  expect(all.find((node) => node.className === 'stacked-mark')?.textContent).toBe('Castle Control');
  expect(all.find((node) => node.className === 'cta')?.href).toBe(releases);
  expect(all.find((node) => node.className === 'skiplink')?.href).toBe('#lots');
  for (const copy of CHAMBERS) {
    const section = f.id(copy.id), descendants = f.descendants(section);
    expect(section.getAttribute('aria-labelledby')).toBe(`${copy.id}-title`);
    expect(descendants.some((node) => node.textContent === copy.fn)).toBe(true);
    for (const [lead, text] of copy.notes) {
      expect(descendants.some((node) => node.textContent === `${lead}. `)).toBe(true);
      expect(descendants.some((node) => node.textContent === text)).toBe(true);
    }
    expect(descendants.some((node) => node.textContent === copy.inside)).toBe(true);
    expect(f.panel(copy.id).children[0]?.children[1]?.dataset['stamp'])
      .toBe(['gate', 'beacons'].includes(copy.id) ? 'simulated' : 'sample');
    expect(f.panel(copy.id).hidden).toBe(false);
    const rect = keepRooms[artRoom[copy.id]].frame;
    expect(section.querySelector('svg')?.getAttribute('viewBox')).toBe(`${rect.x} ${rect.y} ${rect.w} ${rect.h}`);
  }
  const ids = all.map((node) => node.id).filter(Boolean);
  expect(new Set(ids).size).toBe(ids.length);
  for (const node of all) for (const attr of node.attrs.values()) {
    for (const reference of attr.matchAll(/url\(#([^)]*)\)/g)) expect(ids).toContain(reference[1]);
  }
});

test('stacked art keeps the desktop overview rest state: overlays off and wheel paints intact', () => {
  const f = fixture(); f.view.setStacked(true); f.route('');
  const drawings = f.mobile().querySelectorAll('.stacked-art');
  expect(drawings).toHaveLength(5);
  // This simulated DOM cannot compute CSS; check the matching production rules.
  // The browser lane checks the computed overlay opacity and interior paint.
  const css = readFileSync(new URL('./stacked.css', import.meta.url), 'utf8');
  for (const name of ['dim', 'litglow']) {
    for (const drawing of drawings) expect(drawing.querySelectorAll(`.${name}`).length).toBeGreaterThan(0);
    const start = css.indexOf(`.stacked-art .${name} {`);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(css.slice(start).split('}')[0]).toMatch(/opacity:\s*0\s*;/);
  }
  const paints = (wheel: FakeNode): string[] => f.descendants(wheel)
    .flatMap((node) => node.getAttribute('style')?.includes('fill:var(--') ? [node.getAttribute('style')!] : []);
  const wheel = f.id(`stacked-lots-${artHooks.lotWheel}`);
  expect(wheel).toBeDefined();
  expect(paints(wheel).length).toBeGreaterThan(0);
  expect(paints(wheel)).toEqual(paints(f.id(artHooks.lotWheel)));
});

test.each(roomIds)('route #%s and nested features scroll/focus the corresponding inline section', (room) => {
  const f = fixture(); f.view.setStacked(true); f.route(`#${room}`);
  expect(f.document.activeElement).toBe(f.id(room));
  expect(f.id(room).scrolls.at(-1)).toEqual({ behavior: 'instant', block: 'start' });
  if (room !== 'steward') {
    f.route(`#${room}/features`); expect(f.id(`${room}-features`).open).toBe(true);
    expect(f.document.activeElement).toBe(f.id(room));
  }
  f.route('#invalid'); expect(f.mobile().scrolls.at(-1)).toEqual({ behavior: 'instant', block: 'start' });
});

test('identical toy panels, inputs and results survive desktop → stacked → desktop → stacked', () => {
  const f = fixture(); f.route('#lots');
  const stageChildren = [...f.id('stage').children];
  const filter = f.id('stage').querySelector('.cc-inkedge-filter')!;
  const panels = CHAMBERS.map((copy) => f.panel(copy.id));
  f.role('lots', 'toy-input').value = ' LANTERNS '; f.submit('lots');
  f.route('#gate'); f.role('gate', 'toy-input').value = 'example.com'; f.submit('gate');
  f.route('#beacons'); f.role('beacons', 'toy-input').value = '120'; f.role('beacons', 'toy-input').emit('input');
  f.route('#map'); const desktopHex = f.id(artHooks.hexes).children[0]!; desktopHex.click();
  f.view.setStacked(true);
  expect(filter.parentElement).toBe(f.mobile());
  const inventory = f.document.created.length;
  expect(f.role('lots', 'toy-result').textContent).toBe('cindergate44');
  expect(f.role('lots', 'toy-proof').textContent).toContain('7e90abd4');
  expect(f.role('gate', 'toy-result').textContent).toBe('Held · not on air');
  expect(f.role('beacons', 'toy-result').textContent).toBe('100% blaze');
  const buttons = f.panel('map').querySelector('.stacked-hexes')!.children;
  expect(buttons).toHaveLength(45); expect(buttons[0]?.getAttribute('aria-label')).toBe('Hex 1: House Gules');
  buttons[0]!.click();
  expect(buttons[0]?.getAttribute('aria-label')).toBe('Hex 1: House Azure');
  f.view.setStacked(false);
  expect(f.document.documentElement.classList.contains('stacked')).toBe(false); expect(f.nodes.stage.hidden).toBe(false);
  expect(f.document.body.children).not.toContain(f.mobile());
  expect(f.nodes.toy.children).toEqual(panels);
  expect(f.id('stage').children).toEqual(stageChildren);
  expect(f.panel('map').querySelector('.stacked-hexes')).toBe(null);
  expect(desktopHex.getAttribute('aria-label')).toBe('Hex 1: House Azure');
  f.view.setStacked(true);
  expect(f.document.created.length).toBe(inventory);
  expect(f.role('lots', 'toy-input').value).toBe(' LANTERNS ');
  expect(f.role('gate', 'toy-input').value).toBe('example.com');
  expect(f.role('beacons', 'toy-input').value).toBe('120');
  expect(f.panel('map').querySelector('.stacked-hexes')?.children).toEqual(buttons);
});

test('stacked seed, line, gift and hex results use the same pure functions as desktop', () => {
  const f = fixture(true, '?seed=lanterns'); f.view.setStacked(true); f.route('');
  for (const seed of ['lanterns', 'banner', 'simulated_42']) {
    f.role('lots', 'toy-input').value = seed; f.submit('lots');
    const result = draw(seed); if ('refusal' in result) throw new Error('Expected simulated draw');
    expect(f.role('lots', 'toy-result').textContent).toBe(result.winner);
    expect(f.role('lots', 'toy-proof').textContent).toBe(result.proof);
  }
  for (const line of ['example.com', 'hello keep', 'ABCDEF', '']) {
    f.role('gate', 'toy-input').value = line; f.submit('gate');
    expect(f.role('gate', 'toy-proof').textContent).toBe(readLine(line).reason);
    expect(f.role('gate', 'toy-result').textContent).toBe(readLine(line).verdict === 'PASS' ? 'Pass' : 'Held · not on air');
  }
  for (const value of [0, 10, 30, 100, 120]) {
    f.role('beacons', 'toy-input').value = String(value); f.role('beacons', 'toy-input').emit('input');
    expect(f.role('beacons', 'toy-result').textContent).toBe(`${Math.round(curve(value))}% blaze`);
    expect(f.role('beacons', 'toy-proof').textContent).toBe(band(value));
    expect(f.id(`stacked-beacons-${artHooks.altarFlame}`).style.transition).toBe('none');
  }
  const claims = initialClaims(), buttons = f.panel('map').querySelector('.stacked-hexes')!.children;
  for (const index of [0, 0, 0, 0, 6, 21]) { claims[index] = cycleHex(claims[index]!); buttons[index]!.click(); }
  expect(f.role('map', 'toy-result').children.map((node) => node.textContent))
    .toEqual(tallyHex(claims).map((n, index) => `${['Gules', 'Azure', 'Or'][index]} ${n}`));
  expect(f.view.liveHex()).toBe(false); // Native buttons own Enter; no duplicate keymap claim.
});

test('query seed draws once, preference changes settle a pending wheel, and reduced routes cut', () => {
  vi.useFakeTimers();
  try {
    const f = fixture(false, '?seed=lanterns'); f.view.setStacked(true); f.route('');
    expect(f.role('lots', 'toy-result').textContent).toBe('Turning…');
    f.route('#gate'); expect(f.id('gate').scrolls.at(-1)?.behavior).toBe('smooth');
    f.reduce(); f.route('#gate');
    expect(f.role('lots', 'toy-result').textContent).toBe('cindergate44');
    expect(f.id(`stacked-lots-${artHooks.lotWheel}`).style.transition).toBe('none');
    f.route('#lots'); expect(f.id('lots').scrolls.at(-1)?.behavior).toBe('instant');
    vi.advanceTimersByTime(2200);
    expect(f.role('lots', 'toy-history').textContent).toBe('lanterns → cindergate44');
    expect(f.descendants(f.mobile()).some((node) => node.classList.contains('print-in'))).toBe(false);
  } finally { vi.useRealTimers(); }
});

test('desktop never creates stacked scenes until the media switch needs them', () => {
  const f = fixture(); f.route('');
  expect(f.mobile()).toBeUndefined(); expect(f.nodes.castle.querySelectorAll('svg')).toHaveLength(1);
  const standalone = buildStacked(f.nodes, () => true);
  expect(standalone.sections.size).toBe(5); expect(standalone.details.size).toBe(4);
});

test('a draw in flight keeps its decision, timer and wheel alignment through a layout switch', () => {
  vi.useFakeTimers();
  try {
    const f = fixture(false); f.route('#lots'); f.submit('lots');
    vi.advanceTimersByTime(1000); f.view.setStacked(true);
    expect(f.id(`stacked-lots-${artHooks.lotWheel}`).style.transform).toBe('rotate(1185deg)');
    expect(f.role('lots', 'toy-result').textContent).toBe('Turning…');
    vi.advanceTimersByTime(1200);
    expect(f.role('lots', 'toy-result').textContent).toBe('cindergate44');
    f.view.setStacked(false);
    expect(f.id(artHooks.lotWheel).style.transform).toBe('rotate(1185deg)');
    expect(f.role('lots', 'toy-history').textContent).toBe('lanterns → cindergate44');
    expect(f.role('lots', 'toy-go').disabled).toBe(false);
  } finally { vi.useRealTimers(); }
});
