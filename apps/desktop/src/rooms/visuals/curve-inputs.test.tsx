import { expect, test, vi } from 'vitest';
import { componentProbe } from '../moderator/component-probe.jsx';
import { createCoreBeaconsPort } from '../../beacons-core.js';
import type { BeaconsNetwork } from '../../beacons-core.js';
import { createCurveEditor } from './curve-editor.js';
import { CurveControls } from './kindling-curve.jsx';

const launch = { mode: 'core', endpoint: 'http://127.0.0.1:3210/', session_token: 'a'.repeat(64) } as const;
// Synthetic configuration, never a viewer or a contribution recording.
const fixture = { visual_id: 'synthetic-curve', name: 'Synthetic curve', curve: {
  ranges: [{ total: 0, intensity: 0 }, { total: 25, intensity: 0.5 }, { total: 50, intensity: 1 }],
  decay: { kind: 'none' },
} };
async function harness() {
  const rpc = vi.fn<BeaconsNetwork['rpc']>(async (_endpoint, _session, method) =>
    method === 'beacons.visual.list' ? { visuals: [fixture] } : undefined);
  const port = createCoreBeaconsPort(launch, { rpc });
  await port.load();
  const visual = port.getSnapshot().visuals[0];
  if (!visual) throw new Error('Expected synthetic visual');
  const editor = createCurveEditor(visual, port);
  const h = componentProbe(() => <CurveControls editor={editor} state={editor.getSnapshot()} busy={false} />);
  const shown = (html: string, name: string) => new RegExp(`name="${name}"[^>]*value="([^"]*)"`).exec(html)?.[1];
  return { editor, h, shown };
}

test('curve intensity shows the rounded percent, not float noise', async () => {
  const { editor, h, shown } = await harness();
  editor.move(1, 25, 0.29);
  expect(shown(h.render(), 'intensity-1')).toBe('29');
  h.dispose();
});

test('curve point inputs can be cleared and retyped without committing an empty value', async () => {
  const { editor, h, shown } = await harness();
  editor.move(0, 0, 0.1);
  expect(shown(h.render(), 'intensity-0')).toBe('10');
  h.change('Intensity (%)', '');
  expect(shown(h.render(), 'intensity-0')).toBe('');
  expect(editor.getSnapshot().draft.ranges[0]?.intensity).toBe(0.1);
  h.change('Intensity (%)', '40');
  expect(shown(h.render(), 'intensity-0')).toBe('40');
  expect(editor.getSnapshot().draft.ranges[0]?.intensity).toBe(0.4);
  h.change('Contribution total', '');
  expect(shown(h.render(), 'total-0')).toBe('');
  expect(editor.getSnapshot().draft.ranges[0]?.total).toBe(0);
  h.dispose();
});
