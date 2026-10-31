import { Children, isValidElement } from 'react';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import { STUDIO_SAMPLE_BOARD } from './fixture.js';
import { HexTable } from './hex-table.jsx';
import { createRehearseState, reduceRehearse, rehearseView, sizeChoices } from './rehearse-state.js';
import type { RehearseAction, RehearseState } from './rehearse-state.js';
import { startBoard } from './rehearse-paint.js';
import { RehearseWork } from './rehearse.jsx';
import { CrowdTable, RehearseSide } from './rehearse-side.jsx';
import { PaintPalette, RehearseTools } from './rehearse-tools.jsx';
import type { RehearseHandlers } from './use-rehearse.js';

const BAND = 'SIMULATED REHEARSAL · no viewers, no identities, no Extension state · sample territory';
const board = STUDIO_SAMPLE_BOARD;
const apply = (...actions: RehearseAction[]): RehearseState => actions.reduce(reduceRehearse, createRehearseState());
const painting = (...ids: string[]) => apply({ type: 'brush', side: 'sable' }, ...ids.map((id): RehearseAction => ({ type: 'paint', board, id })));
const handlers = (): RehearseHandlers => ({ input: vi.fn(), start: vi.fn(), again: vi.fn(), replay: vi.fn(), step: vi.fn(),
  pause: vi.fn(), resume: vi.fn(), reset: vi.fn(), select: vi.fn(), clear_past: vi.fn(), compare: vi.fn(), clear_sizes: vi.fn(),
  compare_crowds: vi.fn(), clear_crowds: vi.fn(), brush: vi.fn(), paint: vi.fn(), restore_start: vi.fn() });
const work = (state: RehearseState, on = board) => <RehearseWork state={state} view={rehearseView(state, on)} handlers={handlers()} board={on} size="m" />;
const side = (state: RehearseState, on = board) => <RehearseSide state={state} view={rehearseView(state, on)} handlers={handlers()} />;

type Props = { onClick?: () => void; children?: ReactNode } & Record<string, unknown>;
function collect(tree: ReactNode): Props[] {
  const found: Props[] = [];
  Children.forEach(tree, child => {
    if (!isValidElement<Props>(child)) return;
    if (child.props.onClick) found.push(child.props);
    found.push(...collect(child.props.children));
  });
  return found;
}
const textOf = (props: Props): string => Children.toArray(props.children).filter(child => typeof child === 'string').join('');
const click = (tree: ReactNode, only?: string) => collect(tree).filter(props => only === undefined || textOf(props) === only)
  .forEach(props => props.onClick?.());

test('Redraw start opens a palette with one brush per house and unclaimed, and the band stays on top of it', () => {
  const state = painting('D1');
  const html = renderToStaticMarkup(work(state, startBoard(board, state.edits)));
  expect(html).toContain('studio-palette'); expect(html).toContain('data-painting="true"');
  for (const label of ['Paint with House Quill', 'Paint with House Tallow', 'Paint with House Sable', 'Paint with Unclaimed']) {
    expect(html).toContain(`aria-label="${label}"`);
  }
  expect(html.match(/aria-pressed="true"[^>]*aria-label="Paint with/g)).toHaveLength(1);
  expect(html).toContain('aria-label="Restore the sample territory, 1 tile repainted"'); expect(html).toContain('>Restore (1)</button>');
  expect(html).not.toContain('Redrawn start · 1 tile repainted'); // the count lives on the Restore button while painting
  expect(html).toContain('Simulated rehearsal · redrawing the starting territory');
  expect(html).toContain('D1 painted House Sable. 1 tile differs from the starting territory.');
  expect(html.split(BAND)).toHaveLength(2);
  expect(html).not.toContain('—');
  const idle = renderToStaticMarkup(work(createRehearseState()));
  expect(idle).not.toContain('studio-palette'); expect(idle).toContain('data-painting="false"');
});

test('with no edit yet the palette says how to paint, and Restore sample stays off', () => {
  const html = renderToStaticMarkup(work(apply({ type: 'brush', side: 'quill' })));
  expect(html).toContain('Press or drag across hexes to repaint the starting territory.');
  expect(html).toContain('Only this rehearsal changes; the table and your real map do not.');
  expect(html).toContain('Press Redraw start again when you are done.');
  expect(html).toMatch(/<button[^>]*aria-label="Restore the sample territory"[^>]*disabled=""[^>]*>Restore<\/button>/);
  expect(html).not.toContain('Redrawn start');
  const quiet = apply({ type: 'brush', side: 'tallow' }, { type: 'paint', board, id: 'A1' }, { type: 'brush', side: null });
  const closed = renderToStaticMarkup(work(quiet, startBoard(board, quiet.edits)));
  expect(closed).toContain('Redrawn start · 1 tile repainted'); expect(closed).not.toContain('studio-palette');
  expect(closed).toContain('Compare crowds');
});

test('the palette and tool buttons reach the handlers: a house, unclaimed, restore, the two comparisons and the redraw toggle', () => {
  const h = handlers();
  click(PaintPalette({ board, brush: 'sable', edited: 2, handlers: h }));
  expect(vi.mocked(h.brush).mock.calls.map(call => call[0])).toEqual(['quill', 'tallow', 'sable', '']);
  expect(h.restore_start).toHaveBeenCalledTimes(1);
  const tools = handlers();
  click(RehearseTools({ state: createRehearseState(), handlers: tools, board, can_compare: true }));
  expect(tools.compare).toHaveBeenCalledTimes(1); expect(tools.compare_crowds).toHaveBeenCalledTimes(1);
  expect(vi.mocked(tools.brush).mock.calls.at(-1)?.[0]).toBe('quill');
  const closing = handlers();
  click(RehearseTools({ state: apply({ type: 'brush', side: 'quill' }), handlers: closing, board, can_compare: false }), 'Redraw start');
  expect(closing.brush).toHaveBeenCalledWith(null);
});

const hexes = (tree: ReactNode) => collect(tree).filter(props => 'data-hex-tile' in props);
const buttons = (down: number) => ({ buttons: down }) as never;

test('in paint mode a press, a click or a drag across hexes paints, and an ordinary table is untouched', () => {
  const paint = vi.fn(); const select = vi.fn();
  const live = hexes(HexTable({ selected: '', on_select: select, on_paint: paint, board }));
  expect(live).toHaveLength(54);
  const tile = live.find(props => props['data-hex-tile'] === 'C3');
  if (!tile) throw new Error('no C3');
  const down = tile.onPointerDown as (event: never) => void; const enter = tile.onPointerEnter as (event: never) => void;
  tile.onClick?.(); down(buttons(1)); enter(buttons(1)); enter(buttons(0)); down(buttons(2));
  expect(paint.mock.calls).toEqual([['C3'], ['C3'], ['C3']]); expect(select).not.toHaveBeenCalled();
  const ordinary = hexes(HexTable({ selected: '', on_select: select, board })).find(props => props['data-hex-tile'] === 'C3');
  expect(ordinary?.onPointerDown).toBeUndefined(); expect(ordinary?.onPointerEnter).toBeUndefined();
  ordinary?.onClick?.();
  expect(select).toHaveBeenCalledWith('C3'); expect(paint).toHaveBeenCalledTimes(3);
});

test('Compare crowds shows one row per crowd with its verdict, marks the crowd in the form and can put another in it', () => {
  const crowds = reduceRehearse(createRehearseState(), { type: 'compare_crowds', board }).crowds;
  if (!crowds) throw new Error('no crowds');
  const chosen: number[] = [];
  const html = renderToStaticMarkup(<CrowdTable crowds={crowds} viewers={120} on_viewers={count => chosen.push(count)} on_clear={vi.fn()} />);
  expect(html).toContain('Simulated comparison across crowd sizes');
  expect(html.match(/<tr data-verdict=/g)).toHaveLength(3);
  for (const label of ['30 viewers', '120 viewers', '300 viewers']) expect(html).toContain(label);
  for (const line of crowds.lines) expect(html).toContain(line.verdict);
  expect(html).toContain('8 turns · seed 2041'); expect(html).toContain('In the form');
  expect(html).toContain('aria-label="Use 30 simulated viewers"'); expect(html).toContain('aria-label="Use 300 simulated viewers"');
  expect(html).not.toContain('aria-label="Use 120 simulated viewers"');
  expect(html.match(/<svg class="studio-mini"/g)).toHaveLength(3);
  click(CrowdTable({ crowds, viewers: 120, on_viewers: count => chosen.push(count), on_clear: vi.fn() }));
  expect(chosen).toEqual([30, 300]);
  expect(renderToStaticMarkup(<CrowdTable crowds={crowds} viewers={120} on_clear={vi.fn()} />)).not.toContain('Use 30 simulated viewers');
  expect(renderToStaticMarkup(<CrowdTable crowds={{ ...crowds, edited: 3 }} viewers={120} on_clear={vi.fn()} />)).toContain('redrawn start');
});

test('the side shows the crowd table first once compared, and a size row on a redrawn start says so', () => {
  const sizes = sizeChoices.map(choice => (choice.id === 'm' ? { ...choice, edited: true } : choice));
  const state = reduceRehearse(apply({ type: 'compare_crowds', board }), { type: 'compare_sizes', sizes });
  const html = renderToStaticMarkup(side(state));
  expect(html.indexOf('studio-crowds')).toBeGreaterThan(0);
  expect(html.indexOf('studio-crowds')).toBeLessThan(html.indexOf('studio-sizes'));
  expect(html).toContain('54 tiles · redrawn start');
  expect(renderToStaticMarkup(side(createRehearseState()))).not.toContain('studio-crowds');
});

test('a past run on a redrawn start is marked in the comparison, and a plain one is not', () => {
  const mine = startBoard(board, painting('D1').edits);
  const state = apply({ type: 'brush', side: 'sable' }, { type: 'paint', board, id: 'D1' }, { type: 'start', board: mine, reduced_motion: true });
  expect(renderToStaticMarkup(side(state, mine))).toContain('redrawn start');
  expect(renderToStaticMarkup(side(apply({ type: 'start', board, reduced_motion: true })))).not.toContain('redrawn start');
});

test('every redraw and crowd state keeps the simulated band exactly once and makes no network call', () => {
  const fetch = vi.spyOn(globalThis, 'fetch');
  try {
    const mine = startBoard(board, painting('D1', 'E1').edits);
    const states: readonly (readonly [string, RehearseState, typeof board])[] = [
      ['painting', painting('D1'), board],
      ['played on a redrawn start', apply({ type: 'brush', side: 'sable' }, { type: 'paint', board, id: 'D1' }, { type: 'paint', board, id: 'E1' },
        { type: 'start', board: mine, reduced_motion: true }), mine],
      ['crowds', apply({ type: 'compare_crowds', board }), board],
    ];
    for (const [name, state, on] of states) {
      const html = renderToStaticMarkup(<>{work(state, on)}{side(state, on)}</>);
      expect(html.split(BAND), name).toHaveLength(2); expect(html, name).not.toContain('—'); expect(html, name).not.toContain('<a ');
    }
    expect(fetch).not.toHaveBeenCalled();
  } finally { fetch.mockRestore(); }
});
