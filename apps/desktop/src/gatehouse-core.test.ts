import { afterEach, expect, test, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createCoreGatehousePort } from './gatehouse-core.js';
import type { GatehouseNetwork } from './gatehouse-core.js';
import { fixtureCharts, fixtureLedger, fixtureReplay, fixtureRules } from './moderation-fixture.js';
import { ConnectedGatehouse } from './rooms/moderator/core.jsx';
import { CoreChat } from './rooms/moderator/core-reads.jsx';
import { CaptureList } from './rooms/moderator/capture-drill.jsx';

const capture = {
  recording: 'recording-01K8F7A0000000000000000002', from: '2026-10-29T12:00:00Z', to: '2026-10-29T12:00:00Z',
  configuration: { rules: [], bank: 'simulated-capture-bank', judge: 'rules-only', prompts: [] },
  instrument: fixtureReplay.instrument, instrument_hash: fixtureReplay.instrument_hash, gaps: [],
  inputs: { bank: { label: 'simulated-capture-bank', calibration: 'simulated', cases: [] },
    judge: { revision: 'simulated', model: 'none', tier: 'simulated', rubric: 'simulated', parameters: {} },
    prompts: { version: 'simulated', system: 'simulated', prompts: [], sources: {} } },
};
const captureItem = { coverage: 'retained', decision_id: '01K8F7A0000000000000000001', provenance: 'simulated', capture } as const;
const capturePage = { items: [captureItem], unavailable_count: 0, next_cursor: 'liveRun:100' };

// Generated data only: a simulated transport may return either provenance label.
const readDecision = { at: '2026-10-28T12:00:00Z', decision_id: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
  message_id: 'synthetic-core-message', kind: 'would_act', verdict: 'pass', operator: 'human', reason_codes: [] };
const chatPage = { items: [{ decision: readDecision, provenance: 'live', message: {
  message_id: readDecision.message_id, user_id: '123', at: readDecision.at, text: 'Synthetic core chat text',
} }], unavailable_count: 2, next_cursor: 'chat:100' };
const historyPage = { items: [{ decision: readDecision, provenance: 'simulated', recorded_at: readDecision.at }],
  unavailable_count: 3, next_cursor: 'history:100' };

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
    ['gatehouse.chat.list', chatPage], ['gatehouse.history.list', historyPage],
    ['gatehouse.liveRun.get', capturePage],
  ]);
  const rpc = vi.fn<GatehouseNetwork['rpc']>(async (_endpoint, _session, method) => structuredClone(responses.get(method)));
  const fetch = vi.fn(() => { throw new Error('Unexpected fetch'); });
  const socket = vi.fn(() => { throw new Error('Unexpected socket'); });
  vi.stubGlobal('fetch', fetch); vi.stubGlobal('WebSocket', socket);
  return { port: createCoreGatehousePort(launch, { rpc }), rpc, responses, fetch, socket };
}
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

test.each(['consensus', 'chat', 'history'] as const)('a failed %s read does not prevent independent reads from loading', async failed => {
  const h = harness();
  h.rpc.mockImplementation(async (_endpoint, _session, method) => {
    if (method === `gatehouse.${failed}.${failed === 'consensus' ? 'get' : 'list'}`) throw { code: 'invalid', message: 'Private read detail' };
    return structuredClone(h.responses.get(method));
  });
  await h.port.load(); const snapshot = h.port.getSnapshot();
  expect(h.rpc.mock.calls.map(call => call[2])).toEqual(['gatehouse.rules.list', 'gatehouse.consensus.get', 'gatehouse.chat.list', 'gatehouse.history.list']);
  for (const [key, value] of [['consensus', consensus], ['chat', chatPage], ['history', historyPage]] as const) {
    expect(snapshot[key]).toEqual(key === failed ? undefined : value);
  }
  expect(snapshot).toHaveProperty(`read_failures.${failed}`);
  expect(snapshot.notice).toMatch(new RegExp(`${failed} read failed`, 'i'));
  expect(snapshot.notice).not.toContain('Private read detail'); expect(snapshot.busy).toBe(false); expect(snapshot.phase).toBe('error');
  h.rpc.mockImplementation(async (_endpoint, _session, method) => structuredClone(h.responses.get(method)));
  await h.port.load(); expect(h.port.getSnapshot()).toHaveProperty('read_failures', {}); expect(h.port.getSnapshot().phase).toBe('ready');
});

test('a failed rules read stops dependent loading and clears earlier successes', async () => {
  const h = harness(); await h.port.load(); h.rpc.mockClear();
  h.rpc.mockRejectedValueOnce({ code: 'unavailable', message: 'Private read detail' });
  await h.port.load(); const snapshot = h.port.getSnapshot();
  expect(h.rpc.mock.calls.map(call => call[2])).toEqual(['gatehouse.rules.list']);
  expect(snapshot.rules).toEqual([]);
  for (const key of ['chat', 'history', 'consensus'] as const) expect(snapshot[key]).toBeUndefined();
});

test('load publishes independent successes while busy until the last read settles', async () => {
  const h = harness();
  let finish: (value: unknown) => void = () => { throw new Error('Missing pending history'); };
  h.rpc.mockImplementation(async (_endpoint, _session, method) => {
    if (method === 'gatehouse.consensus.get') throw { code: 'rate_limited', message: 'Private detail', retry_after_ms: 2000 };
    if (method === 'gatehouse.history.list') return new Promise(resolve => { finish = resolve; });
    return structuredClone(h.responses.get(method));
  });
  const pending = h.port.load();
  await vi.waitFor(() => expect(h.port.getSnapshot().chat).toEqual(chatPage));
  expect(h.port.getSnapshot().busy).toBe(true); expect(h.port.getSnapshot().phase).toBe('loading');
  expect(h.port.getSnapshot().notice).toContain('Consensus read failed');
  const calls = h.rpc.mock.calls.length; await h.port.load(); expect(h.rpc).toHaveBeenCalledTimes(calls);
  finish(historyPage); await pending;
  const snapshot = h.port.getSnapshot();
  expect(snapshot.history).toEqual(historyPage); expect(snapshot.busy).toBe(false); expect(snapshot.phase).toBe('error');
  expect(snapshot.notice).toContain('rate limited'); expect(snapshot.notice).toContain('2000');
  expect(snapshot.notice).toContain('Loaded: Rules, Chat, History'); expect(snapshot.notice).not.toContain('Private detail');
});

test('all twelve existing methods send schema-validated parameters over the injected transport', async () => {
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
    ['gatehouse.chat.list', { limit: 100 }], ['gatehouse.history.list', { limit: 100 }],
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

test('chat and history parse generated read contracts, preserve provenance and refuse malformed replies', async () => {
  const h = harness(); await h.port.load();
  expect(h.port.getSnapshot().chat).toEqual(chatPage);
  expect(h.port.getSnapshot().history).toEqual(historyPage);
  const html = renderToStaticMarkup(createElement(ConnectedGatehouse, { port: h.port, replay: false }));
  for (const text of ['Synthetic core chat text', 'live', 'simulated', '2 unavailable', '3 unavailable']) {
    expect(html).toContain(text);
  }
  expect(html).not.toContain('Propose Ban'); expect(html).not.toContain('Save armed rule');
  for (const method of ['gatehouse.chat.list', 'gatehouse.history.list']) {
    const bad = method === 'gatehouse.chat.list' ? { ...chatPage, items: [{ ...chatPage.items[0], provenance: 'invented' }] }
      : { ...historyPage, unavailable_count: -1 };
    h.responses.set(method, bad); await h.port.load();
    expect(h.port.getSnapshot().phase).toBe('error');
    expect(h.port.getSnapshot()[method === 'gatehouse.chat.list' ? 'chat' : 'history']).toBeUndefined();
    h.responses.set(method, method === 'gatehouse.chat.list' ? chatPage : historyPage);
  }
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
  expect(html).toContain('live parity: pending capture evidence');
  expect(html).not.toMatch(/live (?:match|mismatch)|parity (?:match|mismatch)/i);
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
  expect(h.port.getSnapshot().notice).toContain('rate limited'); expect(h.port.getSnapshot().notice).toContain('2000');
  expect(h.port.getSnapshot().notice).not.toContain('Private upstream detail');
  const failed = renderToStaticMarkup(createElement(ConnectedGatehouse, { port: h.port, replay: true }));
  expect(failed).toContain('role="status"'); expect(failed).toContain('rate limited');
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
  expect(h.rpc.mock.calls.map(call => call[2])).toEqual(['gatehouse.rules.list', 'gatehouse.consensus.get',
    'gatehouse.chat.list', 'gatehouse.history.list', 'gatehouse.rules.upsert']);
});

test('empty scanned pages keep cursors, counts accumulate, refresh resets and malformed next pages never replace rows', async () => {
  const h = harness(); await h.port.load();
  h.responses.set('gatehouse.chat.list', { items: [], unavailable_count: 4, next_cursor: 'chat:200' });
  await h.port.moreChat();
  expect(h.port.getSnapshot().chat).toMatchObject({ items: chatPage.items, unavailable_count: 6, next_cursor: 'chat:200' });
  expect(h.rpc).toHaveBeenLastCalledWith(launch.endpoint, launch.session_token, 'gatehouse.chat.list', { limit: 100, cursor: 'chat:100' });
  h.responses.set('gatehouse.chat.list', { items: [], unavailable_count: 0 });
  await h.port.moreChat();
  expect(h.port.getSnapshot().chat?.next_cursor).toBeUndefined();
  const calls = h.rpc.mock.calls.length; await h.port.moreChat(); expect(h.rpc).toHaveBeenCalledTimes(calls);
  const previous = h.port.getSnapshot().history;
  h.responses.set('gatehouse.history.list', { items: [], unavailable_count: null }); await h.port.moreHistory();
  expect(h.port.getSnapshot().history).toBe(previous); expect(h.port.getSnapshot().phase).toBe('error');
  h.responses.set('gatehouse.history.list', { items: [], unavailable_count: 5 }); await h.port.moreHistory();
  expect(h.port.getSnapshot().history).toEqual({ items: historyPage.items, unavailable_count: 8 });
  expect(h.rpc).toHaveBeenLastCalledWith(launch.endpoint, launch.session_token, 'gatehouse.history.list', { limit: 100, cursor: 'history:100' });
  h.responses.set('gatehouse.chat.list', chatPage); h.responses.set('gatehouse.history.list', historyPage);
  await h.port.load(); expect(h.port.getSnapshot().chat).toEqual(chatPage); expect(h.port.getSnapshot().history).toEqual(historyPage);
});

test('4,200 validated core chat rows mount bounded windows with provenance through the final row', async () => {
  const h = harness(); let page = 0;
  h.rpc.mockImplementation(async (_endpoint, _session, method) => {
    if (method !== 'gatehouse.chat.list') return structuredClone(h.responses.get(method));
    const start = page++ * 100;
    return { items: Array.from({ length: 100 }, (_, i) => {
      const index = start + i;
      return { ...chatPage.items[0], provenance: index % 2 ? 'simulated' : 'live',
        decision: { ...readDecision, decision_id: `01ARZ3NDEKTSV4RR${index.toString().padStart(10, '0')}`,
          message_id: `synthetic-core-${index}` },
        message: { ...chatPage.items[0]?.message, message_id: `synthetic-core-${index}`, text: `Synthetic core row ${index}` } };
    }), unavailable_count: 0, ...(page < 42 ? { next_cursor: `chat:${page * 100}` } : {}) };
  });
  await h.port.load();
  for (let i = 1; i < 42; i++) await h.port.moreChat();
  expect(h.port.getSnapshot().chat?.items).toHaveLength(4200);
  const render = (scroll_top: number) => renderToStaticMarkup(createElement(CoreChat, { state: h.port.getSnapshot(), port: h.port, scroll_top }));
  const first = render(0); const last = render(4200 * 64);
  expect(first).toContain('aria-rowcount="4200"'); expect(first).toContain('Synthetic core row 0');
  expect(first).not.toContain('Synthetic core row 4199'); expect(last).toContain('Synthetic core row 4199');
  for (const html of [first, last]) {
    expect(html.match(/data-message-row=/g)?.length).toBeLessThan(30);
    expect(html).toContain('data-provenance="live"'); expect(html).toContain('data-provenance="simulated"');
  }
});

test('a listed capture replays its stored configuration and compares against that capture baseline', async () => {
  const h = harness(); await h.port.load(); await h.port.loadLiveRuns();
  h.port.selectCapture(captureItem.decision_id);
  await h.port.runCapture();
  expect(h.rpc).toHaveBeenLastCalledWith(launch.endpoint, launch.session_token, 'gatehouse.drill.run', {
    recording: capture.recording, configuration: capture.configuration,
  });
  expect(h.port.getSnapshot().replay_capture?.instrument_hash).toBe(capture.instrument_hash);
  const html = renderToStaticMarkup(createElement(ConnectedGatehouse, { port: h.port, replay: true }));
  expect(html).toContain(capture.recording); expect(html).toContain('Capture and replay instrument hashes match.');
  h.responses.set('gatehouse.drill.diff', { ...diffResult, candidate: { ...fixtureReplay, instrument_hash: 'f'.repeat(64) } });
  await h.port.compareCapture(configuration);
  expect(h.rpc).toHaveBeenLastCalledWith(launch.endpoint, launch.session_token, 'gatehouse.drill.diff', {
    recording: capture.recording, baseline: capture.configuration, candidate: configuration,
  });
  const compared = renderToStaticMarkup(createElement(ConnectedGatehouse, { port: h.port, replay: true }));
  expect(compared).toContain('Capture and replay instrument hashes match.');
  expect(compared).toContain('Capture and replay instrument hashes differ.');
  expect(compared).toContain('their results are not merged');
  h.port.selectCapture();
  expect(h.port.getSnapshot().drill).toBeUndefined(); expect(h.port.getSnapshot().diff).toBeUndefined();
  expect(h.port.getSnapshot().replay_capture).toBeUndefined();
});

test('capture paging replaces bounded pages, follows empty windows and refuses malformed or oversized pages', async () => {
  const h = harness(); await h.port.loadLiveRuns();
  h.port.selectCapture(captureItem.decision_id);
  const selected = h.port.getSnapshot().selected_capture;
  expect(h.rpc).toHaveBeenLastCalledWith(launch.endpoint, launch.session_token, 'gatehouse.liveRun.get', { limit: 100 });
  const unavailable = { coverage: 'unavailable', decision_id: '01K8F7A0000000000000000003', reason: 'recording_unavailable' };
  const rows = Array.from({ length: 100 }, (_, i) => ({ ...unavailable,
    decision_id: `01ARZ3NDEKTSV4RR${i.toString().padStart(10, '0')}` }));
  h.responses.set('gatehouse.liveRun.get', { items: rows, unavailable_count: 100, next_cursor: 'liveRun:200' });
  await h.port.moreLiveRuns(); expect(h.port.getSnapshot().live_runs?.items).toHaveLength(100);
  expect(h.port.getSnapshot().selected_capture).toBe(selected);
  const render = (scroll_top: number) => renderToStaticMarkup(createElement(CaptureList, { state: h.port.getSnapshot(), port: h.port, scroll_top }));
  const first = render(0); const last = render(100 * 256);
  expect(first).toContain('aria-rowcount="100"'); expect(first).toContain(rows[0]?.decision_id);
  expect(first).not.toContain(rows[99]?.decision_id); expect(last).toContain(rows[99]?.decision_id);
  for (const html of [first, last]) expect(html.match(/data-capture-id=/g)?.length).toBeLessThan(10);
  expect(h.rpc).toHaveBeenLastCalledWith(launch.endpoint, launch.session_token, 'gatehouse.liveRun.get', { limit: 100, cursor: 'liveRun:100' });
  h.responses.set('gatehouse.liveRun.get', { items: [], unavailable_count: 0, next_cursor: 'liveRun:300' });
  await h.port.moreLiveRuns(); expect(h.port.getSnapshot().live_runs?.items).toEqual([]);
  h.responses.set('gatehouse.liveRun.get', { items: Array.from({ length: 101 }, () => unavailable), unavailable_count: 101 });
  await h.port.moreLiveRuns(); expect(h.port.getSnapshot().phase).toBe('error');
  expect(h.port.getSnapshot().live_runs?.items).toEqual([]);
  h.responses.set('gatehouse.liveRun.get', { items: [], unavailable_count: 0 }); await h.port.moreLiveRuns();
  expect(h.rpc).toHaveBeenLastCalledWith(launch.endpoint, launch.session_token, 'gatehouse.liveRun.get', { limit: 100, cursor: 'liveRun:300' });
  const count = h.rpc.mock.calls.length; await h.port.moreLiveRuns(); expect(h.rpc).toHaveBeenCalledTimes(count);
  h.responses.set('gatehouse.liveRun.get', { items: [{ ...captureItem, provenance: 'unsupported' }], unavailable_count: 0 });
  await h.port.loadLiveRuns(); expect(h.port.getSnapshot().phase).toBe('error');
  expect(h.port.getSnapshot().live_runs).toBeUndefined();
});

test('replay gaps and unavailable captures cannot run or compare and display explicit coverage gaps', async () => {
  const h = harness();
  for (const item of [
    { ...captureItem, capture: { ...capture, replay_gap: 'bridge_gap' } },
    { ...captureItem, capture: { ...capture, replay_gap: 'runtime_context_not_replayable' } },
    { ...captureItem, capture: { ...capture, replay_gap: 'classifier_not_replayable' } },
    { ...captureItem, capture: { ...capture, gaps: [{ from: capture.from, to: capture.to }] } },
    { coverage: 'unavailable', decision_id: captureItem.decision_id, reason: 'capture_unavailable' },
    { coverage: 'unavailable', decision_id: captureItem.decision_id, reason: 'recording_unavailable' },
  ]) {
    h.responses.set('gatehouse.liveRun.get', { items: [item], unavailable_count: item.coverage === 'unavailable' ? 1 : 0 });
    await h.port.loadLiveRuns(); const count = h.rpc.mock.calls.length;
    const html = renderToStaticMarkup(createElement(ConnectedGatehouse, { port: h.port, replay: true }));
    expect(html).toContain('Coverage gap'); expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Use capture<\/button>/);
    h.port.selectCapture(captureItem.decision_id); await h.port.runCapture(); await h.port.compareCapture(configuration);
    expect(h.rpc).toHaveBeenCalledTimes(count); expect(h.port.getSnapshot().selected_capture).toBeUndefined();
  }
});

test('capture expiry and rule conflicts fail without stale comparison or hash-match output', async () => {
  const h = harness(); await h.port.loadLiveRuns(); h.port.selectCapture(captureItem.decision_id);
  await h.port.runCapture(); expect(h.port.getSnapshot().drill).toBeDefined();
  h.rpc.mockRejectedValueOnce({ code: 'unavailable', message: 'Synthetic expired recording' });
  await h.port.runCapture();
  expect(h.port.getSnapshot().phase).toBe('error'); expect(h.port.getSnapshot().drill).toBeUndefined();
  expect(h.port.getSnapshot().replay_capture).toBeUndefined();
  const html = renderToStaticMarkup(createElement(ConnectedGatehouse, { port: h.port, replay: true }));
  expect(html).not.toContain('Capture and replay instrument hashes match.'); expect(html).toContain('unavailable');
  await h.port.compareCapture(configuration); expect(h.port.getSnapshot().diff).toBeDefined();
  h.rpc.mockRejectedValueOnce({ code: 'conflict', message: 'Synthetic changed instrument' });
  await h.port.compareCapture(configuration); expect(h.port.getSnapshot().diff).toBeUndefined();
  expect(h.port.getSnapshot().notice).toContain('conflict'); expect(h.port.getSnapshot().replay_capture).toBeUndefined();
});
