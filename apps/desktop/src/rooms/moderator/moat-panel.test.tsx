import { Children, isValidElement } from 'react';
import type { ChangeEvent, ReactElement, ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import { tokens } from '@castle-control/tokens';
import { readFileSync } from 'node:fs';
import { simulatedDrill } from '../../drill-fixture.js';
import { fixtureReplay, fixtureRules } from '../../moderation-fixture.js';
import { createRuleBench } from '../../moderation-bench.js';
import { ruleBenchLink } from './rule-bench.jsx';
import { MoatHeartbeat } from '../../moat/heartbeat.jsx';
import { buildMoat, windowFor } from '../../moat/moat-model.js';
import { MoatScene } from '../../moat/moat-scene.jsx';
import { MoatReport } from '../../moat/moat-report.jsx';
import { Drill } from './drill.jsx';
import { MarkerInspector, MoatControls, MoatPanel, RuleSpotlight } from './moat-panel.jsx';
import { ruleTally } from '../../moat/moat-model.js';

const model = buildMoat(fixtureReplay, 4000);
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const panel = (html: string) => html.slice(html.indexOf('<section class="moat-panel"'), html.indexOf('<div class="moderator-drill-columns"'));
const [first, second, third] = model.markers.filter(marker => marker.fate === 'held');
if (!first || !second || !third) throw new Error('Expected three stops in the simulated night');

type Props = { children?: ReactNode; onClick?: () => void; onChange?: (event: ChangeEvent<HTMLInputElement>) => void; 'aria-pressed'?: boolean };
function find(tree: ReactNode, predicate: (element: ReactElement<Props>) => boolean): ReactElement<Props>[] {
  const found: ReactElement<Props>[] = [];
  const visit = (node: ReactNode) => Children.forEach(node, child => {
    if (!isValidElement<Props>(child)) return;
    if (predicate(child)) found.push(child);
    visit(child.props.children);
  });
  visit(tree);
  return found;
}

test('the drill opens on the moat: three stamps, a gap, a live summary, and the table is still there', () => {
  const html = renderToStaticMarkup(<Drill result={fixtureReplay} delay_s={4} />);
  const moat = panel(html);
  expect(html.indexOf('class="moat-panel"')).toBeLessThan(html.indexOf('moderator-drill-columns'));
  expect(html).toContain('aria-label="Simulated replay outcomes"');
  expect(moat).toContain('The moat · simulated replay');
  // The chip is for the eye and moves with every stop; the one status region is for a screen reader and settles (see use-settled.ts).
  expect(moat).toMatch(/<span class="moat-live" aria-hidden="true"><span class="cc-chip" data-variant="azure">Held 3 of 40 · simulated<\/span><\/span>/);
  expect(moat).toMatch(/<p[^>]*role="status"[^>]*aria-live="polite"[^>]*>Held 3 of 40 · simulated<\/p>/);
  expect(moat.match(/role="status"/g)).toHaveLength(1);
  expect(moat.match(/role="alert"/g)).toHaveLength(1);
  expect(moat).toContain('35 aired · 3 held · 2 not evaluated');
  expect(moat).toContain('THE GATE · chat delay 4 s');
  expect(moat).toContain('RECORDING GAP');
  expect(moat).toContain('missing, not replayed');
  const stamps = moat.match(/<button type="button" class="moat-stamp"[\s\S]*?<\/button>/g) ?? [];
  expect(stamps).toHaveLength(3);
  for (const stamp of stamps) {
    expect(stamp).toContain('class="cc-chip cc-stamp"');
    expect(stamp).toContain('HELD · NOT ON AIR');
    expect(stamp).toMatch(/rule · (links|repeats|blocked-terms)/);
    expect(stamp).toMatch(/aria-label="Held, not on air: simulated-message-\d+, rule [a-z-]+\. Inspect\."/);
  }
});

test('the table rows name the rule and action, so the table says what the strip shows', () => {
  const html = renderToStaticMarkup(<Drill result={fixtureReplay} delay_s={4} />);
  expect(text(html)).toContain('rule · links · Delete message');
  expect(html).toContain('aria-label="Inspect simulated-message-7"');
});

test('the moat draws ids, times and rule words only: no message text exists in the replay', () => {
  const moat = text(panel(renderToStaticMarkup(<Drill result={fixtureReplay} delay_s={4} />)));
  expect(moat).not.toMatch(/Simulated (viewer|question|repeated)/);
  expect(moat).toContain('message text is never shown');
  expect(moat).toContain('Nothing here is live and nothing was sent to Twitch');
});

test('every control in the panel has a name, ids are unique and the range has one standalone label', () => {
  const html = panel(renderToStaticMarkup(<Drill result={fixtureReplay} delay_s={4} />));
  for (const button of html.match(/<button\b[^>]*>[\s\S]*?<\/button>/g) ?? []) {
    expect(text(button) || /aria-label="[^"]+"/.test(button)).toBeTruthy();
  }
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
  expect(new Set(ids).size).toBe(ids.length);
  const label = html.match(/<label\b[^>]*\bfor="([^"]+)"[^>]*>Replay position<\/label>/);
  expect(label).toBeTruthy();
  const range = html.match(/<input\b[^>]*type="range"[^>]*>/)?.[0] ?? '';
  expect(range).toContain(`id="${label?.[1]}"`);
  expect(range).toMatch(/aria-valuetext="replay \d\d:\d\d:\d\d · 40 of 40"/);
  expect(range).not.toMatch(/aria-label=/);
  expect(html).toContain('role="group" aria-label="Speed"');
  expect(html.match(/aria-pressed="true"[^>]*>8×</g)).toHaveLength(1);
  expect(html).not.toMatch(/onkeydown|keydown/i);
});

test('controls call the player: play, pause, speed and a scrub that pauses', () => {
  const calls = { play: vi.fn(), pause: vi.fn(), seek: vi.fn(), speed: vi.fn() };
  const state = { playhead_ms: 1200, run_ms: 90000, playing: false, speed: 8 } as const;
  const view = (playing: boolean) => MoatControls({ state: { ...state, playing }, ticks: [], position: 'replay', reduced: false, range_id: 'range',
    on_play: calls.play, on_pause: calls.pause, on_seek: calls.seek, on_speed: calls.speed });
  const named = (tree: ReactNode, name: string) => find(tree, element => Children.toArray(element.props.children).join('') === name)[0];
  named(view(false), 'Play')?.props.onClick?.();
  expect(calls.play).toHaveBeenCalledOnce();
  named(view(true), 'Pause')?.props.onClick?.();
  expect(calls.pause).toHaveBeenCalledOnce();
  named(view(false), '60×')?.props.onClick?.();
  expect(calls.speed).toHaveBeenCalledWith(60);
  const [range] = find(view(false), element => element.props.onChange !== undefined);
  // The range counts thousandths of the replay, so the far end is always a value the browser accepts.
  range?.props.onChange?.({ currentTarget: { value: '50' } } as ChangeEvent<HTMLInputElement>);
  expect(calls.seek).toHaveBeenCalledWith(4500);
  range?.props.onChange?.({ currentTarget: { value: '1000' } } as ChangeEvent<HTMLInputElement>);
  expect(calls.seek).toHaveBeenLastCalledWith(90000);
  // An awkward run length (not a multiple of any round step) still ends exactly on the finished frame.
  const odd = renderToStaticMarkup(MoatControls({ state: { playhead_ms: 115144, run_ms: 115144, playing: false, speed: 8 }, ticks: [], position: 'replay', reduced: false,
    range_id: 'range', on_play: calls.play, on_pause: calls.pause, on_seek: calls.seek, on_speed: calls.speed }));
  expect(odd).toMatch(/<input[^>]*max="1000"[^>]*step="1"[^>]*value="1000"/);
});

test('stop buttons appear with the panel, jump on press and disable at either end', () => {
  const on_stop = vi.fn();
  const state = { playhead_ms: 0, run_ms: 90000, playing: false, speed: 8 } as const;
  const view = (can_stop: { previous: boolean; next: boolean }) => MoatControls({ state, ticks: [], position: 'replay', reduced: false, range_id: 'range',
    on_play: vi.fn(), on_pause: vi.fn(), on_seek: vi.fn(), on_speed: vi.fn(), on_stop, can_stop });
  const named = (tree: ReactNode, name: string) => find(tree, element => Children.toArray(element.props.children).join('') === name)[0];
  named(view({ previous: false, next: true }), 'Next stop')?.props.onClick?.();
  expect(on_stop).toHaveBeenCalledWith(1);
  named(view({ previous: true, next: true }), 'Previous stop')?.props.onClick?.();
  expect(on_stop).toHaveBeenLastCalledWith(-1);
  expect(renderToStaticMarkup(view({ previous: false, next: true }))).toMatch(/<button[^>]*disabled=""[^>]*>Previous stop<\/button>/);
  expect(renderToStaticMarkup(view({ previous: true, next: false }))).toMatch(/<button[^>]*disabled=""[^>]*>Next stop<\/button>/);
  const html = panel(renderToStaticMarkup(<Drill result={fixtureReplay} delay_s={4} />));
  expect(html).toContain('role="group" aria-label="Stopped messages"');
  expect(html).toMatch(/<button[^>]*>Next stop<\/button>/);
});

test('the same panel renders for the core drill with no invented delay', () => {
  const html = renderToStaticMarkup(<Drill result={fixtureReplay} origin="core" />);
  const moat = panel(html);
  expect(moat).toContain('>THE GATE<');
  expect(moat).not.toContain('chat delay');
  expect(html).toContain('Simulated replay from the local core');
});

test('stamps drop only when a held message reaches the gate, and stack when they would overlap', () => {
  const at = (playhead_ms: number, selected?: number) => renderToStaticMarkup(<MoatScene model={model} playhead_ms={playhead_ms}
    window={windowFor(model, playhead_ms)} selected={selected} on_select={() => undefined} uid="test" />);
  expect(at(0).match(/class="moat-stamp"/g)).toBeNull();
  expect(at(first.offset_ms + model.cross_ms / 2 - 1).match(/class="moat-stamp"/g)).toBeNull();
  expect(at(first.offset_ms + model.cross_ms / 2).match(/class="moat-stamp"/g)).toHaveLength(1);
  const end = at(model.run_ms, third.index);
  expect(end.match(/class="moat-stamp"/g)).toHaveLength(3);
  // The last two stops sit side by side: they take different levels.
  const levels = [...end.matchAll(/data-level="(\d)"/g)].map(match => match[1]);
  expect(levels[1]).not.toBe(levels[2]);
  expect(end.match(/aria-pressed="true"/g)).toHaveLength(1);
  expect(end).toContain(`data-selected="true"`);
  // Waiting dots are hollow, aired dots are not.
  expect(at(0).match(/data-phase="waiting"/g)).toHaveLength(39);
  expect(end.match(/data-phase="aired"/g)).toHaveLength(35);
  expect(end.match(/data-phase="unresolved"/g)).toHaveLength(2);
});

test('a spotlighted rule keeps its own stamps, dims the other stops and always keeps the picked message', () => {
  const draw = (spotlight?: string, selected?: number) => renderToStaticMarkup(<MoatScene model={model} playhead_ms={model.run_ms}
    window={windowFor(model, model.run_ms)} selected={selected} spotlight={spotlight} on_select={() => undefined} uid="test" />);
  expect(draw().match(/class="moat-stamp"/g)).toHaveLength(3);
  expect(draw().match(/data-dim="true"/g)).toBeNull();
  const repeats = draw('repeats');
  expect(repeats.match(/class="moat-stamp"/g)).toHaveLength(1);
  expect(repeats).toContain('rule · repeats');
  expect(repeats).not.toContain('rule · links');
  expect(repeats.match(/data-dim="true"/g)).toHaveLength(2);
  // The aired dots and the unevaluated diamonds are not dimmed: only other rules' stops are.
  expect(repeats.match(/data-phase="aired"/g)).toHaveLength(35);
  // A message picked from the table keeps its stamp so the pick never vanishes.
  expect(draw('repeats', first.index).match(/class="moat-stamp"/g)).toHaveLength(2);
});

test('the spotlight is offered only when two rules stopped something, and a press toggles it', () => {
  const on_rule = vi.fn();
  const tally = ruleTally(model);
  expect(RuleSpotlight({ tally: tally.slice(0, 1), rule: undefined, on_rule })).toBeNull();
  const tree = RuleSpotlight({ tally, rule: undefined, on_rule });
  const html = renderToStaticMarkup(tree);
  expect(html).toContain('<legend>Spotlight a rule</legend>');
  for (const name of ['links · 1', 'repeats · 1', 'blocked-terms · 1']) expect(html).toMatch(new RegExp(`<button[^>]*aria-pressed="false"[^>]*>${name}</button>`));
  const [repeatsButton] = find(tree, element => Children.toArray(element.props.children).join('') === 'repeats · 1');
  repeatsButton?.props.onClick?.();
  expect(on_rule).toHaveBeenLastCalledWith('repeats');
  const pressed = RuleSpotlight({ tally, rule: 'repeats', on_rule });
  expect(renderToStaticMarkup(pressed)).toContain('Stamps for rule repeats only.');
  find(pressed, element => Children.toArray(element.props.children).join('') === 'repeats · 1')[0]?.props.onClick?.();
  expect(on_rule).toHaveBeenLastCalledWith(undefined);
  // The panel carries it, under the legend.
  const panelHtml = panel(renderToStaticMarkup(<Drill result={fixtureReplay} delay_s={4} />));
  expect(panelHtml.indexOf('aria-label="Legend"')).toBeLessThan(panelHtml.indexOf('Spotlight a rule'));
});

test('clicking a stamp or a dot selects that message', () => {
  const on_select = vi.fn();
  const tree = MoatScene({ model, playhead_ms: model.run_ms, window: windowFor(model, model.run_ms), on_select, uid: 'test' });
  const [stamp] = find(tree, element => element.props.onClick !== undefined && (element as { type: unknown }).type === 'button');
  stamp?.props.onClick?.();
  expect(on_select).toHaveBeenCalledWith(first.index);
});

test('the inspector shows state, action and rule, and says so when a field was not recorded', () => {
  const html = renderToStaticMarkup(<MarkerInspector marker={first} />);
  expect(html).toContain(first.message_id);
  expect(text(html)).toContain('Outcome Held · not on air');
  expect(text(html)).toContain('State acted');
  expect(text(html)).toContain('Action Delete message');
  expect(text(html)).toContain('Rule links');
  expect(text(html)).toContain('No message text is stored or shown. Nothing was sent to Twitch.');
  const unknown = model.markers.find(marker => marker.fate === 'unresolved');
  const bare = text(renderToStaticMarkup(<MarkerInspector marker={unknown} />));
  expect(bare).toContain('Outcome Not evaluated');
  expect(bare).toContain('Action none recorded');
  expect(bare).toContain('Rule none recorded');
  expect(bare).toContain('Judge no valid answer');
  const empty = renderToStaticMarkup(<MarkerInspector marker={undefined} />);
  expect(empty).toContain('Nothing selected');
  expect(empty).toContain('data-empty="true"');
});

test('a drill with no usable times says so instead of drawing an empty moat', () => {
  const html = renderToStaticMarkup(<MoatPanel model={buildMoat({ outcomes: [], gaps: [] })} on_select={() => undefined} />);
  expect(text(html)).toContain('No outcome has a usable time');
  expect(html).not.toContain('moat-scene');
});

test('a night of ten thousand renders one page of it and says what it merged', () => {
  const long = buildMoat(simulatedDrill({ seed: 'long', count: 10000 }));
  const html = renderToStaticMarkup(<MoatPanel model={long} on_select={() => undefined} />);
  expect(html).toContain('Showing part of the night');
  expect((html.match(/class="moat-marker"/g) ?? []).length).toBeLessThanOrEqual(360);
  expect((html.match(/<button type="button" class="moat-stamp"/g) ?? []).length).toBeLessThanOrEqual(24);
  expect(text(html)).toMatch(/Held [\d,]+ of 10,000 · simulated/);
});

test('the Keep heartbeat is a labelled loop of the same model, with nothing to press', () => {
  const html = renderToStaticMarkup(<MoatHeartbeat source={fixtureReplay} delay_s={4} />);
  expect(html).toContain('role="img"');
  expect(html).toContain('aria-label="Sample replay loop · simulated"');
  expect(html).toContain('data-compact="true"');
  expect(html).not.toContain('<button');
  expect(html).not.toContain('HELD');
  expect(html).toContain('<small>Sample replay · simulated</small>');
});

test('moat styles use declared tokens, no raw colours and no pixel sizes', () => {
  const css = readFileSync(new URL('../../moat/moat.css', import.meta.url), 'utf8');
  const declared = new Set([...Object.keys(tokens.theme.paper), ...Object.keys(tokens.layout)]);
  for (const [, name] of css.matchAll(/var\(--([\w-]+)/g)) expect(declared.has(name ?? ''), name).toBe(true);
  expect(css).not.toMatch(/#[\da-f]{3,8}\b|\brgba?\(|\bhsla?\(|\b\d+(?:\.\d+)?px\b/i);
  expect(css).toContain('prefers-reduced-motion: reduce');
});

test('a stamped rule opens the rule bench on that rule, and only when the bench can edit it', () => {
  const bench = createRuleBench();
  const link = ruleBenchLink(fixtureRules.rules, bench);
  expect(link.can_open('links')).toBe(true);
  expect(link.can_open('unknown-rule')).toBe(false);
  expect(link.can_open('')).toBe(false);
  expect(link.describe?.('links')).toBe('Links · watching, reports only');
  expect(link.describe?.('nope')).toBeUndefined();
  expect(renderToStaticMarkup(<MarkerInspector marker={first} bench={link} />)).toContain('<small> · Links · watching, reports only</small>');
  link.open('repeats');
  expect(bench.getSnapshot().selection).toBe('repeats');
  const html = renderToStaticMarkup(<MarkerInspector marker={first} bench={link} />);
  expect(html).toMatch(/<a class="moat-open-rule" href="#\/chamber\/moderator" data-rule="links">Open rule links in the rule bench<\/a>/);
  const open = vi.fn();
  const [anchor] = find(MarkerInspector({ marker: first, bench: { can_open: () => true, open } }), element => (element as { type: unknown }).type === 'a');
  anchor?.props.onClick?.();
  expect(open).toHaveBeenCalledWith('links');
  expect(renderToStaticMarkup(<MarkerInspector marker={first} />)).not.toContain('moat-open-rule');
  expect(renderToStaticMarkup(<MarkerInspector marker={first} bench={{ can_open: () => false, open }} />)).not.toContain('moat-open-rule');
});

test('the night report is one sheet of the finished moat, the gaps and every stop, in paper tokens', () => {
  const html = renderToStaticMarkup(<MoatReport model={model} uid="sheet"
    info={{ source: fixtureReplay.source, instrument_hash: fixtureReplay.instrument_hash, origin: 'fixture' }} delay_s={4} />);
  expect(html).toContain('data-theme="paper"');
  expect(text(html)).toContain('Gatehouse night report');
  expect(text(html)).toContain('Held 3 of 40 · simulated');
  expect(text(html)).toContain('missing, not replayed');
  expect(text(html)).toContain('illustrative fixture value');
  expect(html.match(/<tr>/g)).toHaveLength(4);
  expect(html.match(/<span class="moat-stamp"/g)).toHaveLength(3);
  expect(html).not.toContain('<button');
  for (const row of [first, second, third]) expect(html).toContain(`<td>${row.message_id}</td>`);
  expect(text(html)).not.toMatch(/Simulated (viewer|question|repeated)/);
  const none = renderToStaticMarkup(<MoatReport model={buildMoat({ outcomes: [fixtureReplay.outcomes[0] ?? never()], gaps: [] })} uid="x"
    info={{ source: 's', instrument_hash: 'h', origin: 'core' }} />);
  expect(text(none)).toContain('Nothing was stopped at the gate.');
  expect(text(none)).toContain('No recording gaps.');
  expect(text(none)).toContain('reported by core');
});

test('the print button belongs to the panel, and the report waits until it is pressed', () => {
  const html = renderToStaticMarkup(<Drill result={fixtureReplay} delay_s={4} />);
  expect(html).toContain('>Print night report</button>');
  expect(html).not.toContain('data-moat-report');
  expect(html).not.toContain('Gatehouse night report');
});

function never(): never { throw new Error('Expected an outcome'); }
