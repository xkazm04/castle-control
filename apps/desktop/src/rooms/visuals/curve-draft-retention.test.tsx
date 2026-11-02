import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, test, vi } from 'vitest';
import { installFakeDom } from '../../fake-dom.js';
import { createCoreBeaconsPort } from '../../beacons-core.js';
import type { BeaconsNetwork } from '../../beacons-core.js';
import type { CurveEditor } from './curve-editor.js';
import { EditableKindlingCurve } from './kindling-curve.jsx';

// Counting spy: every editor the component creates, in order.
const made = vi.hoisted(() => ({ editors: [] as unknown[] }));
vi.mock('./curve-editor.js', async importOriginal => {
  const real = await importOriginal<typeof import('./curve-editor.js')>();
  return { ...real, createCurveEditor: (...args: Parameters<typeof real.createCurveEditor>) => {
    const editor = real.createCurveEditor(...args); made.editors.push(editor); return editor;
  } };
});

const launch = { mode: 'core', endpoint: 'http://127.0.0.1:3210/', session_token: 'a'.repeat(64) } as const;
// Synthetic configuration, never a viewer or a contribution recording.
const curve = { ranges: [{ total: 0, intensity: 0 }, { total: 25, intensity: 0.5 }, { total: 50, intensity: 1 }], decay: { kind: 'none' } };
async function loaded(current: typeof curve) {
  const rpc = vi.fn<BeaconsNetwork['rpc']>(async (_endpoint, _session, method) =>
    method === 'beacons.visual.list' ? { visuals: [{ visual_id: 'synthetic-curve', name: 'Synthetic curve', curve: structuredClone(current) }] } : undefined);
  const port = createCoreBeaconsPort(launch, { rpc });
  await port.load();
  const visual = port.getSnapshot().visuals[0];
  if (!visual) throw new Error('Expected synthetic visual');
  return { port, visual, rpc };
}

test('Refresh Beacons keeps an unsaved curve draft when the confirmed curve is unchanged', async () => {
  made.editors.length = 0;
  const { port, visual } = await loaded(curve);
  const { container, uninstall } = installFakeDom();
  try {
    const root = createRoot(container);
    await act(async () => { root.render(<EditableKindlingCurve visual={visual} port={port} busy={false} />); });
    const first = made.editors[0] as CurveEditor;
    await act(async () => { first.move(1, 30, 0.6); });
    const draft = first.getSnapshot().draft;
    expect(first.getSnapshot().phase).toBe('editing');
    // Refresh: the core reload parses new, structurally identical visual objects.
    await port.load();
    const reloaded = port.getSnapshot().visuals[0];
    if (!reloaded) throw new Error('Expected reloaded visual');
    expect(reloaded).not.toBe(visual);
    await act(async () => { root.render(<EditableKindlingCurve visual={reloaded} port={port} busy={false} />); });
    expect(made.editors).toHaveLength(1);
    expect(first.getSnapshot().draft).toBe(draft);
    await act(async () => { root.unmount(); });
  } finally { uninstall(); }
});

test('a visual whose confirmed curve really changed gets a fresh editor', async () => {
  made.editors.length = 0;
  const { port, visual } = await loaded(curve);
  const changed = await loaded({ ...curve, ranges: [{ total: 0, intensity: 0 }, { total: 25, intensity: 0.9 }, { total: 50, intensity: 1 }] });
  const { container, uninstall } = installFakeDom();
  try {
    const root = createRoot(container);
    await act(async () => { root.render(<EditableKindlingCurve visual={visual} port={port} busy={false} />); });
    await act(async () => { root.render(<EditableKindlingCurve visual={changed.visual} port={port} busy={false} />); });
    expect(made.editors).toHaveLength(2);
    await act(async () => { root.unmount(); });
  } finally { uninstall(); }
});
