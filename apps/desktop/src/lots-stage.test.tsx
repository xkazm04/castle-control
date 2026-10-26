import { readFileSync } from 'node:fs';
import { Children, isValidElement } from 'react';
import type { ButtonHTMLAttributes, ChangeEvent, ReactElement, ReactNode, TextareaHTMLAttributes } from 'react';
import { renderToReadableStream, renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import { LotsStageOverview, LotsStagePage } from './lots-stage-page.jsx';
import { CustomDesignContent, PresetPicker } from './lots-stage-design.jsx';
import { cannedDesign, createDesignPreview, defaultDesign, escapeStage, fixtureDelayMs, fixturePresets } from './lots-stage-model.js';
import { stageHash, stageRoute } from './lots-stage-route.js';
import type { FixtureDesign } from './lots-stage-model.js';
import { createLotsPreview } from './lots-model.js';
import { lotsCopy } from './lots-copy.js';
import { stageCopy as copy } from './lots-stage-copy.js';
import { dispatchShortcut, routeFromHash } from './navigation.js';
import { DesktopView } from './view.jsx';
import { tokens } from '@castle-control/tokens';

function control<T>(tree: ReactNode, predicate: (props: T & { children?: ReactNode; 'aria-label'?: string }) => boolean): ReactElement<T> {
  let result: ReactElement<T> | undefined;
  const visit = (node: ReactNode) => Children.forEach(node, child => {
    if (!isValidElement<T & { children?: ReactNode; 'aria-label'?: string }>(child)) return;
    if (predicate(child.props)) result = child;
    else visit(child.props.children);
  });
  visit(tree);
  if (!result) throw new Error('Missing stage control');
  return result;
}
function click(tree: ReactNode, label: string) {
  const button = control<ButtonHTMLAttributes<HTMLButtonElement>>(tree, props => props.children === label);
  if (button.props.disabled) throw new Error('Control disabled');
  button.props.onClick?.({} as Parameters<NonNullable<typeof button.props.onClick>>[0]);
}

test('every focus view has a native Tab/Enter link, standalone content, breadcrumb and Back route', () => {
  const port = createLotsPreview();
  const overview = renderToStaticMarkup(<LotsStageOverview snapshot={port.getSnapshot()} port={port} design={defaultDesign} />);
  expect(overview).toContain('data-lot-dot');
  expect(overview).not.toContain('cc-panel-heading');
  for (const entry of [...copy.entries, { id: 'restyle', title: copy.presets_title }, { id: 'custom', title: copy.custom }] as const) {
    const hash = `${stageHash}/${entry.id}`;
    // Native anchors supply Tab focus and Enter activation without custom key listeners.
    expect(overview).toContain(`href="${hash}"`);
    expect(stageRoute(hash)).toBe(entry.id);
    expect(routeFromHash(hash)).toBe('lottery');
    const focus = renderToStaticMarkup(<LotsStagePage route={entry.id} />);
    expect(focus).toContain(entry.title);
    expect(focus).toContain(`href="${stageHash}">${copy.back}</a>`);
    expect(focus).toContain('aria-label="Breadcrumb"');
    expect(focus).not.toContain('cc-stage-frame');
    expect(focus).not.toContain('data-lot-dot');
  }
  expect(stageRoute(`${stageHash}/unknown`)).toBeUndefined();
  expect(stageRoute('#/lottery')).toBeUndefined();
});

test('Escape returns to stage and central shortcuts still handle 1-4 and slash', () => {
  let hash = `${stageHash}/1.3`;
  const prevented = vi.fn();
  escapeStage({ key: 'Enter', preventDefault: prevented }, () => { hash = stageHash; });
  expect(hash).toContain('1.3');
  escapeStage({ key: 'Escape', preventDefault: prevented }, () => { hash = stageHash; });
  expect(hash).toBe(stageHash);
  expect(prevented).toHaveBeenCalledOnce();
  const navigate = vi.fn(); const search = vi.fn();
  for (const key of ['1', '2', '3', '4', '/']) dispatchShortcut({ key, preventDefault: () => undefined }, false, navigate, search);
  expect(navigate.mock.calls.map(call => call[0])).toEqual(['lottery', 'moderator', 'visuals', 'studio']);
  expect(search).toHaveBeenCalledOnce();
});

test('Restyle selects three style-data presets and changes the rendered artifact without changing the roll', () => {
  let design = defaultDesign;
  const port = createLotsPreview();
  const initial = port.getSnapshot();
  const looks = new Set<string>();
  for (const preset of fixturePresets) {
    click(PresetPicker({ design, apply: next => { design = next; port.shape(next.shape); } }), preset.name);
    expect(design).toEqual(preset);
    const html = renderToStaticMarkup(<LotsStageOverview snapshot={port.getSnapshot()} port={port} design={design} />);
    expect(html).toContain(`data-ink="${preset.ink}"`);
    expect(html).toContain(preset.name);
    looks.add(html);
  }
  expect(looks.size).toBe(3);
  expect(port.getSnapshot().entries).toBe(initial.entries);
  expect(port.getSnapshot().draw).toBe(initial.draw);
});

test.each(['seal', 'tear'] as const)('Custom design previews beside current look then %s through actual control handlers, offline', async action => {
  vi.useFakeTimers();
  const network = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Offline fixture'));
  let current: FixtureDesign = defaultDesign;
  const discard = vi.fn();
  const port = createDesignPreview(next => { current = next; }, discard);
  const content = () => CustomDesignContent({ design: current, ...port.getSnapshot(), on_prompt: port.prompt,
    on_generate: port.generate, on_seal: port.seal, on_tear: port.tear });
  try {
    const prompt = control<TextareaHTMLAttributes<HTMLTextAreaElement>>(content(), props => props.children === undefined && props.placeholder === copy.prompt_hint);
    prompt.props.onChange?.({ currentTarget: { value: 'A new lantern urn' } } as ChangeEvent<HTMLTextAreaElement>);
    click(content(), copy.generate);
    expect(port.getSnapshot().busy).toBe(true);
    expect(port.getSnapshot().pending).toBeUndefined();
    port.seal(); expect(current).toBe(defaultDesign);
    await vi.advanceTimersByTimeAsync(fixtureDelayMs);
    const preview = renderToStaticMarkup(content());
    for (const text of [copy.fixture, copy.current, copy.preview, defaultDesign.name, cannedDesign.name]) expect(preview).toContain(text);
    expect(current).toBe(defaultDesign);
    click(content(), action === 'seal' ? copy.seal : copy.tear);
    expect(current).toEqual(action === 'seal' ? cannedDesign : defaultDesign);
    expect(port.getSnapshot().pending).toBeUndefined();
    expect(discard).toHaveBeenCalledTimes(action === 'tear' ? 1 : 0);
    expect(network).not.toHaveBeenCalled();
  } finally { port.dispose(); network.mockRestore(); vi.useRealTimers(); }
});

test('leaving custom design cancels pending generation and blank prompts do not generate', async () => {
  vi.useFakeTimers();
  const port = createDesignPreview(vi.fn(), vi.fn());
  try {
    port.generate(); expect(port.getSnapshot().busy).toBe(false);
    port.prompt('Generated sample'); port.generate(); port.tear();
    await vi.advanceTimersByTimeAsync(fixtureDelayMs);
    expect(port.getSnapshot()).toEqual({ prompt: '', busy: false });
  } finally { port.dispose(); vi.useRealTimers(); }
});

test('stage is lazy fixture-only and the original route retains all reference panels', async () => {
  const view = { current: 'lottery', theme: 'paper', on_navigate: () => undefined, on_theme_change: () => undefined, search: '', on_search: () => undefined } as const;
  const stream = await renderToReadableStream(<DesktopView {...view} stage="stage" snapshot={{ mode: 'fixture', phase: 'ready' }} />);
  await stream.allReady;
  expect(await new Response(stream).text()).toContain('cc-stage-frame');
  const core = renderToStaticMarkup(<DesktopView {...view} stage="stage" snapshot={{ mode: 'core', phase: 'connecting' }} />);
  expect(core).not.toContain('cc-stage-frame');
  const reference = await renderToReadableStream(<DesktopView {...view} snapshot={{ mode: 'fixture', phase: 'ready' }} />);
  await reference.allReady;
  const html = await new Response(reference).text();
  expect(html).not.toContain('cc-stage-frame');
  for (const title of [lotsCopy.saved, lotsCopy.setup, lotsCopy.fairness, lotsCopy.stream]) expect(html).toContain(title);
});

test('stage fixture source contains no network, dynamic code or raw CSS sizes and uses declared tokens', () => {
  for (const file of ['model.ts', 'design.tsx', 'page.tsx']) {
    const source = readFileSync(new URL(`./lots-stage-${file}`, import.meta.url), 'utf8');
    expect(source).not.toMatch(/\b(fetch|invoke|WebSocket|XMLHttpRequest|eval|Function)\s*\(/);
  }
  const css = readFileSync(new URL('./lots-stage.css', import.meta.url), 'utf8');
  expect(css).not.toMatch(/#[\da-f]{3,8}\b|\b\d+(?:\.\d+)?px\b/);
  const declarations = new Set([...css.matchAll(/--([\w-]+)\s*:/g)].map(match => match[1]));
  const known = new Set([...Object.keys(tokens.theme.paper), ...Object.keys(tokens.layout), ...declarations]);
  for (const [, token] of css.matchAll(/var\(--([\w-]+)/g)) expect(known.has(token ?? ''), token).toBe(true);
});
