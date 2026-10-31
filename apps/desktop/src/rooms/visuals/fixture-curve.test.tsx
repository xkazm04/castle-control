import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import { createBeaconsPreview } from '../../beacons-model.js';
import { createFixtureCurveEditor } from './fixture-curve.jsx';
import { VisualsWork } from './room.jsx';

test('switching visuals during local save never applies the old curve to the new selection', async () => {
  const port = createBeaconsPreview();
  const other = port.getSnapshot().visuals[1];
  if (!other) throw new Error('Missing generated frame');
  const editor = createFixtureCurveEditor(port);
  editor.move(1, 20, 0.8);
  const saving = editor.save();
  port.select(other.visual.visual_id);
  await saving;
  expect(port.getSnapshot().visuals[1]).toBe(other);
  editor.move(1, 15, 0.5); editor.cancel();
  expect(port.getSnapshot().visuals[1]).toBe(other);
});

test('drag previews intensity immediately, release saves, and cancel restores the last local save', async () => {
  const port = createBeaconsPreview();
  const before = port.getSnapshot();
  const first = before.visuals[0];
  if (!first) throw new Error('Missing generated altar');
  const network = vi.spyOn(globalThis, 'fetch');
  try {
    const editor = createFixtureCurveEditor(port);
    expect(editor.begin(1, 7)).toBe(true);
    editor.drag(7, 120, 28);
    const dragging = port.getSnapshot();
    expect(dragging.visuals[0]?.visual.curve.ranges[1]).toEqual({ total: 20, intensity: 0.8 });
    expect(dragging.visuals[0]?.intensity).not.toBe(first.intensity);
    expect(renderToStaticMarkup(<VisualsWork port={port} />)).toContain(`data-intensity="${dragging.visuals[0]?.intensity}"`);
    expect(dragging.visuals[0]?.total).toBe(first.total);
    expect(dragging.events).toBe(before.events);
    expect(dragging.visuals[1]).toBe(before.visuals[1]);
    await editor.release(7);
    const saved = editor.getSnapshot().confirmed;
    editor.move(1, 15, 0.3); editor.cancel();
    expect(port.getSnapshot().visuals[0]?.visual.curve).toEqual(saved);
    editor.setDecay({ kind: 'exponential', half_life_s: 60 });
    await editor.save();
    port.weight(2); port.fire('gift', 50); port.advance();
    expect(port.getSnapshot().visuals[0]?.total).toBe(59);
    expect(network).not.toHaveBeenCalled();
  } finally { network.mockRestore(); }
});
