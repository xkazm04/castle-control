import { Children, createElement, isValidElement } from 'react';
import type { ChangeEvent, ReactNode, SelectHTMLAttributes } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ConnectedLotsRoom } from './rooms/lottery/core.jsx';
import { lotsCopy as copy } from './lots-copy.js';
import { afterEach, expect, test, vi } from 'vitest';
import type { DrawCheckResult } from '@castle-control/contract';
import { parseMethodResult } from '@castle-control/contract';
import { lotsRollSeal } from '@castle-control/contract/lots';
import { createCoreLotsPort, lotsRoundLabel } from './lots-core.js';
import type { LotsNetwork } from './lots-core.js';
import { fixtureDraws, fixtureWrit } from './lots-fixture.js';
import { DrawAppearance } from './rooms/lottery/appearance.jsx';

const launch = { mode: 'core', endpoint: 'http://127.0.0.1:3210/', session_token: 'a'.repeat(64) } as const;
const run_id = '01ARZ3NDEKTSV4RRFFQ69G5FAV';
const writ_id = '01ARZ3NDEKTSV4RRFFQ69G5FAW';
const first = fixtureDraws[0];
if (!first) throw new Error('Missing generated test draw');
const draw = first;
const sealed = { draw_id: draw.draw_id, draw_run_id: run_id,
  sealed: { roll: fixtureWrit.roll, seal: fixtureWrit.seal } };
const cast = { draw_run_id: run_id, writ_id,
  cast: { seal: fixtureWrit.seal, winners: fixtureWrit.winners, label: 'streamer-controlled' } };

function harness() {
  const responses = new Map<string, unknown>([
    ['lots.draw.list', { draws: fixtureDraws }], ['lots.draw.upsert', draw],
    ['lots.draw.check', { result: 'ok', reasons: [] }], ['lots.roll.lookup', { draw_id: draw.draw_id }],
    ['lots.roll.seal', sealed], ['lots.cast', cast], ['lots.writ.get', fixtureWrit],
  ]);
  const rpc = vi.fn<LotsNetwork['rpc']>(async (_endpoint, _session, method) => structuredClone(responses.get(method)));
  const fetch = vi.fn(() => { throw new Error('Unexpected fetch'); });
  const socket = vi.fn(() => { throw new Error('Unexpected socket'); });
  vi.stubGlobal('fetch', fetch); vi.stubGlobal('WebSocket', socket);
  return { port: createCoreLotsPort(launch, { rpc }), rpc, responses, fetch, socket };
}
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

test('core appearance controls save their chosen display through the validated upsert', async () => {
  const h = harness(); await h.port.load();
  const appearance = h.port.appearance(draw.draw_id);
  let controls: ReactNode;
  function Probe() { controls = DrawAppearance({ port: appearance, preview: false }); return null; }
  renderToStaticMarkup(createElement(Probe));
  const choose = (id: string, value: string) => {
    let changed = false;
    function visit(tree: ReactNode) {
      Children.forEach(tree, child => {
        if (!isValidElement<SelectHTMLAttributes<HTMLSelectElement>>(child)) return;
        if (child.props.id === id) {
          child.props.onChange?.({ currentTarget: { value } } as ChangeEvent<HTMLSelectElement>);
          changed = true;
        } else visit(child.props.children);
      });
    }
    visit(controls); expect(changed).toBe(true);
  };
  choose('lots-size', 'L'); choose('lots-anchor', 'tl'); choose('lots-colour', 'azure'); choose('lots-art', 'pixel');
  appearance.commitReveal('750');
  await h.port.saveDisplay();
  expect(h.rpc.mock.calls.findLast(call => call[2] === 'lots.draw.upsert')?.[3]).toEqual({ draw,
    display: { size: 'L', anchor: 'top-left', colour_token: 'azure', art_style: 'pixel', timing_ms: 750 } });
  const html = renderToStaticMarkup(createElement(ConnectedLotsRoom, { port: h.port }));
  expect(html).toContain('Save draw appearance');
  expect(html).toContain('Reloading the room cannot read saved appearance yet');
});

test.each([
  ['lots.cast', 'The announced round has not arrived yet. Wait, then Cast again.'],
  ['lots.roll.seal', 'The seal missed its round; this attempt is used up. Reconcile in the core before sealing again.'],
] as const)('lots-02 %s conflict has a specific remedy without upstream prose', async (method, notice) => {
  const h = harness(); await h.port.load();
  if (method === 'lots.cast') await h.port.seal();
  h.rpc.mockImplementation(async (_endpoint, _session, name) => {
    if (name === method) throw { code: 'conflict', message: 'simulated private upstream prose' };
    return structuredClone(h.responses.get(name));
  });
  await (method === 'lots.cast' ? h.port.start() : h.port.seal());
  expect(h.port.getSnapshot().notice).toBe(notice);
});
test('lots-02 a good cast with mismatched proof retains winners and names only the proof failure', async () => {
  const h = harness(); await h.port.load(); await h.port.seal();
  h.responses.set('lots.writ.get', { ...fixtureWrit, seal: '0'.repeat(64) }); await h.port.start();
  expect(h.port.getSnapshot()).toMatchObject({ started: true, cast_result: cast });
  expect(h.port.getSnapshot().writ).toBeUndefined();
  expect(h.port.getSnapshot().notice).toBe('Cast received. The proof bundle could not be loaded; use Reload proof bundle.');
  expect(h.port.getSnapshot().notice).not.toContain('Draw request failed');
});
test('lots-02 unparseable failures keep the generic fallback without echoing upstream prose', async () => {
  const h = harness(); h.rpc.mockRejectedValueOnce({ code: 'unknown', message: 'simulated private upstream prose' });
  await h.port.load();
  expect(h.port.getSnapshot().notice).toBe('Draw request failed. The result is unavailable or invalid; no preview was substituted.');
});

test('loads and selects service draws, validates upsert, and notifies subscribers without browser networking', async () => {
  const h = harness(); const listener = vi.fn();
  const stop = h.port.subscribe(listener);
  expect(h.port.getSnapshot().draw).toBeUndefined();
  expect(h.port.getSnapshot().entries).toEqual([]);
  await h.port.load();
  expect(h.port.getSnapshot().draws).toEqual(fixtureDraws);
  expect(h.port.getSnapshot().draw).toEqual(draw);
  expect(h.rpc.mock.calls[0]?.slice(2)).toEqual(['lots.draw.list', {}]);
  await h.port.select(fixtureDraws[1]?.draw_id ?? 'missing');
  expect(h.port.getSnapshot().draw).toEqual(fixtureDraws[1]);
  await h.port.edit(draw);
  expect(h.rpc).toHaveBeenCalledWith(launch.endpoint, launch.session_token, 'lots.draw.upsert', { draw });
  expect(h.port.getSnapshot().draw).toEqual(draw);
  expect(listener).toHaveBeenCalled(); stop(); const calls = listener.mock.calls.length;
  h.port.shape('wheel'); expect(listener).toHaveBeenCalledTimes(calls);
  expect(h.fetch).not.toHaveBeenCalled(); expect(h.socket).not.toHaveBeenCalled();
});

test.each<DrawCheckResult>([
  { result: 'blocked', reasons: ['paid_weight'] }, { result: 'warn', reasons: ['subscriber_only'] },
  { result: 'ok', reasons: [] },
])('uses the service policy check: $result', async check => {
  const h = harness(); h.responses.set('lots.draw.check', check);
  await h.port.load(); await h.port.check();
  expect(h.port.getSnapshot().check).toEqual(check);
  expect(h.port.getSnapshot().notice).toContain(check.result);
  expect(h.port.getSnapshot().notice).toContain(check.reasons.join(', '));
  await h.port.seal();
  expect(h.rpc.mock.calls.some(call => call[2] === 'lots.roll.seal')).toBe(check.result !== 'blocked');
});

test('looks up a Twitch user ID, represents absence, and rejects handles before transport', async () => {
  const h = harness(); await h.port.load();
  await h.port.lookup('42');
  expect(h.rpc).toHaveBeenLastCalledWith(launch.endpoint, launch.session_token, 'lots.roll.lookup', { draw_id: draw.draw_id, user_id: '42' });
  expect(h.port.getSnapshot().lookup_result?.entry).toBeUndefined();
  const entry = { user_id: '42', source_message_id: 'simulated-message', entered_at: '2026-10-25T12:00:00Z', cohorts: [], weight: 1 };
  h.responses.set('lots.roll.lookup', { draw_id: draw.draw_id, entry });
  await h.port.lookup('42'); expect(h.port.getSnapshot().lookup_result?.entry).toEqual(entry);
  const count = h.rpc.mock.calls.length;
  await h.port.lookup('@simulated'); expect(h.rpc).toHaveBeenCalledTimes(count);
  expect(h.port.getSnapshot().notice).toBe('Enter a numeric Twitch user ID.');
});

test('seal, cast and writ use only server authority and the documented request fields', async () => {
  const h = harness(); await h.port.load(); await h.port.seal();
  expect(h.port.getSnapshot().entries).toEqual(fixtureWrit.roll.entries);
  expect(h.port.getSnapshot().cast_result).toBeUndefined();
  await h.port.start();
  expect(h.port.getSnapshot().cast_result).toEqual(cast);
  expect(h.port.getSnapshot().writ).toEqual(fixtureWrit);
  expect(h.rpc.mock.calls.slice(-3).map(call => call.slice(2))).toEqual([
    ['lots.roll.seal', { draw_id: draw.draw_id, source: 'drand_quicknet', margin_s: 6 }],
    ['lots.cast', { draw_run_id: run_id }], ['lots.writ.get', { writ_id }],
  ]);
  for (const call of h.rpc.mock.calls) {
    expect(call[2]).not.toMatch(/^steward\./);
    for (const field of ['entries', 'winners', 'seed']) expect(call[3]).not.toHaveProperty(field);
  }
});

test('RPC errors become visible notices and never supply fixture draws or winners', async () => {
  const h = harness(); h.rpc.mockRejectedValueOnce({ code: 'unavailable', message: 'Core unavailable' });
  await h.port.load();
  expect(h.port.getSnapshot().notice).toContain('unavailable');
  expect(h.port.getSnapshot().draws).toEqual([]);
  expect(h.port.getSnapshot().draw).toBeUndefined();
  expect(h.port.getSnapshot().cast_result).toBeUndefined();
  await h.port.load(); await h.port.seal();
  h.rpc.mockRejectedValueOnce({ code: 'upstream', message: 'Beacon unavailable' });
  await h.port.start();
  expect(h.port.getSnapshot().notice).toContain('upstream');
  expect(h.port.getSnapshot().cast_result).toBeUndefined();
  expect(h.port.getSnapshot().writ).toBeUndefined();
});

test('malformed service results are rejected at the contract boundary', async () => {
  const h = harness(); h.responses.set('lots.draw.list', { draws: [{ ...draw, extra: true }] });
  await h.port.load(); expect(h.port.getSnapshot().draws).toEqual([]);
  expect(h.port.getSnapshot().notice).toContain('failed');
  h.responses.set('lots.draw.list', { draws: [draw] }); await h.port.load(); await h.port.seal();
  h.responses.set('lots.cast', { ...cast, cast: { ...cast.cast, winners: [] } });
  await h.port.start(); expect(h.port.getSnapshot().cast_result).toBeUndefined();
});

test('empty service lists clear the selection and never reuse a fixture', async () => {
  const h = harness(); await h.port.load();
  h.responses.set('lots.draw.list', { draws: [] }); await h.port.load();
  expect(h.port.getSnapshot().draw).toBeUndefined();
  expect(h.port.getSnapshot().draws).toEqual([]);
  const count = h.rpc.mock.calls.length;
  await h.port.seal(); expect(h.rpc).toHaveBeenCalledTimes(count);
});

test('a cast for another run and a writ with different winners are never displayed', async () => {
  const h = harness(); await h.port.load(); await h.port.seal();
  h.responses.set('lots.cast', { ...cast, draw_run_id: writ_id });
  await h.port.start(); expect(h.port.getSnapshot().cast_result).toBeUndefined();
  expect(h.port.getSnapshot().notice).toContain('failed');
  h.responses.set('lots.cast', cast);
  h.responses.set('lots.writ.get', { ...fixtureWrit, winners: ['simulated_other'] });
  await h.port.start();
  expect(h.port.getSnapshot().cast_result).toEqual(cast);
  expect(h.port.getSnapshot().writ).toBeUndefined();
  expect(h.port.getSnapshot().notice).toContain('proof bundle could not be loaded');
  h.responses.set('lots.writ.get', fixtureWrit); await h.port.recompute();
  expect(h.port.getSnapshot().writ).toEqual(fixtureWrit);
});

test('every port method preserves the roll after seal, including attempted edits and reselection', async () => {
  const h = harness(); await h.port.load(); await h.port.seal();
  const before = h.port.getSnapshot();
  const attempts = [
    () => h.port.edit({ ...draw, name: 'Changed', rules: { ...draw.rules, winner_count: 1 } }),
    () => h.port.select(fixtureDraws[1]?.draw_id ?? 'missing'), () => h.port.pause(), () => h.port.seal(),
    () => h.port.load(), () => h.port.lookup('42'), () => h.port.check(),
    () => h.port.shape('deck'), () => h.port.nested(true), () => h.port.start(), () => h.port.recompute(),
  ];
  for (const attempt of attempts) {
    await attempt(); const current = h.port.getSnapshot();
    expect(current.entries).toBe(before.entries); expect(current.draw).toBe(before.draw);
    expect(current.seal_result).toBe(before.seal_result); expect(current.sealed).toBe(true);
  }
  expect(h.rpc.mock.calls.filter(call => call[2] === 'lots.roll.seal')).toHaveLength(1);
  expect(h.rpc.mock.calls.filter(call => call[2] === 'lots.draw.upsert')).toHaveLength(0);
  expect(() => Object.assign(h.port.getSnapshot().entries, { 0: { handle: 'changed', weight: 1 } })).toThrow();
});

test('sealing in flight rejects edits, and an uncertain seal failure keeps the roll locked', async () => {
  const h = harness(); await h.port.load();
  let rejectSeal: ((reason: unknown) => void) | undefined;
  h.rpc.mockImplementation(async (_endpoint, _session, method) => method === 'lots.roll.seal'
    ? new Promise((_resolve, reject) => { rejectSeal = reject; }) : structuredClone(h.responses.get(method)));
  const pending = h.port.seal(); await vi.waitFor(() => { expect(rejectSeal).toBeDefined(); });
  await h.port.edit(draw); await h.port.select('free-prize');
  rejectSeal?.(new Error('Connection lost')); await pending;
  await h.port.edit(draw); await h.port.seal();
  expect(h.port.getSnapshot().locked).toBe(true);
  expect(h.rpc.mock.calls.filter(call => call[2] === 'lots.draw.upsert')).toHaveLength(0);
  expect(h.rpc.mock.calls.filter(call => call[2] === 'lots.roll.seal')).toHaveLength(1);
});

test('reuses strict launch validation before any network call', () => {
  const rpc = vi.fn();
  for (const endpoint of ['https://127.0.0.1/', 'http://localhost/', 'http://127.0.0.1/rpc', 'http://example.com/']) {
    expect(() => createCoreLotsPort({ ...launch, endpoint }, { rpc })).toThrow();
  }
  expect(() => createCoreLotsPort({ ...launch, session_token: 'invalid' }, { rpc })).toThrow();
  expect(rpc).not.toHaveBeenCalled();
});

test('source labels distinguish recorded simulated rounds, unknown native source and live-trusted seals', () => {
  const accepted = (value: unknown) => parseMethodResult(lotsRollSeal, JSON.stringify(value));
  expect(lotsRoundLabel(undefined, undefined)).toContain('unknown');
  expect(lotsRoundLabel(true, undefined)).toContain('Recorded · simulated');
  expect(lotsRoundLabel(false, undefined)).toContain('opt-in');
  const live = { ...sealed, sealed: { ...sealed.sealed, roll: { ...sealed.sealed.roll,
    randomness: { source: 'drand_quicknet' as const, chain_hash: '52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971', round: '33333333' } } } };
  expect(lotsRoundLabel(false, accepted(live))).toContain('Live-trusted quicknet');
  expect(lotsRoundLabel(true, accepted(live))).toContain('Recorded · simulated');
  expect(lotsRoundLabel(false, accepted(sealed))).toContain('Streamer-controlled');
  const recorded = { ...live, sealed: { ...live.sealed, roll: { ...live.sealed.roll, sealed_at: '2023-08-23T15:09:28Z' } } };
  expect(lotsRoundLabel(false, accepted(recorded))).toContain('Recorded · simulated');
});

test('seal-announced state precedes cast and no-prize creation needs only existing upsert', async () => {
  const h = harness();
  await h.port.createQuestionDraw();
  const proposed = h.rpc.mock.calls.find(call => call[2] === 'lots.draw.upsert')?.[3];
  expect(proposed).toMatchObject({ draw: { policy: { content: 'question', paid_entry: false, paid_weight: false },
    rules: { pool: { kind: 'keyword', keyword: '!join' }, winner_count: 1 } } });
  await h.port.seal();
  expect(h.port.getSnapshot().notice).toContain('Seal announced');
  expect(h.port.getSnapshot().cast_result).toBeUndefined();
  expect(h.rpc.mock.calls.some(call => call[2] === 'lots.cast')).toBe(false);
});

test('connected room renders source provenance and the announcement before any winners', async () => {
  const draw = fixtureDraws[0];
  if (!draw) throw new Error('Missing simulated draw');
  const port = createCoreLotsPort({ mode: 'core', endpoint: 'http://127.0.0.1:3210/', session_token: 'a'.repeat(64) }, {
    rpc: async (_endpoint, _session, method) => {
      if (method === 'lots.draw.list') return { draws: [draw] };
      if (method === 'lots.draw.check') return { result: 'ok', reasons: [] };
      if (method === 'lots.roll.seal') return { draw_id: draw.draw_id, draw_run_id: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
        sealed: { roll: fixtureWrit.roll, seal: fixtureWrit.seal } };
      throw new Error('Unexpected request in simulated room test');
    },
  });
  await port.load(); await port.seal();
  const markup = renderToStaticMarkup(createElement(ConnectedLotsRoom, { port, simulated: true }));
  expect(markup).toContain('Recorded · simulated round source');
  expect(markup).toContain('Seal announced');
  expect(markup).not.toContain(copy.core.locked);
  expect(markup).toContain('Cast the lots');
  expect(markup).not.toContain('Winners ·');
  expect(markup).not.toContain('Live-trusted');
  expect(markup.indexOf('class="cc-stage-wrap"')).toBeLessThan(markup.indexOf('class="cc-desk"'));
  expect(markup).toContain('data-scale="viewport"');
  expect(markup).toContain('data-size="large"');
  expect(markup).not.toContain(copy.illustration);
});


test('lots-02 seal policy and lookup failures have remedies and safe retry timing', async () => {
  const h = harness(); await h.port.load();
  h.rpc.mockImplementation(async (_endpoint, _session, method) => {
    if (method === 'lots.roll.seal') throw { code: 'blocked_by_policy', message: 'simulated private detail', retry_after_ms: 1000 };
    return structuredClone(h.responses.get(method));
  });
  await h.port.seal();
  expect(h.port.getSnapshot().notice).toBe(`${copy.core.request_errors['lots.roll.seal'].blocked_by_policy} Retry after 1000 ms.`);
  expect(h.port.getSnapshot().notice).not.toContain('simulated private detail');
});
test('lots-02 a transport failure loading proof keeps a successful cast, and proof reload recovers', async () => {
  const h = harness(); await h.port.load(); await h.port.seal();
  h.rpc.mockImplementation(async (_endpoint, _session, method) => {
    if (method === 'lots.writ.get') throw { code: 'unavailable', message: 'simulated private detail' };
    return structuredClone(h.responses.get(method));
  });
  await h.port.start(); expect(h.port.getSnapshot()).toMatchObject({ started: true, cast_result: cast });
  expect(h.port.getSnapshot().notice).toBe(copy.core.proof_unavailable);
  h.rpc.mockImplementation(async (_endpoint, _session, method) => structuredClone(h.responses.get(method)));
  await h.port.recompute(); expect(h.port.getSnapshot().writ).toEqual(fixtureWrit);
  expect(h.port.getSnapshot().notice).toContain('Proof bundle loaded');
});
