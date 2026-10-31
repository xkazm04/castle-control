import { afterEach, expect, test, vi } from 'vitest';
import { componentProbe } from './component-probe.jsx';
import { CoreConsensus } from './core-consensus.jsx';
import { CoreDrill } from './core-drill.jsx';
import { createCoreGatehousePort } from '../../gatehouse-core.js';
import type { GatehouseNetwork } from '../../gatehouse-core.js';
import { fixtureCharts } from '../../moderation-fixture.js';
import { moderationCopy as copy } from '../../moderation-copy.js';

afterEach(() => vi.restoreAllMocks());
const launch = { mode: 'core', endpoint: 'http://127.0.0.1:3210/', session_token: 'a'.repeat(64) } as const;

test('core Herald sends the trimmed emote to the transport and refuses blank input', async () => {
  const rpc = vi.fn<GatehouseNetwork['rpc']>(async () => fixtureCharts[3]);
  const port = createCoreGatehousePort(launch, { rpc });
  const h = componentProbe(() => <CoreConsensus state={port.getSnapshot()} port={port} />);
  h.render(); h.click(copy.one_emote); h.render();
  h.change(copy.emote, ' Kappa '); h.render(); h.submit();
  expect(rpc.mock.calls[0]?.[3]).toEqual({ filter: { kind: 'emote', emote: 'Kappa' }, window_s: 900 });
  await vi.waitFor(() => expect(port.getSnapshot().busy).toBe(false));
  h.render(); h.change(copy.emote, '   ');
  expect(h.render()).toMatch(/<button[^>]*disabled=""[^>]*>Refresh consensus/);
  h.submit(); expect(rpc).toHaveBeenCalledTimes(1);
});

test('core drill accepts a late imported name but preserves a cleared edit and disables replay', async () => {
  const rpc = vi.fn<GatehouseNetwork['rpc']>(async () => ({ recording: 'simulated-recording', source: 'simulated-import', message_count: 0, gaps: [] }));
  const port = createCoreGatehousePort(launch, { rpc });
  const state = () => ({ ...port.getSnapshot(), baseline: { rules: [], bank: 'simulated-bank', judge: 'simulated-judge', prompts: [] } });
  const h = componentProbe(() => <CoreDrill state={state()} port={port} />);
  h.render(); await port.importRecordingJson('{"source":"simulated-import","messages":[],"gaps":[]}');
  expect(h.render()).toContain('value="simulated-recording"');
  h.change(copy.recording_name, ''); const html = h.render();
  expect(html).not.toContain('value="simulated-recording"');
  for (const label of [copy.run_replay, copy.save_baseline, copy.compare]) expect(html).toMatch(new RegExp(`<button[^>]*disabled=""[^>]*>${label}`));
  h.change(copy.recording_name, 'next-recording'); expect(h.render()).toContain('value="next-recording"');
  expect(rpc).toHaveBeenCalledTimes(1);
});
