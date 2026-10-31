import { expect, test } from 'vitest';
import { CHAMBERS, principles, releases, stewardCopy, words } from './copy.ts';
import { buildStage } from './stage.ts';
import { createView } from './view.ts';
import { FakeDocument } from './test-dom.ts';

test('all room and features sheets use copy, stable nodes and honest release links', () => {
  const document = new FakeDocument(), nodes = buildStage(document as FakeDocument & Document);
  const view = createView(nodes, () => false);
  const inventory = document.created.length;
  const role = (name: string) => document.created.filter((node) => node.dataset['role'] === name);
  for (const copy of CHAMBERS) {
    view.update({ phase: 'room', room: copy.id });
    expect(role('broadside-eyebrow')[0]?.textContent).toBe(`Chamber ${copy.n} of 4 · ${copy.fn}`);
    expect(role('broadside-title')[0]?.textContent).toBe(copy.name);
    expect(role('broadside-fn')[0]?.textContent).toBe(copy.fn);
    expect(role('broadside-line')[0]?.textContent).toBe(copy.line);
    expect(role('broadside-note').map((node) => node.children[1]?.children.map((child) => child.textContent)))
      .toEqual(copy.notes.map(([lead, text]) => [`${lead}.`, ` ${text}`]));
    expect(role('broadside-disc').map((node) => node.textContent)).toEqual(['1', '2', '3', '4']);
    const actions = role('broadside-action');
    expect(actions.map((node) => [node.textContent, node.href])).toEqual([
      [`Inside the ${copy.name} →`, `#${copy.id}/features`], ['Get the app →', releases],
    ]);
    expect(nodes.broadside.style.getPropertyValue('--bc')).toBe(`var(--${copy.ink === 'key' ? 'ink' : copy.ink})`);
    const pager = role('broadside-pager')[0]!;
    expect(pager.children[1]?.textContent).toBe(`${copy.n} / 4`);
    expect(pager.children[0]?.href).toBe(`#${CHAMBERS[(copy.n + 2) % 4]!.id}`);
    expect(pager.children[2]?.href).toBe(`#${CHAMBERS[copy.n % 4]!.id}`);
    view.update({ phase: 'features', room: copy.id });
    expect(nodes.broadside.dataset['kind']).toBe('features');
    expect(role('broadside-title')[0]?.textContent).toBe(`Inside the ${copy.name}`);
    expect(document.created.find((node) => node.className === 'body')?.textContent).toBe(copy.inside);
    expect(document.created.find((node) => node.className === 'fine')?.textContent).toBe(words.fine);
    expect(actions[0]?.href).toBe(`#${copy.id}`);
    expect(actions[1]?.href).toBe(releases);
    expect(pager.children[2]?.href).toMatch(/\/features$/);
  }
  expect(document.created.length).toBe(inventory);
});

test('Steward shows six principles then the extra honesty fine print and project links', () => {
  const document = new FakeDocument(), nodes = buildStage(document as FakeDocument & Document);
  const view = createView(nodes, () => true);
  view.update({ phase: 'room', room: 'steward' });
  expect(nodes.broadside.dataset['kind']).toBe('steward');
  expect(document.created.find((node) => node.dataset['role'] === 'broadside-title')?.textContent).toBe(words.steward_title);
  expect(document.created.filter((node) => node.dataset['role'] === 'principle')
    .map((node) => node.children.map((child) => child.textContent))).toEqual(principles);
  const notices = document.created.find((node) => node.classList.contains('steward-notices'))!;
  expect(notices.hidden).toBe(false);
  expect(notices.children.slice(0, -1).map((node) => node.textContent ?? node.children[0]?.textContent))
    .toEqual(stewardCopy.notices.map((notice) => notice.text));
  expect(notices.children.at(-1)?.children.map((node) => node.textContent)).toEqual(['Docs', 'Source']);
  const inner = document.created.find((node) => node.classList.contains('broadside-scroll'))!;
  const scroll = document.created.find((node) => node.classList.contains('steward-scroll'))!;
  const study = document.created.find((node) => node.classList.contains('steward-content'))!;
  const pager = document.created.find((node) => node.dataset['role'] === 'broadside-pager')!;
  expect(scroll.children.map((node) => node.className)).toEqual(['principles', 'steward-notices fine']);
  expect(scroll.children.indexOf(notices)).toBe(1);
  expect(scroll.tabIndex).toBe(0); expect(scroll.getAttribute('role')).toBe('region');
  expect(scroll.getAttribute('aria-label')).toBe('Six principles and project notices');
  expect(inner.tabIndex).toBe(-1);
  expect(inner.children.slice(0, 2).map((node) => node.dataset['role'])).toEqual(['broadside-eyebrow', 'broadside-title']);
  expect(inner.children.at(-1)).toBe(pager);
  expect(scroll.children).not.toContain(pager);
  expect(study.dataset['more']).toBe('true');
  expect(study.children.at(-1)?.textContent).toBe('More below ↓');
  scroll.clientHeight = 400; scroll.scrollHeight = 720; scroll.scrollTop = 320; scroll.emit('scroll');
  expect(study.dataset['more']).toBe('false');
  expect(study.children.at(-1)?.textContent).toBe('End of principles and notices');
  scroll.scrollTop = 20; scroll.emit('scroll'); expect(study.dataset['more']).toBe('true');
  scroll.focus(); expect(document.activeElement).toBe(scroll);
  expect(inner.classList.contains('print-in')).toBe(false);
});

test('focus, print-in and scroll reset happen on open, never an unchanged render', () => {
  const document = new FakeDocument(), nodes = buildStage(document as FakeDocument & Document);
  const view = createView(nodes, () => false);
  view.update({ phase: 'room', room: 'lots' });
  const inner = document.created.find((node) => node.classList.contains('broadside-scroll'))!;
  const input = document.created.find((node) => node.id === 'seed')!;
  expect(document.activeElement).toBe(nodes.broadside);
  expect(inner.classList.contains('print-in')).toBe(true);
  const classes = inner.className; inner.scrollTop = 37; input.focus();
  view.update({ phase: 'room', room: 'lots' });
  expect(document.activeElement).toBe(input); expect(inner.className).toBe(classes); expect(inner.scrollTop).toBe(37);
  view.update({ phase: 'features', room: 'lots' });
  expect(document.activeElement).toBe(nodes.broadside); expect(inner.scrollTop).toBe(0);
});
