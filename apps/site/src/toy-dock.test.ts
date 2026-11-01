import { expect, test, vi } from 'vitest';
import { artHooks } from '@castle-control/keep-art';
import { buildStage } from './stage.ts';
import { createView } from './view.ts';
import { FakeDocument } from './test-dom.ts';
import type { FakeNode } from './test-dom.ts';
import type { SiteRoom } from './route.ts';
import { initialClaims, tallyHex } from './toys.ts';
import { resolveKey } from './keymap.ts';

function fixture(reduced = true, seed?: string) {
  const document = new FakeDocument(), nodes = buildStage(document as FakeDocument & Document);
  const view = createView(nodes, () => reduced, seed);
  const open = (room: SiteRoom): void => view.update({ phase: 'room', room });
  function panel(room: SiteRoom): FakeNode {
    return document.created.find((node) => node.classList.contains('toy-panel') && node.dataset['room'] === room)!;
  }
  function role(room: SiteRoom, name: string): FakeNode {
    const find = (node: FakeNode): FakeNode | undefined => node.dataset['role'] === name ? node
      : node.children.map(find).find((child) => child !== undefined);
    return find(panel(room))!;
  }
  const submit = (room: SiteRoom): void => panel(room).children.find((node) => node.tagName === 'FORM')!.emit('submit');
  return { document, nodes, view, open, panel, role, submit, reduce: (): void => { reduced = true; } };
}

test('dock preserves seeds, verdict, slider and claims across room switches with no new DOM', () => {
  const { document, view, open, role, submit } = fixture();
  const inventory = document.created.length;
  open('lots'); role('lots', 'toy-input').value = ' LANTERNS '; submit('lots');
  expect(role('lots', 'toy-result').textContent).toBe('cindergate44');
  expect(role('lots', 'toy-proof').textContent).toBe('FNV-1a("lanterns") = 7e90abd4 → lot 09 of 12');
  expect(document.created.find((node) => node.id === artHooks.lotWheel)?.style.transition).toBe('none');
  open('gate'); role('gate', 'toy-input').value = 'example.com'; submit('gate');
  expect(role('gate', 'toy-result').textContent).toBe('Held · not on air');
  expect(role('gate', 'toy-result').style.color).toBe('var(--gules-text)');
  const held = document.created.find((node) => node.classList.contains('stampslot')
    && node.children.some((child) => child.dataset['stamp'] === 'held'))!;
  const pass = document.created.find((node) => node.classList.contains('stampslot')
    && node.children.some((child) => child.dataset['stamp'] === 'pass'))!;
  expect(held.hidden).toBe(false); expect(pass.hidden).toBe(true);
  open('beacons'); const slider = role('beacons', 'toy-input'); slider.value = '120'; slider.emit('input');
  expect(role('beacons', 'toy-result').textContent).toBe('100% blaze');
  expect(document.created.find((node) => node.id === artHooks.altarFlame)?.style.transform).toBe('scale(1.500)');
  open('map'); const hex = document.created.find((node) => node.classList.contains(artHooks.hex))!; hex.click();
  expect(hex.style.fill).toBe('var(--art-gules)');
  open('lots'); expect(role('lots', 'toy-input').value).toBe(' LANTERNS ');
  expect(role('lots', 'toy-result').textContent).toBe('cindergate44');
  open('gate'); expect(role('gate', 'toy-result').textContent).toBe('Held · not on air');
  role('gate', 'toy-input').value = 'hello keep'; submit('gate');
  expect(role('gate', 'toy-result').textContent).toBe('Pass');
  expect(role('gate', 'toy-result').style.color).toBe('var(--azure-text)');
  expect(held.hidden).toBe(true); expect(pass.hidden).toBe(false);
  open('beacons'); expect(slider.value).toBe('120'); expect(role('beacons', 'toy-result').textContent).toBe('100% blaze');
  open('map'); expect(hex.style.fill).toBe('var(--art-gules)');
  view.update({ phase: 'features', room: 'map' }); expect(hex.getAttribute('role')).toBe('button');
  expect(document.created.length).toBe(inventory);
});

test('lanterns turns the wheel for 2200ms and lands ticket 09 at the pointer (105 degrees mod 360)', () => {
  vi.useFakeTimers();
  try {
    const { document, open, role, submit } = fixture(false);
    const wheel = document.created.find((node) => node.id === artHooks.lotWheel)!;
    const before = wheel.style.transform;
    open('lots'); submit('lots');
    expect(role('lots', 'toy-result').textContent).toBe('Turning…');
    expect(role('lots', 'toy-proof').textContent).toContain('7e90abd4');
    expect(wheel.style.transition).toBe('transform 2200ms cubic-bezier(.12,.62,.16,1)');
    expect(wheel.style.transform).toBe('rotate(1185deg)');
    expect(wheel.style.transform).not.toBe(before);
    const degrees = Number(/^rotate\(([-\d.]+)deg\)$/.exec(wheel.style.transform)?.[1]);
    expect(degrees % 360).toBe(105);
    expect(degrees % 360).toBe((-(8 * 30 + 15) % 360 + 360) % 360);
    expect(role('lots', 'toy-go').disabled).toBe(true);
    open('gate'); vi.advanceTimersByTime(2199); expect(role('lots', 'toy-result').textContent).toBe('Turning…');
    vi.advanceTimersByTime(1); open('lots');
    expect(role('lots', 'toy-result').textContent).toBe('cindergate44');
    expect(role('lots', 'toy-go').disabled).toBe(false);
    const drawn = document.created.find((node) => node.dataset['stamp'] === 'sealed')!;
    expect(drawn.children.at(-1)?.textContent).toBe('Drawn'); expect(drawn.dataset['land']).toBe('');
    expect(document.created.some((node) => node.classList.contains('toy-bleed'))).toBe(true);
    const slot = document.created.find((node) => node.classList.contains('stampslot') && node.children.includes(drawn))!;
    expect(slot.hidden).toBe(false);
    expect(slot.children.some((node) => node.classList.contains('toy-bleed'))).toBe(true);
    expect(wheel.style.transform).toBe('rotate(1185deg)');
    submit('lots'); vi.advanceTimersByTime(2200);
    expect(Number(/^rotate\(([-\d.]+)deg\)$/.exec(wheel.style.transform)?.[1]) % 360).toBe(105);
  } finally { vi.useRealTimers(); }
});

test('validated seed draws once on initial lots open; reduced motion is immediate; history holds last three', () => {
  const { document, open, role, submit } = fixture(true, 'lanterns');
  open('lots'); expect(role('lots', 'toy-result').textContent).toBe('cindergate44');
  for (const seed of ['second', 'third', 'fourth']) { role('lots', 'toy-input').value = seed; submit('lots'); }
  const history = role('lots', 'toy-history').textContent!;
  expect(history.split('   ·   ')).toHaveLength(3); expect(history).not.toContain('lanterns');
  open('gate'); open('lots'); expect(role('lots', 'toy-history').textContent).toBe(history);
  expect(role('lots', 'toy-input').value).toBe('fourth');
  role('lots', 'toy-input').value = ' '; submit('lots');
  expect(role('lots', 'toy-proof').textContent).toBe('Type a seed word first.');
  expect(document.created.filter((node) => node.dataset['land'] !== undefined)).toHaveLength(0);
});

test('enabling reduced motion settles a pending draw immediately and cancels its timer', () => {
  vi.useFakeTimers();
  try {
    const { document, open, role, submit, reduce } = fixture(false);
    open('lots'); submit('lots'); reduce(); open('lots');
    expect(role('lots', 'toy-result').textContent).toBe('cindergate44');
    expect(document.created.find((node) => node.id === artHooks.lotWheel)?.style.transition).toBe('none');
    vi.advanceTimersByTime(2200);
    expect(role('lots', 'toy-history').textContent).toBe('lanterns → cindergate44');
    expect(role('lots', 'toy-go').disabled).toBe(false);
  } finally { vi.useRealTimers(); }
});

test('hexes are live only in map; scoped keymap cycles and tallies, including wrap to open', () => {
  const { document, nodes, view, open, role } = fixture();
  const hexes = document.created.filter((node) => node.classList.contains(artHooks.hex));
  open('lots'); hexes[0]!.click(); expect(view.liveHex()).toBe(false);
  expect(hexes.every((hex) => hex.getAttribute('role') === null && hex.getAttribute('tabindex') === null)).toBe(true);
  open('map'); const hex = hexes[0]!;
  expect(hex.getAttribute('role')).toBe('button'); expect(hex.getAttribute('tabindex')).toBe('0');
  expect(hex.getAttribute('aria-label')).toBe('Hex 1: open ground'); hex.focus();
  const before = tallyHex(initialClaims());
  for (const [key, house, paint] of [['Enter', 'House Gules', 'art-gules'], [' ', 'House Azure', 'art-azure']] as const) {
    const action = resolveKey({ key }, { level: 1, liveHex: view.liveHex() });
    expect(action).toEqual({ type: 'claim' }); if (action && action !== 'blur' && action.type === 'claim') view.claimHex();
    expect(hex.getAttribute('aria-label')).toBe(`Hex 1: ${house}`); expect(hex.style.fill).toBe(`var(--${paint})`);
  }
  expect(role('map', 'toy-result').children.map((node) => node.textContent)).toEqual([
    `Gules ${before[0]}`, `Azure ${before[1] + 1}`, `Or ${before[2]}`,
  ]);
  hex.click(); hex.click(); expect(hex.getAttribute('aria-label')).toBe('Hex 1: open ground');
  open('gate'); expect(view.liveHex()).toBe(false); hex.click(); open('map');
  expect(hex.getAttribute('aria-label')).toBe('Hex 1: open ground');
  open('steward'); expect(nodes.toy.hidden).toBe(true);
});

test('each working toy retains its honesty stamp and explanation', () => {
  const { document, open, panel, role } = fixture();
  for (const [room, stamp] of [['lots', 'sample'], ['gate', 'simulated'], ['beacons', 'simulated'], ['map', 'sample']] as const) {
    open(room); expect(panel(room).hidden).toBe(false);
    expect(panel(room).children[0]?.children[1]?.dataset['stamp']).toBe(stamp);
    expect(role(room, 'toy-note').textContent).toBeTruthy(); expect(role(room, 'toy-claim').textContent).toBeTruthy();
  }
  expect(document.created.find((node) => node.id === artHooks.altarFlame)?.style.transition).toBe('none');
});
