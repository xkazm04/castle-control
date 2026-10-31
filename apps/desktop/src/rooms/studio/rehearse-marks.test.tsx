import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import { STUDIO_SAMPLE_BOARD } from './fixture.js';
import { balanceReport } from './rehearsal-verdict.js';
import { createRehearseState, reduceRehearse, rehearseView } from './rehearse-state.js';
import type { RehearseAction } from './rehearse-state.js';
import { RehearseWork } from './rehearse.jsx';
import type { RehearseHandlers } from './use-rehearse.js';

const board = STUDIO_SAMPLE_BOARD;
const handlers = (): RehearseHandlers => ({ input: vi.fn(), start: vi.fn(), again: vi.fn(), replay: vi.fn(), step: vi.fn(),
  pause: vi.fn(), resume: vi.fn(), reset: vi.fn(), select: vi.fn(), clear_past: vi.fn(), compare: vi.fn(), clear_sizes: vi.fn(),
  compare_crowds: vi.fn(), clear_crowds: vi.fn(), brush: vi.fn(), paint: vi.fn(), restore_start: vi.fn() });
const render = (...actions: RehearseAction[]) => {
  const state = actions.reduce(reduceRehearse, createRehearseState());
  const view = rehearseView(state, board);
  return { state, view, html: renderToStaticMarkup(<RehearseWork state={state} view={view} handlers={handlers()} board={board} size="m" />) };
};

test('chokepoints carry a diamond and a spoken word on the board, and the marks agree with the report count', () => {
  const { state, view, html } = render({ type: 'start', board, reduced_motion: true });
  const run = state.run;
  if (!run) throw new Error('no run');
  expect(view.contested.size).toBe(balanceReport(run).chokepoints); expect(view.contested.size).toBeGreaterThan(0);
  expect(html.match(/data-contested="true"/g)).toHaveLength(view.contested.size);
  expect(html.match(/class="cc-hex-choke"/g)).toHaveLength(view.contested.size);
  for (const id of view.contested) expect(html).toMatch(new RegExp(`data-hex-tile="${id}"[^>]*aria-label="Tile ${id} [^"]*, chokepoint(, changed owner this turn)?"`));
  expect(html.match(/, chokepoint/g)).toHaveLength(view.contested.size);
});

test('chokepoints appear as they happen: none before a round or on turn one, more as turns go by', () => {
  expect(render().view.contested.size).toBe(0); expect(render().html).not.toContain('cc-hex-choke');
  const one = render({ type: 'start', board, reduced_motion: false }, { type: 'tick' });
  expect(one.view.contested.size).toBe(0); expect(one.html).not.toContain('data-contested');
  const sizes = Array.from({ length: 8 }, (_, index) => render({ type: 'start', board, reduced_motion: false },
    ...Array.from({ length: index + 1 }, (): RehearseAction => ({ type: 'tick' }))).view.contested.size);
  expect(sizes).toEqual([...sizes].sort((a, b) => a - b));
});
