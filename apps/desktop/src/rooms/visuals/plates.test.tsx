import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import type { KeyboardEvent } from 'react';
import { ProposalQueue, SimulatedSteward } from '@castle-control/ui/steward';
import { createBeaconsPreview } from '../../beacons-model.js';
import { VisualSelector, VisualsWork } from './room.jsx';
import SealSlot from '../seal-slot/index.jsx';
import { createCoreBeaconsPort } from '../../beacons-core.js';
import { ConnectedBeacons } from './core.jsx';

test('C compares three radio plates, each with its own cropped artwork and inline stair ramps', () => {
  const port = createBeaconsPreview();
  const html = renderToStaticMarkup(<VisualsWork port={port} />);
  expect(html).toContain('role="radiogroup"');
  expect(html.match(/role="radio"/g)).toHaveLength(3);
  expect(html.match(/aria-checked="true"/g)).toHaveLength(1);
  expect(html.match(/aria-checked="false"/g)).toHaveLength(2);
  expect(html.match(/tabindex="-1"/g)).toHaveLength(2);
  for (const item of port.getSnapshot().visuals) {
    expect(html).toContain(`--room-blaze:${item.intensity}`);
    expect(html).toContain(`${item.visual.name} · simulated local preview`);
  }
  expect(html.match(/viewBox="84 25 192 218"/g)).toHaveLength(1);
  expect(html.match(/viewBox="14 24 332 192"/g)).toHaveLength(2);
  expect(html).toContain('--from:0.25;--to:0.6;--frac:40%');
  expect(html.match(/--from:/g)).toHaveLength(12);
  expect(html).toContain('25→60%');
});

test('native plate arrow handlers wrap focus and selection; Enter/Space select without reaching the shell', () => {
  const port = createBeaconsPreview();
  const focus = [vi.fn(), vi.fn(), vi.fn()];
  const render = () => VisualSelector({ visuals: port.getSnapshot().visuals, selected: port.getSnapshot().selected,
    on_select: item => port.select(item.visual.visual_id) });
  const press = (index: number, key: string, composing = false, modified = false) => {
    // Node supplies Event but no DOM. This projection supplies every property read by the native handler.
    const nativeEvent = Object.assign(new Event('keydown', { cancelable: true }), { isComposing: composing });
    const event = Object.assign({} as KeyboardEvent<HTMLButtonElement>, { key, nativeEvent, ctrlKey: modified,
      altKey: false, metaKey: false, preventDefault: vi.fn(() => nativeEvent.preventDefault()), stopPropagation: vi.fn(),
      currentTarget: { parentElement: { querySelectorAll: () => focus.map(f => ({ focus: f })) } } });
    render().props.children[index]?.props.onKeyDown?.(event);
    return event;
  };
  for (const [from, key, target] of [[0, 'ArrowRight', 1], [1, 'ArrowDown', 2], [2, 'ArrowRight', 0],
    [0, 'ArrowLeft', 2], [2, 'ArrowUp', 1], [1, 'Home', 0], [0, 'End', 2]] as const) {
    const event = press(from, key);
    expect(event.nativeEvent.defaultPrevented).toBe(true); expect(event.stopPropagation).toHaveBeenCalledOnce();
    expect(port.getSnapshot().selected).toBe(port.getSnapshot().visuals[target]?.visual.visual_id);
    expect(focus[target]).toHaveBeenCalled();
    const html = renderToStaticMarkup(render());
    expect(html.match(/aria-checked="true"/g)).toHaveLength(1);
    expect(html.match(/tabindex="0"/g)).toHaveLength(1);
  }
  for (const key of ['Enter', ' ']) {
    press(1, key);
    expect(port.getSnapshot().selected).toBe(port.getSnapshot().visuals[1]?.visual.visual_id);
  }
  for (const event of [press(1, 'Escape'), press(1, 'ArrowRight', true), press(1, 'ArrowRight', false, true)]) {
    expect(event.preventDefault).not.toHaveBeenCalled(); expect(event.stopPropagation).not.toHaveBeenCalled();
  }
  expect(port.getSnapshot().selected).toBe(port.getSnapshot().visuals[1]?.visual.visual_id);
});

test('a draft is mirrored only inside the selected art and the shell supplies exactly one hold control', async () => {
  const queue = new ProposalQueue();
  await new SimulatedSteward(queue).ask('test fire 50 gifts', { surface: 'room', chamber: 'visuals' });
  const port = createBeaconsPreview();
  const render = () => renderToStaticMarkup(<VisualsWork queue={queue} port={port}
    seal_slot={<SealSlot chamber="visuals" queue={queue} />} />);
  for (const item of port.getSnapshot().visuals) {
    port.select(item.visual.visual_id);
    const html = render();
    expect(html.match(/aria-label="Seal slot"/g)).toHaveLength(1);
    expect(html.match(/aria-label="Hold to seal and proclaim"/g)).toHaveLength(1);
    expect(html.match(/data-proposal-layer=/g)).toHaveLength(1);
    const selected = html.match(/<button[^>]*aria-checked="true"[\s\S]*?<\/button>/)?.[0] ?? '';
    expect(selected).toContain('visuals-plate-art'); expect(selected).toContain('DRAFT · NOT ON AIR');
    expect(selected).not.toContain('Hold to seal');
  }
});

test('C field audit exception is thin on every side and the radio art never hides a draft', () => {
  const css = readFileSync(new URL('./bench.css', import.meta.url), 'utf8');
  expect(css).toMatch(/select[^}]*\{[^}]*appearance: none; border: var\(--rule-thin\) solid var\(--ink\)/);
  const room = readFileSync(new URL('./room.css', import.meta.url), 'utf8');
  expect(room).toMatch(/\.visuals-plate-art:has\(\.room-proposal-draft\)\s*\{[^}]*height: auto/);
});

test('C bench chief keeps the kit non-flipping press, cream and or inks', () => {
  const html = renderToStaticMarkup(<VisualsWork />);
  expect(html).toContain('data-band="bench"');
  const css = readFileSync(new URL('../../../../../packages/ui/src/heraldic-plate.css', import.meta.url), 'utf8');
  const band = css.match(/\.cc-plate-band\[data-band="bench"\]\s*\{([^}]+)\}/)?.[1] ?? '';
  expect(band).toContain('background: var(--press)');
  expect(band).toContain('color: var(--cream)');
  expect(band).not.toMatch(/var\(--(?:ink|paper)\)/);
  expect(css).toContain('.cc-plate-band[data-band="bench"] .cc-plate-title { color: var(--or); }');
});

test('core shares the C plates and bench while unavailable measurements stay distinct from a simulation', async () => {
  const data = { visual_id: 'synthetic-c', name: 'Synthetic C visual', design_id: 'camera-frame',
    curve: { ranges: [{ total: 0, intensity: 0 }, { total: 50, intensity: 1 }], decay: { kind: 'none' } } } as const;
  const port = createCoreBeaconsPort({ mode: 'core', endpoint: 'http://127.0.0.1:3210/', session_token: 'a'.repeat(64) }, {
    rpc: async (_endpoint, _session, method) => method === 'beacons.visual.list' ? { visuals: [data] }
      : { label: 'simulated', intensity: { visual_id: data.visual_id, intensity: 0.75 } },
  });
  await port.load();
  const render = () => renderToStaticMarkup(<ConnectedBeacons port={port} />);
  const before = render();
  expect(before).toContain('role="radio"'); expect(before).toContain('data-band="bench"');
  expect(before).toContain('Live intensity is unavailable.'); expect(before).toContain('live total unavailable');
  expect(before).not.toContain('data-offering-mark'); expect(before).not.toContain('weighted subs');
  expect(before).toContain('Kindling curve editor'); expect(before).toContain('Copy browser-source URL');
  const saved = port.getSnapshot().visuals[0];
  if (!saved) throw new Error('Expected synthetic core configuration');
  await port.simulate({ visual_id: saved.visual_id, burst: { source: 'gift', amount: 50 } });
  const after = render();
  expect(after).toContain('--room-blaze:0.75'); expect(after).toContain('75% blaze · simulated · core result');
  expect(after).toContain('live total unavailable'); expect(after).not.toContain('data-state="active"');
  expect(port.getSnapshot().visuals[0]).toEqual(data);
});
