import { Children, isValidElement } from 'react';
import type { ChangeEvent, ReactNode } from 'react';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import { StudioWork } from './room.jsx';
import Room from './room.jsx';
import { STUDIO_SAMPLE_BOARD } from './fixture.js';
import { parseStudioBoard } from './board.js';
import { boardForSize } from './session.js';
import { createRehearseState, reduceRehearse, rehearseView } from './rehearse-state.js';
import type { RehearseAction, RehearseState } from './rehearse-state.js';
import { rehearseCopy as copy } from './rehearse-copy.js';
import { RehearseControls, RehearseWork, SimulatedBand } from './rehearse.jsx';
import { RehearseSide } from './rehearse-side.jsx';
import type { RehearseHandlers } from './use-rehearse.js';

const BAND = 'SIMULATED REHEARSAL · no viewers, no identities, no Extension state · sample territory';
const board = STUDIO_SAMPLE_BOARD;
const apply = (...actions: RehearseAction[]): RehearseState => actions.reduce(reduceRehearse, createRehearseState());
const ticks = (count: number): RehearseAction[] => Array.from({ length: count }, () => ({ type: 'tick' }));
const start: RehearseAction = { type: 'start', board, reduced_motion: false };
const handlers = (): RehearseHandlers => ({ input: vi.fn(), start: vi.fn(), again: vi.fn(), replay: vi.fn(), step: vi.fn(),
  pause: vi.fn(), resume: vi.fn(), reset: vi.fn(), select: vi.fn(), clear_past: vi.fn() });
function work(state: RehearseState, on = board, h = handlers()) {
  return <RehearseWork state={state} view={rehearseView(state, on)} handlers={h} board={on} size="m" />;
}
function side(state: RehearseState, on = board, h = handlers()) {
  return <RehearseSide state={state} view={rehearseView(state, on)} handlers={h} />;
}

const states: readonly (readonly [string, RehearseState])[] = [
  ['idle', createRehearseState()],
  ['bad viewers', apply({ type: 'input', field: 'viewers', value: '3' }, start)],
  ['bad seed', apply({ type: 'input', field: 'seed', value: ' ' }, start)],
  ['starting', apply(start)],
  ['mid-round', apply(start, ...ticks(3))],
  ['paused', apply(start, ...ticks(2), { type: 'pause' })],
  ['finished', apply({ type: 'start', board, reduced_motion: true })],
  ['replayed', apply({ type: 'start', board, reduced_motion: true }, { type: 'replay', reduced_motion: false })],
  ['reset', apply({ type: 'start', board, reduced_motion: true }, { type: 'reset' })],
  ['small board', apply({ type: 'start', board: boardForSize('s'), reduced_motion: true })],
];

test('the loud SIMULATED band is printed, whole, exactly once, first, in every state of the view', () => {
  expect(copy.band).toBe(BAND);
  for (const [name, state] of states) {
    const html = renderToStaticMarkup(work(state));
    expect(html.split(BAND), name).toHaveLength(2);
    expect(html, name).toMatch(/^<section[^>]*studio-rehearse[^>]*><p class="studio-sim-band" role="note"/);
    expect(html, name).toContain('data-simulated="rehearsal"');
  }
  const custom = parseStudioBoard({ title: 'Mine', sides: board.sides, tiles: board.tiles.slice(0, 20) });
  if (!custom.ok) throw new Error(custom.error.message);
  expect(renderToStaticMarkup(work(createRehearseState(), custom.board)).split(BAND)).toHaveLength(2);
  expect(renderToStaticMarkup(<SimulatedBand />)).toContain(BAND);
});

test('the band cannot be dropped from the source: it renders unconditionally at the top of the view', () => {
  const source = readFileSync(new URL('./rehearse.tsx', import.meta.url), 'utf8');
  const lines = source.split(/\r?\n/);
  const open = lines.findIndex(line => line.includes('<section className="studio-rehearse"'));
  expect(open).toBeGreaterThan(0);
  expect(lines[open + 1]?.trim()).toBe('<SimulatedBand />');
  expect(source).toContain('{copy.band}');
  expect(source).not.toMatch(/&& *<SimulatedBand|\? *<SimulatedBand|<SimulatedBand[^>]*hidden/);
  const css = readFileSync(new URL('./rehearse.css', import.meta.url), 'utf8');
  expect(css).not.toMatch(/studio-sim-band[^}]*display:\s*none/);
  const copySource = readFileSync(new URL('./rehearse-copy.ts', import.meta.url), 'utf8');
  for (const word of ['SIMULATED', 'no viewers', 'no identities', 'no Extension state', 'sample territory']) expect(copySource).toContain(word);
});

test('everything the view says about itself stays plainly simulated, with no dash and no network', () => {
  const fetch = vi.spyOn(globalThis, 'fetch');
  try {
    for (const [name, state] of states) {
      const html = renderToStaticMarkup(<>{work(state)}{side(state)}</>);
      expect(html, name).not.toContain('—');
      expect(html, name).not.toMatch(/\bvotes?\b.*\bcounted\b/);
      expect(html, name).not.toContain('<a ');
    }
    const finished = renderToStaticMarkup(side(states[6]?.[1] ?? createRehearseState()));
    expect(finished).toContain('Simulated end state, 9 by 6:');
    expect(renderToStaticMarkup(<StudioWork />)).not.toContain(BAND); // only the Rehearse view carries it
    expect(fetch).not.toHaveBeenCalled();
  } finally { fetch.mockRestore(); }
});

test('Rehearse is the third view in the existing switch and the default stays the table', () => {
  const html = renderToStaticMarkup(<StudioWork />);
  const buttons = (html.match(/<div class="studio-view-switch"[\s\S]*?<\/div>/)?.[0] ?? '').match(/<button[^>]*>[^<]*<\/button>/g) ?? [];
  expect(buttons.map(button => button.replace(/<[^>]*>/g, ''))).toEqual(['Table', 'Spyglass', 'Rehearse']);
  expect(buttons.map(button => button.includes('aria-pressed="true"'))).toEqual([true, false, false]);
  expect(html.match(/data-hex-tile=/g)).toHaveLength(54);
  expect(html).toContain('cc-hero'); // the tile inspector still opens the side
  // Core mode has no Rehearse at all: the room stays honestly bare.
  const core = renderToStaticMarkup(<Room snapshot={{ mode: 'core', phase: 'connecting' }} />);
  expect(core).not.toContain('Rehearse'); expect(core).not.toContain('SIMULATED REHEARSAL');
});

test('the table draws the shown snapshot, outlines this turn\'s flips and leaves the pennants to the ribbon', () => {
  const state = apply(start, ...ticks(3));
  const view = rehearseView(state, board);
  const html = renderToStaticMarkup(work(state));
  const flipped = [...html.matchAll(/data-hex-tile="([A-Z]\d+)"[^>]*data-flipped="([ab])"/g)].map(match => match[1]);
  expect(flipped.sort()).toEqual([...view.flipped].sort());
  expect(flipped.length).toBeGreaterThan(0);
  expect(html.match(/data-hex-tile=/g)).toHaveLength(54);
  expect(html).not.toContain('cc-pennants');
  expect(html).toContain('Simulated rehearsal · turn 3 of 8');
  const idle = renderToStaticMarkup(work(createRehearseState()));
  expect(idle).not.toContain('data-flipped'); expect(idle).toContain('Simulated rehearsal · starting territory');
  expect(idle).toContain(copy.idle_hint);
});

test('the held-tile ribbon follows the turn, in the houses\' inks, with percentages once it is over', () => {
  const state = apply(start, ...ticks(2));
  const html = renderToStaticMarkup(work(state));
  const held = state.run?.turns[1]?.held ?? {};
  for (const side of board.sides) {
    expect(html).toMatch(new RegExp(`<li data-house="${side.label}" data-ink="${side.ink}" style="flex-grow:${held[side.id]}"><span>${side.short} ${held[side.id]}</span>`));
  }
  expect(html).not.toMatch(/ · \d+%<\/span>/);
  const done = renderToStaticMarkup(work(states[6]?.[1] ?? createRehearseState()));
  expect(done).toMatch(/<span>\w+ \d+ · \d+%<\/span>/);
  expect(renderToStaticMarkup(work(createRehearseState()))).toContain('aria-label="Held tiles by house"');
});

test('each turn is announced politely, and the finish announces the verdict', () => {
  const mid = renderToStaticMarkup(work(apply(start, ...ticks(3))));
  expect(mid).toMatch(/<p class="cc-notice-region studio-rehearse-line" role="status" aria-live="polite" aria-atomic="true"[^>]*>Turn 3: [^<]+<\/p>/);
  expect(mid).toMatch(/role="alert"[^>]*><\/p>/);
  const finished = apply({ type: 'start', board, reduced_motion: true });
  const verdict = rehearseView(finished, board).report?.verdict ?? 'missing';
  expect(renderToStaticMarkup(work(finished))).toContain(`Rehearsal finished. ${verdict}.`);
});

test('the turn log is a ruled feed: played turns only, the latest marked current', () => {
  const html = renderToStaticMarkup(side(apply(start, ...ticks(3))));
  expect(html).toMatch(/<div role="list" aria-label="Simulated turn log" class="cc-feed ">/);
  expect(html.match(/role="listitem"/g)).toHaveLength(3);
  expect(html.match(/aria-current="step"/g)).toHaveLength(1);
  expect(html).toMatch(/aria-current="step" data-current="true"[^>]*><div class="cc-ruled-row"[^>]*><span class="cc-feed-mark">Turn 3<\/span>/);
  expect(renderToStaticMarkup(side(createRehearseState()))).toContain(copy.log_empty);
});

test('the verdict, reading and balance report appear when the round ends, each simulated-only', () => {
  const finished = apply({ type: 'start', board, reduced_motion: true });
  const html = renderToStaticMarkup(side(finished));
  const report = rehearseView(finished, board).report;
  expect(html).toContain(`>${report?.verdict}</p>`);
  expect(html).toContain(report?.reading ?? 'missing');
  for (const label of ['Spread of shares', 'Leader margin', 'Chokepoints', 'Turn of last change', 'Lead changes', 'Replay seed 2041', 'Rehearse again']) {
    expect(html).toContain(label);
  }
  expect(html).toContain('computed from the simulation only');
  const mid = renderToStaticMarkup(side(apply(start, ...ticks(3))));
  expect(mid).not.toContain('studio-verdict'); expect(mid).toContain('Balance report'); expect(mid).toContain('turn 3 of 8');
  expect(renderToStaticMarkup(side(createRehearseState()))).not.toContain('Balance report');
  // The replay result shows at once, while the replay itself is still playing from turn zero.
  const replaying = apply({ type: 'start', board, reduced_motion: true }, { type: 'replay', reduced_motion: false });
  expect(replaying.turn).toBe(0);
  expect(renderToStaticMarkup(work(replaying))).toMatch(/role="status">Seed 2041 replayed: all 8 turns matched\.<\/p>/);
});

test('earlier runs stay beside the board as labelled end states, newest last', () => {
  const state = apply({ type: 'start', board: boardForSize('m'), reduced_motion: true }, { type: 'start', board: boardForSize('s'), reduced_motion: true });
  const html = renderToStaticMarkup(side(state, boardForSize('s')));
  expect(html.match(/class="studio-past"/g)).toHaveLength(2);
  expect(html).toContain('Run 1 · 9 × 6 · 54 tiles'); expect(html).toContain('Run 2 · 6 × 4 · 24 tiles');
  expect(html.match(/<svg class="studio-mini"/g)).toHaveLength(2);
  expect(html).toContain('120 viewers · 8 turns · seed 2041');
  expect(renderToStaticMarkup(side(createRehearseState()))).toContain(copy.compare_hint);
});

type Props = { onChange?: (event: ChangeEvent<HTMLInputElement>) => void; onClick?: () => void; id?: string; children?: ReactNode; disabled?: boolean };
function collect(tree: ReactNode): Props[] {
  const found: Props[] = [];
  Children.forEach(tree, child => {
    if (!isValidElement<Props>(child)) return;
    if (child.props.onChange || child.props.onClick) found.push(child.props);
    found.push(...collect(child.props.children));
  });
  return found;
}
const textOf = (props: Props): string => Children.toArray(props.children).filter(child => typeof child === 'string').join('');

test('the fields and buttons reach the reducer through the handlers and nothing is a key listener', () => {
  const h = handlers();
  const controls = collect(RehearseControls({ state: createRehearseState(), view: rehearseView(createRehearseState(), board), handlers: h }));
  for (const [id, field] of [['studio-rehearse-viewers', 'viewers'], ['studio-rehearse-seed', 'seed'], ['studio-rehearse-turns', 'turns']] as const) {
    controls.find(control => control.id === id)?.onChange?.(Object.assign({} as ChangeEvent<HTMLInputElement>, { currentTarget: { value: '77' } }));
    expect(h.input).toHaveBeenLastCalledWith(field, '77');
  }
  const buttons = controls.filter(control => control.onClick);
  expect(buttons.map(textOf)).toEqual(['Play round', 'Step', 'Reset']);
  buttons.forEach(button => button.onClick?.());
  expect(h.start).toHaveBeenCalledTimes(1); expect(h.step).toHaveBeenCalledTimes(1); expect(h.reset).toHaveBeenCalledTimes(1);
  const source = readFileSync(new URL('./rehearse.tsx', import.meta.url), 'utf8') + readFileSync(new URL('./use-rehearse.ts', import.meta.url), 'utf8');
  expect(source).not.toMatch(/keydown|keyup|addEventListener/);
});

test('the primary button follows the round: Play round, Pause, Resume, Rehearse again', () => {
  const label = (state: RehearseState) => collect(RehearseControls({ state, view: rehearseView(state, board), handlers: handlers() }))
    .filter(control => control.onClick).map(textOf)[0];
  expect(label(createRehearseState())).toBe('Play round');
  expect(label(apply(start, ...ticks(2)))).toBe('Pause');
  expect(label(apply(start, ...ticks(2), { type: 'pause' }))).toBe('Resume');
  expect(label(apply({ type: 'start', board, reduced_motion: true }))).toBe('Rehearse again');
  const finished = apply({ type: 'start', board, reduced_motion: true });
  const stepper = collect(RehearseControls({ state: finished, view: rehearseView(finished, board), handlers: handlers() })).filter(control => control.onClick)[1];
  expect(stepper?.disabled).toBe(true);
});

test('an invalid field is announced with its message and wired to its input', () => {
  const html = renderToStaticMarkup(work(apply({ type: 'input', field: 'viewers', value: '3' }, start)));
  expect(html).toContain('role="alert"'); expect(html).toContain('Enter a whole number of simulated viewers from 10 to 1000.');
  expect(html).toMatch(/id="studio-rehearse-viewers"[^>]*aria-invalid="true"[^>]*aria-describedby="studio-rehearse-viewers-hint studio-rehearse-error"/);
  expect(html).toMatch(/id="studio-rehearse-seed"[^>]*aria-invalid="false"/);
});

test('rehearse.css is token-only, flips ink in from the left and goes still for reduced motion', () => {
  const css = readFileSync(new URL('./rehearse.css', import.meta.url), 'utf8');
  expect(css).not.toMatch(/#[\da-f]{3,8}\b|\brgba?\(|\bhsla?\(|\b\d+(?:\.\d+)?px\b/i);
  expect(css).toContain('@keyframes studio-hex-ink-a'); expect(css).toContain('@keyframes studio-hex-ink-b');
  expect(css).toMatch(/studio-hex-ink-a \{\s*from \{[^}]*clip-path: polygon\(0 25%/);
  expect(css).toMatch(/prefers-reduced-motion: reduce\) \{[\s\S]*data-flipped\][\s\S]*animation: none/);
  expect(css).toMatch(/\.studio-verdict[^}]*animation: studio-ink/);
});
