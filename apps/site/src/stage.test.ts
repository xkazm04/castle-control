import { expect, test, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import * as artDom from '@castle-control/keep-art/dom';
import { frameTransform, keepRooms, siteOverviewFrame, siteOverviewTarget, siteRoomTarget } from '@castle-control/keep-art';
import { buildStage } from './stage.ts';
import { createView } from './view.ts';
import { FakeDocument } from './test-dom.ts';
import { toggleTheme } from './theme.ts';
import { initialState, transition } from './machine.ts';
import { artRoom, roomIds } from './route.ts';
import { releases, stewardCopy, words } from './copy.ts';
import { createIntro } from './intro.ts';

function fixture() {
  const document = new FakeDocument();
  // A single narrow adapter at the document boundary; production takes real DOM types.
  const nodes = buildStage(document as FakeDocument & Document);
  const view = createView(nodes, () => true);
  for (const [room, hit] of nodes.hits) {
    hit.addEventListener('focus', () => view.focus(room));
    hit.addEventListener('blur', () => view.focus(null));
  }
  return { document, nodes, view };
}

test('intro and overview sheets cannot intercept chamber hits, including after Skip and a room visit', () => {
  // The simulated DOM has no layout engine: assert the production CSS hit-test
  // contract as well as the machine's actual visibility state.
  const css = readFileSync(new URL('./site.css', import.meta.url), 'utf8');
  const rule = (selector: string): string => css.slice(css.indexOf(`${selector} {`)).split('}')[0]!;
  for (const selector of ['.toy-stack', '#broadside']) {
    expect(rule(selector)).toMatch(/display:\s*none\s*;/);
    expect(rule(selector)).toMatch(/pointer-events:\s*none\s*;/);
    expect(rule(`.room-mode ${selector}`)).toMatch(/display:\s*flex\s*;/);
  }
  // The empty stack stays inert in the study; only a visible dock takes input.
  expect(rule('#toy')).toMatch(/pointer-events:\s*auto\s*;/);
  expect(rule('.room-mode #broadside')).toMatch(/pointer-events:\s*auto\s*;/);
  const { document, nodes, view } = fixture();
  const stack = document.created.find((node) => node.classList.contains('toy-stack'))!;
  const inventory = document.created.length;
  for (const state of [initialState(false), transition(initialState(false), { type: 'skip' })]) {
    view.update(state);
    expect(nodes.stage.classList.contains('room-mode')).toBe(false);
    expect(nodes.toy.hidden).toBe(true); expect(nodes.broadside.hidden).toBe(true);
    expect([...nodes.hits.values()].every((hit) => !hit.disabled)).toBe(true);
  }
  view.update({ phase: 'room', room: 'lots' });
  expect(nodes.stage.classList.contains('room-mode')).toBe(true);
  expect(nodes.toy.hidden).toBe(false); expect(nodes.broadside.hidden).toBe(false);
  view.update(initialState(true));
  expect(nodes.stage.classList.contains('room-mode')).toBe(false);
  expect(nodes.toy.hidden).toBe(true); expect(nodes.broadside.hidden).toBe(true);
  expect(stack.children).toContain(nodes.toy);
  expect(document.created.length).toBe(inventory);
});

test('Skip is named and native, before the header links; all fidelity hooks are unique except room tags', () => {
  const { document, nodes } = fixture();
  expect(nodes.skip.tagName).toBe('BUTTON');
  expect(nodes.skip.type).toBe('button');
  expect(nodes.skip.textContent).toBe('Skip intro');
  expect(nodes.skip.disabled).toBe(false);
  expect(document.created.findIndex((node) => node.id === 'skip')).toBeLessThan(
    document.created.findIndex((node) => node.dataset['role'] === 'topbar'));
  const roles = document.created.flatMap((node) => node.dataset['role'] ?? []);
  for (const role of ['topbar', 'mark', 'crumbs', 'keys', 'cta', 'headline-eyebrow', 'headline-name',
    'headline-sub', 'vlabel', 'footer', 'skip', 'stage']) expect(roles.filter((value) => value === role)).toHaveLength(1);
  expect(roles.filter((value) => value === 'room-tag')).toHaveLength(4);
  expect(nodes.hits.size).toBe(5);
});

test('mountArt is called once across twenty hover/focus changes, with stable DOM and lighting', () => {
  const mounted = vi.spyOn(artDom, 'mountArt');
  const { document, nodes, view } = fixture();
  view.update(initialState(true));
  const inventory = document.created.length;
  for (let index = 0; index < 20; index++) {
    const room = roomIds[index % roomIds.length];
    if (!room) throw new Error('Missing simulated room');
    if (index % 2) view.focus(room); else view.hover(room);
    expect(nodes.castle.classList.contains('focus')).toBe(true);
    const selected = document.created.filter((node) => node.classList.contains('on'));
    expect(selected).toHaveLength(2);
    expect(selected.every((node) => node.dataset['room'] === artRoom[room])).toBe(true);
  }
  view.hover(null); view.focus(null);
  expect(nodes.castle.classList.contains('focus')).toBe(false);
  expect(nodes.headline.name.textContent).toBe('Castle Control');
  expect(mounted).toHaveBeenCalledTimes(1);
  expect(document.created.length).toBe(inventory);
  mounted.mockRestore();
});

test('Skip focuses the first hit without lighting it; hover then leave restores the keep', () => {
  const { document, nodes, view } = fixture();
  let state = initialState(false);
  view.update(state);
  const intro = createIntro({
    schedule: () => 1, cancel: vi.fn(),
    handover: (event) => { state = transition(state, event); view.update(state); },
    showSkip: (show) => { nodes.skip.hidden = !show; },
    skipFocused: () => nodes.stage.ownerDocument.activeElement === nodes.skip,
    focusFirst: view.focusFirst,
  }, true);
  nodes.skip.addEventListener('click', intro.skip);
  nodes.skip.click();
  expect(document.activeElement).toBe(nodes.hits.get('lots'));
  expect(nodes.castle.classList.contains('focus')).toBe(false);
  expect(nodes.headline.name.textContent).toBe(words.name);
  view.hover('gate');
  expect(nodes.headline.name.textContent).toBe('Gatehouse');
  view.hover(null);
  expect(document.activeElement).toBe(nodes.hits.get('lots'));
  expect(nodes.castle.classList.contains('focus')).toBe(false);
  expect(document.created.filter((node) => node.classList.contains('on'))).toHaveLength(0);
  expect(nodes.headline.name.textContent).toBe(words.name);
  expect(nodes.headline.eyebrow.textContent).toBe(words.eyebrow);
  expect(nodes.headline.sub.textContent).toBe(words.sub);
});

test('Tab focus arriving on a room hit lights that room and takes over the headline', () => {
  const { document, nodes, view } = fixture();
  view.update(initialState(true));
  // Tab's focus event reaches the same hit listener as native focus in the browser.
  nodes.hits.get('gate')?.focus();
  expect(document.activeElement).toBe(nodes.hits.get('gate'));
  expect(nodes.headline.name.textContent).toBe('Gatehouse');
  expect(nodes.castle.classList.contains('focus')).toBe(true);
  expect(document.created.filter((node) => node.classList.contains('on')).map((node) => node.dataset['room']))
    .toEqual(['moderator', 'moderator']);
});

test('pointer leave clears keyboard attention; the next arrow focus lights the new room', () => {
  const { document, nodes, view } = fixture();
  view.update(initialState(true));
  nodes.hits.get('gate')?.focus();
  view.hover(null);
  // A later render must not resurrect the still-focused hit either.
  view.update(initialState(true));
  expect(document.activeElement).toBe(nodes.hits.get('gate'));
  expect(nodes.castle.classList.contains('focus')).toBe(false);
  expect(nodes.headline.name.textContent).toBe(words.name);
  expect(document.created.filter((node) => node.classList.contains('on'))).toHaveLength(0);
  view.moveFocus(1);
  expect(document.activeElement).toBe(nodes.hits.get('beacons'));
  expect(nodes.headline.name.textContent).toBe('Beacons');
  expect(document.created.filter((node) => node.classList.contains('on')).map((node) => node.dataset['room']))
    .toEqual(['visuals', 'visuals']);
});

test('cameras use shared contain geometry; hits disable; Back returns to the original hit after cycling', () => {
  const { document, nodes, view } = fixture();
  let state = initialState(true);
  view.update(state);
  const overview = frameTransform(siteOverviewFrame, siteOverviewTarget, 'contain');
  expect(nodes.castle.style.transform).toBe(`translate(${overview.ox}px,${overview.oy}px) scale(${overview.s})`);
  state = transition(state, { type: 'open', room: 'lots' }); view.update(state);
  const camera = frameTransform(keepRooms.lottery.frame, siteRoomTarget, 'contain');
  expect(nodes.castle.style.transform).toBe(`translate(${camera.ox}px,${camera.oy}px) scale(${camera.s})`);
  expect([...nodes.hits.values()].every((hit) => hit.disabled && hit.tabIndex === -1)).toBe(true);
  expect(document.activeElement).toBe(nodes.broadside);
  state = transition(state, { type: 'features' }); view.update(state);
  state = transition(state, { type: 'cycle', direction: 1 }); view.update(state);
  state = transition(state, { type: 'back' }); view.update(state);
  expect(document.activeElement).toBe(nodes.broadside);
  state = transition(state, { type: 'back' }); view.update(state);
  expect(document.activeElement).toBe(nodes.hits.get('lots'));
  expect([...nodes.hits.values()].every((hit) => !hit.disabled && hit.tabIndex === 0)).toBe(true);
});

test('overview arrows move focus and the visit-only theme updates its accessible state', () => {
  const { document, nodes, view } = fixture();
  view.update(initialState(true));
  view.moveFocus(1); expect(document.activeElement).toBe(nodes.hits.get('lots'));
  view.moveFocus(-1); expect(document.activeElement).toBe(nodes.hits.get('map'));
  toggleTheme(document.documentElement as FakeDocument['documentElement'] & HTMLElement, nodes.theme);
  expect(document.documentElement.dataset['theme']).toBe('stock');
  expect(nodes.theme.getAttribute('aria-pressed')).toBe('true');
  toggleTheme(document.documentElement as FakeDocument['documentElement'] & HTMLElement, nodes.theme);
  expect(document.documentElement.dataset['theme']).toBe('paper');
});

test('the poster footer has four items and the releases CTA; theme and study live in the topbar', () => {
  const { document, nodes } = fixture();
  const footer = document.created.find((node) => node.id === 'footer');
  expect(footer?.children.map((node) => node.tagName)).toEqual(['SPAN', 'SPAN', 'SPAN', 'A']);
  expect(footer?.children.map((node) => node.textContent)).toEqual([
    null, words.footer, words.footer_aside, words.footer_cta,
  ]);
  expect(footer?.children[3]?.href).toBe(releases);
  expect(footer?.children[3]?.classList.contains('ghostbtn')).toBe(true);
  const topbar = document.created.find((node) => node.dataset['role'] === 'topbar');
  expect(topbar?.children.at(-1)?.textContent).toBe('Get the app →');
  expect(topbar?.children.at(-1)?.href).toBe(releases);
  const keys = topbar?.children.find((node) => node.dataset['role'] === 'keys');
  expect(keys?.children.filter((node) => node.tagName === 'KBD').map((node) => node.textContent))
    .toEqual(['1', '4', '0', 'Esc']);
  expect(keys?.children[1]?.textContent).toBe('–');
  expect(topbar?.children.findIndex((node) => node.id === 'theme')).toBe(
    (topbar?.children.findIndex((node) => node.dataset['role'] === 'keys') ?? -2) + 1);
  expect(nodes.study.href).toBe('#steward');
  expect(nodes.crumbs.hint.textContent).toBe('four chambers below');
});

test('the relocated honesty notices and project links are visible only in the Steward study', () => {
  const { document, nodes, view } = fixture();
  const study = document.created.find((node) => node.classList.contains('steward-notices'));
  expect(study?.children.at(-1)?.children.map((node) => node.textContent)).toEqual(['Docs', 'Source']);
  view.update(initialState(true, { room: 'lots', features: false }));
  expect(nodes.sheet.notices.hidden).toBe(true);
  view.update(initialState(true, { room: 'steward', features: false }));
  expect(nodes.sheet.notices.hidden).toBe(false);
  expect(nodes.broadside.hidden).toBe(false);
  expect(study?.children.slice(0, -1).map((node) => node.textContent ?? node.children[0]?.textContent))
    .toEqual(stewardCopy.notices.map((notice) => notice.text));
});
