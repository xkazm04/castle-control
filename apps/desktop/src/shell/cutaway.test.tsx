import { Children, isValidElement } from 'react';
import type { ReactNode } from 'react';
import { renderToReadableStream, renderToStaticMarkup } from 'react-dom/server';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { chambers, SealButton } from '@castle-control/ui';
import { proposalQueue, SimulatedSteward } from '@castle-control/ui/steward';
import { appRoomTarget, frameTransform, keepRooms } from '@castle-control/keep-art';
import { DesktopView } from '../view.jsx';
import { initialNavigation } from '../navigation.js';
import { simulatedRead } from '../simulated.js';
import { keepReadModel } from '../keep/read-model.js';
import { Overview } from '../overview/overview.jsx';
import * as programStore from '../overview/program.js';
import * as states from './strip-states.js';
import { PersistentStrip, ShellStrip } from './strip.jsx';
import { ProgramColumn } from './program-column.jsx';
import KeepWorkspace from './keep.jsx';
import { RoomHeader, roomCamera } from './room-header.jsx';

const snapshot = { mode: 'fixture', phase: 'ready', ...simulatedRead(1) } as const;
const noop = () => undefined;
beforeEach(() => { for (const proposal of proposalQueue.pending()) proposalQueue.tearUp(proposal.id); proposalQueue.select(); });
afterEach(() => { vi.restoreAllMocks(); });
async function html(node: ReactNode) {
  const stream = await renderToReadableStream(node);
  await stream.allReady;
  return (await new Response(stream).text()).replace(/<!--.*?-->/g, '');
}

test.each(['keep', ...chambers.map(item => `chamber/${item.id}`), 'overview', 'demo', 'stream'])(
  'persistent strip belongs only to Keep and room surfaces: %s', async route => {
    const markup = await html(<DesktopView navigation={initialNavigation(`#/${route}`)} snapshot={snapshot}
      theme="day" on_navigate={noop} on_theme_change={noop} />);
    const persistent = route === 'keep' || route.startsWith('chamber/');
    expect(markup.match(/data-role="strip"/g) ?? []).toHaveLength(persistent ? 1 : 0);
    if (persistent) {
      const strip = markup.match(/<nav[^>]*data-role="strip"[\s\S]*?<\/nav>/)?.[0] ?? '';
      const current = route === 'keep' ? 'keep' : route.split('/')[1];
      expect(strip.match(/aria-current="page"/g)).toHaveLength(1);
      const current_tile = [...strip.matchAll(/<button[^>]*>/g)].find(([tag]) => tag.includes(`data-room="${current}"`));
      expect(current_tile?.[0]).toContain('aria-current="page"');
      expect(strip).not.toContain('data-room-tile=');
      expect(strip.match(/data-role="strip-tile"/g)).toHaveLength(5);
      expect(markup.indexOf('class="cc-rampart"')).toBeLessThan(markup.indexOf('data-role="strip"'));
    } else if (route === 'overview') expect(markup.match(/aria-label="Chamber strip"/g)).toHaveLength(1);
  },
);

type TileProps = { children?: ReactNode; 'data-room'?: string; onFocus?: () => void; onClick?: () => void; onDoubleClick?: () => void };
function tiles(node: ReactNode): TileProps[] {
  return Children.toArray(node).flatMap(child => {
    if (!isValidElement<TileProps>(child)) return [];
    return child.type === 'button' && child.props['data-room'] ? [child.props] : tiles(child.props.children);
  });
}

test('shell tiles focus without routing and single-click opens each chamber or Keep', () => {
  const open = vi.fn(); const keep = vi.fn();
  const tree = ShellStrip({ current: 'keep', states: states.stripStates(snapshot, [], []), on_open: open, on_keep: keep });
  const buttons = tiles(tree);
  expect(buttons).toHaveLength(5);
  for (const button of buttons) button.onFocus?.();
  expect(open).not.toHaveBeenCalled(); expect(keep).not.toHaveBeenCalled();
  for (const button of buttons) { expect(button.onDoubleClick).toBeUndefined(); button.onClick?.(); }
  expect(keep).toHaveBeenCalledOnce();
  expect(open.mock.calls.map(call => call[0])).toEqual(chambers.map(item => item.id));
});

test('Overview and shell use one mapping for pending drafts, torn drafts, Program and core unknowns', async () => {
  await new SimulatedSteward().ask('draft a question draw', { surface: 'overview' });
  await new SimulatedSteward().ask('raise the drawbridge', { surface: 'overview' });
  const proposals = proposalQueue.getSnapshot().proposals;
  const draft = proposalQueue.pending('lottery').at(-1);
  if (!draft) throw new Error('Missing simulated draft');
  const aired = { ...draft, state: 'sealed' as const };
  const mapping = states.stripStates(snapshot, proposals, [aired]);
  expect(mapping.lottery.line).toBe(`${draft.title} · rev ${draft.revision}`);
  expect(mapping.lottery).toMatchObject({ pending_count: 1, draft: true, on_air: true });
  const spy = vi.spyOn(states, 'stripStates');
  const overview = renderToStaticMarkup(<Overview snapshot={snapshot} selected="lottery" on_select={noop} on_open={noop} />);
  const shell = renderToStaticMarkup(<PersistentStrip snapshot={snapshot} current="keep" on_open={noop} on_keep={noop} />);
  expect(spy).toHaveBeenCalledTimes(2);
  expect(spy.mock.calls[0]?.slice(0, 3)).toEqual(spy.mock.calls[1]?.slice(0, 3));
  for (const { id } of chambers) expect(spy.mock.results[0]?.value[id].line).toEqual(spy.mock.results[1]?.value[id].line);
  const lines = (markup: string) => [...markup.matchAll(/class="cc-chamber-state"[^>]*>([^<]*)/g)].map(item => item[1]);
  expect(lines(shell)).toEqual(chambers.map(({ id }) => keepReadModel(snapshot).states[id].word));
  expect(lines(overview)).toEqual(chambers.map(({ id }) => spy.mock.results[0]?.value[id].line));
  proposalQueue.tearUp(draft.id);
  expect(states.stripStates(snapshot, proposalQueue.getSnapshot().proposals, [aired]).lottery.line).toBe(`${draft.title} · simulated Program`);
  const core = states.stripStates({ mode: 'core', phase: 'ready' }, [], []);
  expect(core.lottery.line).toBe('Draw status unavailable');
  expect(core.moderator.on_air).toBe(false);
});

test.each(['keep', 'overview'] as const)('shared title keeps the %s origin, replay crumb, keycap and fixture stamp', origin => {
  const back = vi.fn();
  const keep = vi.fn();
  const tree = RoomHeader({ chamber: 'moderator', replay: true, origin, fixture: true, on_back: back, on_keep: keep });
  const markup = renderToStaticMarkup(tree);
  for (const text of ['The keep', 'Gatehouse', '· chamber 2 of 4', 'The drill', 'AI moderator',
    `Back to the ${origin}`, 'class="cc-kbd">Esc', 'data-stamp="simulated"', 'aria-label="Breadcrumb"']) expect(markup).toContain(text);
  const visit = (node: ReactNode) => Children.forEach(node, child => {
    if (!isValidElement<{ children?: ReactNode; onClick?: () => void }>(child)) return;
    if (child.type === 'button') child.props.onClick?.();
    visit(child.props.children);
  });
  visit(tree); expect(back).toHaveBeenCalledOnce(); expect(keep).toHaveBeenCalledOnce();
  const core = renderToStaticMarkup(<RoomHeader chamber="moderator" replay={false} origin={origin} fixture={false} on_back={noop} />);
  expect(core).not.toContain('data-stamp='); expect(core).not.toContain('The drill');
});

test.each(chambers)('$id band uses its room cover camera; CSS cuts dolly under reduced motion', ({ id }) => {
  const room = keepRooms[id];
  const camera = frameTransform(room.appFrame ?? room.frame, appRoomTarget, 'cover');
  expect(roomCamera(id)).toBe(`translate(${camera.ox}px, ${camera.oy}px) scale(${camera.s})`);
  const markup = renderToStaticMarkup(<RoomHeader chamber={id} replay={false} origin="keep" fixture on_back={noop} />);
  expect(markup).toContain(`data-role="room-band" data-room="${id}" aria-hidden="true"`);
  expect(markup).toContain('--room-camera-from:');
  const band = markup.match(/data-role="room-band"[\s\S]*?<\/svg>/)?.[0] ?? '';
  expect(band).toContain('viewBox="0 0 1200 640"');
  expect(band).toContain('Stylised illustration of a castle in cross-section');
  expect(band.match(/<path\b/g)?.length).toBeGreaterThan(50);
  const overlays = [...band.matchAll(/<rect[^>]*class="dim( on)?" data-room="([^"]+)"/g)];
  expect(overlays).toHaveLength(Object.keys(keepRooms).length);
  for (const overlay of overlays) expect(Boolean(overlay[1]), overlay[2]).toBe(overlay[2] !== id);
  expect(band).toContain(`class="litglow on" data-room="${id}"`);
  const css = readFileSync(new URL('./room.css', import.meta.url), 'utf8');
  expect(css).toContain('height: calc(var(--space-1) * 250)');
  expect(css).toMatch(/\.shell-room-camera\s*\{[^}]*animation: room-dolly var\(--m-dolly\)/);
  expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)\s*\{\s*\.shell-room-camera\s*\{\s*animation: none/);
  const roomSource = readFileSync(new URL('./room.tsx', import.meta.url), 'utf8');
  expect(roomSource).toContain('className="shell-room-content cc-print-in" style={entranceStyle(0)}');
});

function sealCallback(node: ReactNode): (() => void) | undefined {
  for (const child of Children.toArray(node)) {
    if (!isValidElement<{ children?: ReactNode; on_seal?: () => void }>(child)) continue;
    if (child.type === SealButton) return child.props.on_seal;
    const found = sealCallback(child.props.children);
    if (found) return found;
  }
  return undefined;
}

test('Keep Preview is empty until a draft, and its hold uses the exact Overview proclamation authority', async () => {
  const empty = renderToStaticMarkup(<KeepWorkspace snapshot={snapshot} selected="lottery" on_enter={noop} on_open={noop} />);
  for (const text of ['Nothing in Preview. Ask the Steward to draft one.', 'data-role="monitor-preview"', 'data-role="monitor-program"',
    'data-role="monitor-label"', 'data-role="seal"', 'data-role="colnote"', 'data-role="fair"', 'data-scene="program"']) expect(empty).toContain(text);
  expect(empty.match(/data-role="colnote"/g)).toHaveLength(1);
  expect(empty).not.toContain('Drafts stay in Preview until your hold. No live output.');
  expect(empty).not.toContain('class="shell-program-status"');
  expect(empty).toContain('aria-label="Preview and Program" tabindex="0"');
  const draft = (await new SimulatedSteward().ask('draft a question draw', { surface: 'keep' })).proposals[0];
  if (!draft) throw new Error('Missing simulated draft');
  const pending = renderToStaticMarkup(<ProgramColumn snapshot={snapshot} selected="lottery" />);
  expect(pending).toContain('data-draft-frame'); expect(pending).toContain(draft.title);
  const proclaim = vi.spyOn(programStore, 'proclaimToSampleProgram').mockResolvedValue('Synthetic seal response');
  for (const surface of ['keep', 'overview']) {
    let hold: (() => void) | undefined;
    function Probe() {
      const tree = surface === 'keep' ? ProgramColumn({ snapshot, selected: 'lottery' })
        : Overview({ snapshot, selected: 'lottery', on_select: noop, on_open: noop });
      hold = sealCallback(tree); return tree;
    }
    renderToStaticMarkup(<Probe />);
    if (!hold) throw new Error('Missing seal callback');
    hold();
    expect(proclaim).toHaveBeenLastCalledWith(draft.id, programStore.localAuthority);
  }
  expect(proclaim).toHaveBeenCalledTimes(2);
});

test('desktop has no locator markup, styles or production Breadcrumb importer', () => {
  const source = new URL('../', import.meta.url);
  for (const path of readdirSync(source, { recursive: true, withFileTypes: true })) {
    if (!path.isFile() || !/\.(?:tsx?|css)$/.test(path.name) || /\.test\./.test(path.name)) continue;
    const content = readFileSync(join(path.parentPath, path.name), 'utf8');
    expect(content, path.name).not.toContain('cc-room-locator');
    expect(content, path.name).not.toMatch(/import\s*\{[^}]*\bBreadcrumb\b/);
  }
});

test('the Keep column has a bounded grid row, scrolls independently and keeps its children at full height', () => {
  const css = readFileSync(new URL('./program-column.css', import.meta.url), 'utf8');
  expect(css).toMatch(/\.shell-keep-workspace\s*\{[^}]*flex: 1[^}]*grid-template-rows: minmax\(0, 1fr\)[^}]*min-height: 0/);
  expect(css).toMatch(/\.shell-program-column\s*\{[^}]*min-height: 0[^}]*overflow-y: auto/);
  expect(css).toMatch(/\.shell-program-column > \*\s*\{\s*flex-shrink: 0/);
  expect(css).toContain('.shell-program-column:focus-visible');
});

test('shell and Keep column tracks shrink below a child min-content width', () => {
  const shell = readFileSync(new URL('../view.css', import.meta.url), 'utf8');
  expect(shell).toMatch(/\.desktop-shell\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/);
  expect(shell).toMatch(/\.desktop-shell\s*\{[^}]*min-width:\s*0/);
  const keep = readFileSync(new URL('./program-column.css', import.meta.url), 'utf8');
  expect(keep).toMatch(/\.shell-keep-workspace\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+calc\(var\(--space-1\)\s*\*\s*380\)/);
});
