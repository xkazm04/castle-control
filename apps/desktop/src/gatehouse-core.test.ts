import { afterEach, expect, test, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createCoreGatehousePort } from './gatehouse-core.js';
import type { GatehouseNetwork } from './gatehouse-core.js';
import { fixtureCharts, fixtureLedger, fixtureReplay, fixtureRules } from './moderation-fixture.js';
import { ConnectedGatehouse } from './rooms/moderator/core.jsx';

const launch = { mode: 'core', endpoint: 'http://127.0.0.1:3210/', session_token: 'a'.repeat(64) } as const;
const rule = fixtureRules.rules[0];
const decision = fixtureLedger[0];
const consensus = fixtureCharts[0];
if (!rule || !decision || !consensus) throw new Error('Missing simulated test values');
const configuration = { rules: fixtureRules.rules, bank: 'simulated-bank', judge: 'simulated-judge', prompts: [] };
const run = { recording: 'simulated-recording', configuration };
const diff = { recording: run.recording, baseline: configuration, candidate: configuration };
const imported = { source: 'simulated-import', messages: [], gaps: [] };
const recording = { recording: run.recording, source: imported.source, message_count: 0, gaps: [] };
const diffResult = { label: 'simulated', baseline: fixtureReplay, candidate: { ...fixtureReplay, source: 'simulated-candidate' },
  changes: [{ message_id: decision.message_id, before: 'acted', after: 'not_provoked' }] };

function harness() {
  const responses = new Map<string, unknown>([
    ['gatehouse.rules.list', fixtureRules], ['gatehouse.rules.upsert', rule],
    ['gatehouse.ban.confirm', decision], ['gatehouse.ban.dismiss', decision],
    ['gatehouse.decision.undo', decision], ['gatehouse.petition.resolve', decision],
    ['gatehouse.recording.import', recording], ['gatehouse.consensus.get', consensus],
    ['gatehouse.drill.run', fixtureReplay], ['gatehouse.drill.diff', diffResult],
  ]);
  const rpc = vi.fn<GatehouseNetwork['rpc']>(async (_endpoint, _session, method) => structuredClone(responses.get(method)));
  const fetch = vi.fn(() => { throw new Error('Unexpected fetch'); });
  const socket = vi.fn(() => { throw new Error('Unexpected socket'); });
  vi.stubGlobal('fetch', fetch); vi.stubGlobal('WebSocket', socket);
  return { port: createCoreGatehousePort(launch, { rpc }), rpc, responses, fetch, socket };
}
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

test('all ten existing methods send schema-validated parameters over the injected transport', async () => {
  const h = harness();
  await h.port.load();
  await h.port.upsertRule({ rule });
  await h.port.confirmBan({ decision_id: decision.decision_id });
  await h.port.dismissBan({ decision_id: decision.decision_id });
  await h.port.undoDecision({ decision_id: decision.decision_id });
  await h.port.resolvePetition({ decision_id: decision.decision_id, outcome: 'overturned' });
  await h.port.importRecording(imported);
  await h.port.runDrill(run);
  await h.port.diffDrill(diff);
  expect(h.rpc.mock.calls.map(call => call.slice(2))).toEqual([
    ['gatehouse.rules.list', {}], ['gatehouse.consensus.get', { filter: { kind: 'all' }, window_s: 900 }],
    ['gatehouse.rules.upsert', { rule }], ['gatehouse.ban.confirm', { decision_id: decision.decision_id }],
    ['gatehouse.ban.dismiss', { decision_id: decision.decision_id }], ['gatehouse.decision.undo', { decision_id: decision.decision_id }],
    ['gatehouse.petition.resolve', { decision_id: decision.decision_id, outcome: 'overturned' }],
    ['gatehouse.recording.import', imported], ['gatehouse.drill.run', run], ['gatehouse.drill.diff', diff],
  ]);
  for (const call of h.rpc.mock.calls) expect(call.slice(0, 2)).toEqual([launch.endpoint, launch.session_token]);
  expect(h.port.getSnapshot().rules).toEqual(fixtureRules.rules);
  expect(h.port.getSnapshot().last_decision).toEqual(decision);
  expect(h.port.getSnapshot().recording).toEqual(recording);
  expect(h.port.getSnapshot().diff).toEqual(diffResult);
  expect(h.fetch).not.toHaveBeenCalled(); expect(h.socket).not.toHaveBeenCalled();
});

test('consensus filters are sent to core and the returned series is rendered without fixture illustration', async () => {
  const h = harness();
  const result = { ...consensus, filter: { kind: 'emote', emote: 'Kappa' }, shed_count: 31,
    directions: [{ key: 'core-direction', label: 'Core audience direction', share: 0.75, messages: 3,
      series: [{ at: consensus.at, share: 0.75 }] }] };
  h.responses.set('gatehouse.consensus.get', result);
  await h.port.consensus({ filter: { kind: 'emote', emote: 'Kappa' }, window_s: 900 });
  expect(h.rpc).toHaveBeenLastCalledWith(launch.endpoint, launch.session_token, 'gatehouse.consensus.get', {
    filter: { kind: 'emote', emote: 'Kappa' }, window_s: 900,
  });
  const html = renderToStaticMarkup(createElement(ConnectedGatehouse, { port: h.port, replay: false }));
  expect(html).toContain('Core audience direction'); expect(html).toContain('75.0%'); expect(html).toContain('31 messages shed');
  expect(html).not.toContain('illustrative'); expect(html).not.toContain('sample recording');
});

test('core rules and drill-diff views render the fake transport results with provenance and state changes', async () => {
  const h = harness();
  h.responses.set('gatehouse.rules.list', { rules: [{ ...rule, name: 'Core configured rule' }] });
  await h.port.load(); await h.port.runDrill(run); await h.port.diffDrill(diff);
  const html = renderToStaticMarkup(createElement(ConnectedGatehouse, { port: h.port, replay: true }));
  expect(html).toContain('simulated-candidate'); expect(html).toContain(fixtureReplay.instrument_hash);
  expect(html).toContain('Recording gap'); expect(html).toContain('acted'); expect(html).toContain('not provoked');
  expect(html).toContain('simulated replay'); expect(html).not.toContain('Generated fixture output');
  const rules = renderToStaticMarkup(createElement(ConnectedGatehouse, { port: h.port, replay: false }));
  expect(rules).toContain('Core configured rule');
});

test('errors and malformed replies produce calm error states, clear unavailable results and never leak upstream prose', async () => {
  const h = harness();
  await h.port.load(); await h.port.diffDrill(diff);
  h.rpc.mockRejectedValueOnce({ code: 'rate_limited', message: 'Private upstream detail', retry_after_ms: 2000 });
  await h.port.diffDrill(diff);
  expect(h.port.getSnapshot().phase).toBe('error'); expect(h.port.getSnapshot().busy).toBe(false);
  expect(h.port.getSnapshot().diff).toBeUndefined();
  expect(h.port.getSnapshot().notice).toContain('rate_limited'); expect(h.port.getSnapshot().notice).toContain('2000');
  expect(h.port.getSnapshot().notice).not.toContain('Private upstream detail');
  const failed = renderToStaticMarkup(createElement(ConnectedGatehouse, { port: h.port, replay: true }));
  expect(failed).toContain('role="status"'); expect(failed).toContain('rate_limited');
  h.responses.set('gatehouse.rules.list', { rules: [{ ...rule, extra: true }] });
  await h.port.load(); expect(h.port.getSnapshot().rules).toEqual([]);
  expect(h.port.getSnapshot().phase).toBe('error');
  h.responses.set('gatehouse.consensus.get', { code: 'unavailable', message: 'Private detail' });
  await h.port.consensus({ filter: { kind: 'all' }, window_s: 900 });
  expect(h.port.getSnapshot().consensus).toBeUndefined(); expect(h.port.getSnapshot().phase).toBe('error');
  expect(h.port.getSnapshot().notice).not.toContain('Private detail');
});

test('bad inputs fail before transport, subscriptions are stable, and empty refresh clears old rules', async () => {
  const h = harness(); const listener = vi.fn(); const stop = h.port.subscribe(listener);
  const initial = h.port.getSnapshot(); expect(h.port.getSnapshot()).toBe(initial);
  await h.port.importRecording({ ...imported, extra: true });
  expect(h.rpc).not.toHaveBeenCalled(); expect(h.port.getSnapshot().phase).toBe('error');
  await h.port.importRecordingJson('{broken'); expect(h.rpc).not.toHaveBeenCalled();
  await h.port.load(); expect(listener).toHaveBeenCalled(); stop(); const calls = listener.mock.calls.length;
  h.responses.set('gatehouse.rules.list', { rules: [] }); await h.port.load();
  expect(h.port.getSnapshot().rules).toEqual([]); expect(listener).toHaveBeenCalledTimes(calls);
  expect(() => Object.assign(h.port.getSnapshot().rules, { 0: rule })).toThrow();
});

test('overlapping requests are not sent or retried, and failed mutations never fabricate success', async () => {
  const h = harness(); let reject: ((reason: unknown) => void) | undefined;
  h.rpc.mockImplementationOnce(async () => new Promise((_resolve, fail) => { reject = fail; }));
  const pending = h.port.confirmBan({ decision_id: decision.decision_id });
  await h.port.dismissBan({ decision_id: decision.decision_id });
  expect(h.rpc).toHaveBeenCalledTimes(1);
  reject?.({ code: 'unavailable', message: 'Outcome unknown' }); await pending;
  expect(h.port.getSnapshot().last_decision).toBeUndefined(); expect(h.port.getSnapshot().phase).toBe('error');
  expect(h.rpc).toHaveBeenCalledTimes(1);
});

test('launch capabilities are validated and isolated from read snapshots', () => {
  const h = harness();
  for (const endpoint of ['https://127.0.0.1/', 'http://localhost/', 'http://example.com/', 'http://127.0.0.1/rpc']) {
    expect(() => createCoreGatehousePort({ ...launch, endpoint }, { rpc: h.rpc })).toThrow();
  }
  expect(() => createCoreGatehousePort({ ...launch, session_token: 'invalid' }, { rpc: h.rpc })).toThrow();
  expect(JSON.stringify(h.port.getSnapshot())).not.toContain(launch.session_token);
  expect(h.rpc).not.toHaveBeenCalled();
});

test('HTTP error replies become sanitized error states through the production contract door', async () => {
  const fetch = vi.fn(async () => new Response(JSON.stringify({ code: 'unavailable', message: 'Private backend detail' }), { status: 503 }));
  vi.stubGlobal('fetch', fetch);
  const port = createCoreGatehousePort(launch);
  await port.load();
  expect(fetch).toHaveBeenCalledWith(new URL('/rpc', launch.endpoint), expect.objectContaining({
    method: 'POST', body: JSON.stringify({ method: 'gatehouse.rules.list', params: {} }),
    headers: { 'content-type': 'application/json', authorization: `Bearer ${launch.session_token}` },
  }));
  expect(port.getSnapshot().phase).toBe('error'); expect(port.getSnapshot().notice).toContain('unavailable');
  expect(port.getSnapshot().notice).not.toContain('Private backend detail'); expect(port.getSnapshot().rules).toEqual([]);
});

test('a baseline survives leaving the drill and editing rules without sending a replay or changing the captured rules', async () => {
  const h = harness(); await h.port.load(); await h.port.saveBaseline(run);
  const baseline = h.port.getSnapshot().baseline;
  h.responses.set('gatehouse.rules.upsert', { ...rule, name: 'Updated core rule' });
  await h.port.upsertRule({ rule: { ...rule, name: 'Updated core rule' } });
  expect(h.port.getSnapshot().baseline).toBe(baseline);
  expect(baseline?.rules[0]?.name).toBe(rule.name);
  const html = renderToStaticMarkup(createElement(ConnectedGatehouse, { port: h.port, replay: true }));
  expect(html).toContain(run.recording); expect(html).toContain('Comparison baseline saved for this core connection');
  expect(h.rpc.mock.calls.map(call => call[2])).toEqual(['gatehouse.rules.list', 'gatehouse.consensus.get', 'gatehouse.rules.upsert']);
});
