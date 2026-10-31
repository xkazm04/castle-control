import { expect, test, vi } from 'vitest';
import * as artDom from '@castle-control/keep-art/dom';
import { frameTransform, keepRooms, siteOverviewFrame, siteOverviewTarget, siteRoomTarget } from '@castle-control/keep-art';
import { buildStage } from './stage.ts';
import { createView } from './view.ts';
import { FakeDocument } from './test-dom.ts';
import { toggleTheme } from './theme.ts';
import { initialState, transition } from './machine.ts';
import { artRoom, roomIds } from './route.ts';
import { releases, stewardCopy, words } from './copy.ts';

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
  const study = document.created.find((node) => node.className === 'steward-notices');
  expect(study?.children[0]?.textContent).toBe(stewardCopy.title);
  expect(study?.children.at(-1)?.children.map((node) => node.textContent)).toEqual(['Docs', 'Source']);
  view.update(initialState(true, { room: 'lots', features: false }));
  expect(nodes.stewardNotices.hidden).toBe(true);
  view.update(initialState(true, { room: 'steward', features: false }));
  expect(nodes.stewardNotices.hidden).toBe(false);
  expect(nodes.broadside.hidden).toBe(false);
  expect(study?.children.slice(1, -1).map((node) => node.textContent ?? node.children[0]?.textContent))
    .toEqual(stewardCopy.notices.map((notice) => notice.text));
});
