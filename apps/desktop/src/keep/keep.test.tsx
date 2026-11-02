import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { Children, isValidElement, useState } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { chambers } from '@castle-control/ui';
import type { ModuleId } from '@castle-control/ui';
import { proposalQueue, SimulatedSteward } from '@castle-control/ui/steward';
import { renderToStaticMarkup } from 'react-dom/server';
import { KeepEntrance, Keep } from './keep.jsx';
import { keepReadModel } from './read-model.js';
import { simulatedRead } from '../simulated.js';
import { fixtureVisuals } from '../beacons-fixture.js';
import { fixtureHeld } from '../moderation-fixture.js';
import { dispatchShortcut } from '../navigation.js';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const snapshot = { mode: 'fixture', phase: 'ready', ...simulatedRead(1) } as const;
const render = () => renderToStaticMarkup(<Keep snapshot={snapshot} on_open={vi.fn()} on_enter={vi.fn()} />);
beforeEach(() => { for (const proposal of proposalQueue.pending()) proposalQueue.tearUp(proposal.id); });
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

test('entrance actions keep their existing behaviour', () => {
  const enter = vi.fn(); const demo = vi.fn(); const stream = vi.fn(); const rehearsal = vi.fn();
  const entry = KeepEntrance({ on_enter: enter, on_demo: demo, on_stream: stream, on_rehearsal: rehearsal });
  for (const button of entry.props.children) button.props.onClick();
  expect(enter).toHaveBeenCalledOnce(); expect(demo).toHaveBeenCalledOnce(); expect(stream).toHaveBeenCalledOnce();
  expect(rehearsal).toHaveBeenCalledOnce();
});

test('optional entrance actions are consistently disabled without a navigation callback', () => {
  const entry = KeepEntrance({ on_enter: vi.fn() });
  expect(entry.props.children[0].props.disabled).not.toBe(true);
  for (const button of entry.props.children.slice(1)) {
    expect(button.props.disabled).toBe(true);
    expect(button.props.onClick).toBeUndefined();
  }
});

test('four arched windows and plaques carry the chamber art and authoritative readings', () => {
  const read = keepReadModel(snapshot);
  expect(read.states.moderator.word).toBe(`${fixtureHeld.length} held`);
  expect(read.states.lottery.word).toBe('No draw');
  expect(read.states.visuals.word).toBe(fixtureVisuals[0]?.name);
  expect(read.states.studio.word).toBe('Duel · semifinal');
  expect(read.states.studio.plaque).toEqual({ word: 'Chat duel', line: 'Sample tournament · semifinal' });
  const html = render();
  const studio = html.split('data-role="plaque" data-room="studio"')[1]?.split('</div></div>')[0] ?? '';
  expect(studio).toContain('data-role="plaque-word">Chat duel'); expect(studio).not.toMatch(/sand table|war table|local test/i);
  for (const chamber of chambers) {
    const state = read.states[chamber.id];
    expect(html).toContain(`data-room-tile="${chamber.id}"`);
    expect(html).toContain(`aria-label="Open chamber ${chamber.number}, ${chamber.name}: ${state.word}, ${state.line}"`);
    const plaque = html.split(`data-role="plaque" data-room="${chamber.id}"`)[1]?.split('</div></div>')[0];
    expect(plaque).toContain(`data-role="plaque-name"><span class="keep-disc">${chamber.number}</span>${chamber.name}`);
    expect(plaque).toContain(`data-role="plaque-word">${state.plaque?.word ?? state.word}`);
    expect(plaque).toContain(`data-role="plaque-line">${state.plaque?.line ?? state.line}`);
  }
  expect(html.match(/data-role="plaque"/g)).toHaveLength(4);
  expect(html.match(/data-role="keep-window"/g)).toHaveLength(4);
  for (const art of ['urn', 'altar', 'hexmap']) expect(html).toContain(`/art/preset-heraldic-${art}.webp`);
  expect(html).toContain('class="keep-portcullis"');
  expect(html.match(/class="keep-crest"/g)).toHaveLength(2);
  expect(html).toContain('fixture mode · sample evening');
  expect(html).toContain('Point at a room, or press 1 to 4. The brightest window needs you.');
  expect(html).toContain('Stylised illustration · drawn, not captured');
  expect(html).toContain('The moat · <span class="keep-delay">chat delay 4 s</span>');
  expect(html.indexOf('data-role="keep-vlabel"')).toBeLessThan(html.indexOf('data-role="keep-sill"'));
  expect(html).toContain('Enter the keep <kbd class="cc-kbd">0</kbd>');
  expect(html).toContain('data-demo-entry');
});

test('honesty stamps follow fixture room provenance and omit absent core stamps', () => {
  const fixture = keepReadModel(snapshot);
  expect(fixture.states.lottery.stamp).toEqual({ kind: 'simulated' });
  expect(fixture.states.visuals.stamp).toEqual({ kind: 'simulated' });
  expect(fixture.states.moderator.stamp).toEqual({ kind: 'shadow', word: 'Shadow · 3' });
  expect(fixture.states.studio.stamp).toEqual({ kind: 'simulated' });
  expect(keepReadModel({ mode: 'fixture', phase: 'ready' }).states.moderator.stamp).toEqual({ kind: 'shadow' });
  const core = keepReadModel({ mode: 'core', phase: 'ready', ...simulatedRead(1) });
  for (const { id } of chambers) {
    expect(core.states[id].word).toBe('Ready');
    if (id !== 'moderator') expect(core.states[id].line).toContain('ask the Steward');
    expect(core.states[id]).not.toHaveProperty('stamp');
  }
  const html = renderToStaticMarkup(<Keep snapshot={{ mode: 'core', phase: 'ready' }} on_open={vi.fn()} on_enter={vi.fn()} />);
  expect(html).toContain('tonight’s keep · chamber readings');
  expect(html).not.toContain('data-stamp=');
  expect(html).not.toContain('<small>simulated</small>');
});

test('a pending chamber proposal adds its drafted outline and pin while preserving the reading', async () => {
  await new SimulatedSteward().ask('draft a question draw', { surface: 'keep' });
  const html = render();
  expect(html).toContain('class="keep-plaque drafted" data-role="plaque" data-room="lottery"');
  expect(html.match(/class="pin">DRAFT · NOT ON AIR/g)).toHaveLength(1);
  expect(html).toContain('data-role="plaque-word">No draw');
  for (const proposal of proposalQueue.pending()) proposalQueue.tearUp(proposal.id);
  expect(render()).not.toContain('keep-plaque drafted');
});

type HitProps = { 'data-room-tile'?: ModuleId; children?: ReactNode; onPointerEnter: () => void; onPointerLeave: () => void; onFocus: () => void; onBlur: () => void; onClick: () => void };
function hits(node: ReactNode): ReactElement<HitProps>[] {
  return Children.toArray(node).flatMap(child => {
    if (!isValidElement<HitProps>(child)) return [];
    return child.props['data-room-tile'] ? [child] : hits(child.props.children);
  });
}

test.each(['pointer', 'focus'] as const)('%s lights only its chamber, leaves the caption steady, and clears on leave', kind => {
  for (const chamber of chambers) {
    const trees: ReactNode[] = [];
    function Journey() {
      const [step, next] = useState(0);
      const tree = Keep({ snapshot, on_open: vi.fn(), on_enter: vi.fn() });
      const hit = hits(tree).find(item => item.props['data-room-tile'] === chamber.id);
      if (!hit) throw new Error('Missing Keep hit');
      trees.push(tree);
      if (step === 0) { (kind === 'pointer' ? hit.props.onPointerEnter : hit.props.onFocus)(); next(1); }
      if (step === 1) { (kind === 'pointer' ? hit.props.onPointerLeave : hit.props.onBlur)(); next(2); }
      return tree;
    }
    renderToStaticMarkup(<Journey />);
    const readings = trees.map(tree => renderToStaticMarkup(tree));
    expect(readings[1]).toContain(`data-room="${chamber.id}" data-module="${chamber.id}" data-active=""`);
    expect(readings[1]?.match(/data-active=""/g)).toHaveLength(1);
    expect(readings[1]).toContain('data-role="keep-name">The Keep</h1>');
    expect(readings.at(-1)).toContain('Point at a room, or press 1 to 4.');
    expect(readings.at(-1)).not.toContain('data-active=');
  }
});

test('the room that needs you burns brightest, with a calm reduced-motion state', () => {
  const html = render();
  expect(html.match(/data-needs-you="true"/g)).toHaveLength(1);
  expect(html).toContain('data-role="keep-window" data-room="moderator" data-needs-you="true"');
  expect(html).toContain('class="keep-needs">needs you');
  const core = renderToStaticMarkup(<Keep snapshot={{ mode: 'core', phase: 'ready' }} on_open={vi.fn()} on_enter={vi.fn()} />);
  expect(core).not.toContain('data-needs-you');
  const css = readFileSync(new URL('./keep.css', import.meta.url), 'utf8');
  expect(css).toContain('.keep-window.is-needed .keep-glass { animation: keep-breathe');
  expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*\.keep-window.is-needed .keep-glass \{ animation: none/);
});

test('each real hit opens its chamber immediately', () => {
  const open = vi.fn();
  function Journey() {
    const tree = Keep({ on_open: open, on_enter: vi.fn() });
    for (const hit of hits(tree)) hit.props.onClick();
    return tree;
  }
  renderToStaticMarkup(<Journey />);
  expect(open.mock.calls.map(call => call[0])).toEqual(chambers.map(chamber => chamber.id));
});

test('keys 1–4 use the existing keymap and open the same rooms as the window clicks', () => {
  const open = vi.fn();
  function Journey() {
    const tree = Keep({ on_open: open, on_enter: vi.fn() });
    for (const chamber of chambers) {
      const hit = hits(tree).find(item => item.props['data-room-tile'] === chamber.id);
      dispatchShortcut({ key: chamber.number, preventDefault: vi.fn() }, false, id => {
        expect(id).toBe(chamber.id); hit?.props.onClick();
      }, undefined);
    }
    return tree;
  }
  renderToStaticMarkup(<Journey />);
  expect(open.mock.calls.map(call => call[0])).toEqual(chambers.map(chamber => chamber.id));
});

test('the retired room drawing has no remaining production importer', () => {
  const source = new URL('../', import.meta.url);
  const retired = 'ChamberArt';
  for (const path of readdirSync(source, { recursive: true, withFileTypes: true })) {
    if (!path.isFile() || !/\.[jt]sx?$/.test(path.name) || /\.test\./.test(path.name)) continue;
    expect(readFileSync(join(path.parentPath, path.name), 'utf8'), path.name).not.toContain(retired);
  }
});

test('the moat bar carries a labelled sample heartbeat in the fixture and a quiet empty moat in a core room', () => {
  const fixture = renderToStaticMarkup(<Keep snapshot={{ mode: 'fixture', phase: 'ready', ...simulatedRead(1) }} on_open={vi.fn()} on_enter={vi.fn()} />);
  const bar = fixture.slice(fixture.indexOf('class="keep-moat km"'));
  expect(bar).toContain('class="keep-moatlab km__label" data-role="moat-label"');
  expect(bar).not.toContain('class="keep-moat km" data-role="moat-label"');
  expect(bar).toContain('The moat · <span class="keep-delay">chat delay 4 s</span>');
  expect(bar).toContain('role="img" aria-label="Sample replay loop · simulated"');
  expect(bar).toContain('<a class="keep-moat-link cc-link" href="#/chamber/moderator/drill">Watch the full replay</a>');
  const core = renderToStaticMarkup(<Keep snapshot={{ mode: 'core', phase: 'ready', ...simulatedRead(1) }} on_open={vi.fn()} on_enter={vi.fn()} />);
  expect(core).toContain('The moat · <span>chat delay set in the Gatehouse</span>');
  expect(core).not.toContain('class="keep-delay"');
  // Core never shows the sample loop; the card holds the quiet, empty moat instead of an empty box.
  expect(core).not.toContain('Sample replay loop · simulated');
  expect(core).toContain('class="moat-heartbeat" data-quiet="true"');
  expect(core).not.toContain('keep-moat-link');
});
