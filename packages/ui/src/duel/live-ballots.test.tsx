import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createChatSession, SAMPLE, stepChat } from '@castle-control/duel';
import { indexWindow, parseBallotPage } from '@castle-control/duel/ballots';
import type { Ballot, IndexedWindow } from '@castle-control/duel/ballots';
import { afterEach, expect, test, vi } from 'vitest';
import { Chat } from './chat.jsx';
import { nextDue, useSessionClock } from './clock.js';
import { useLiveBallots } from './live-ballots.js';
import type { TiltyardProps } from './types.js';
import { tiltyardWords as words } from './words.js';

vi.mock('react', async original => ({ ...await original<typeof React>() }));
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

// Node-only lifecycle probes retain local state and commit the real hook's effect.
function effectProbe() {
  let pending: React.EffectCallback | undefined;
  let previous: React.DependencyList | undefined;
  let cleanup: ReturnType<React.EffectCallback>;
  vi.spyOn(React, 'useEffect').mockImplementation((effect, dependencies) => {
    if (!dependencies || !previous || dependencies.some((value, i) => value !== previous?.[i])) {
      pending = effect; previous = dependencies;
    }
  });
  return {
    commit() { if (pending) { cleanup?.(); cleanup = pending(); pending = undefined; } },
    unmount() { cleanup?.(); },
  };
}
function harness() {
  let current: IndexedWindow = indexWindow([]);
  const state = vi.spyOn(React, 'useState');
  let ref: { current: unknown } | undefined;
  vi.spyOn(React, 'useRef').mockImplementation(initial => ref ??= { current: initial });
  const effects = effectProbe();
  const stops: ReturnType<typeof vi.fn>[] = [];
  const deliveries: ((ballots: readonly Ballot[]) => void)[] = [];
  const feed = vi.fn<NonNullable<TiltyardProps['ballot_feed']>>((_window, deliver) => {
    deliveries.push(deliver); const stop = vi.fn(); stops.push(stop); return stop;
  });
  let session = createChatSession(SAMPLE.chat, { key: 'mill', window_ms: 15000 });
  function render(active = true) {
    state.mockReturnValue([current, value => { current = value as IndexedWindow; }]);
    function Probe() {
      const window = useLiveBallots(feed, session, active);
      return <Chat session={session} window={window} words={words} on_event={() => undefined} />;
    }
    const html = renderToStaticMarkup(<Probe />); effects.commit(); return html;
  }
  return { feed, stops, deliveries, render, unmount: effects.unmount,
    step: (kind: 'enter' | 'cancel' | 'undo' | 'reset') => { session = stepChat(session, { kind, counted: [2, 1] }); },
    tick(ms: number) { session = stepChat(session, { kind: 'tick', ms, counted: [2, 1] }); },
  };
}
function ballot(user: string, opened_at: string, text: string, provenance = 'live', t_ms = 0): Ballot {
  const at = new Date(Date.parse(opened_at) + t_ms).toISOString();
  return parseBallotPage(JSON.stringify({ unavailable_count: 0, items: [{ provenance,
    message: { message_id: `simulated-${user}-${t_ms}`, user_id: user, at, text: `${text} [generated SIMULATED]` },
    decision: { decision_id: '00000000000000000000000001', message_id: `simulated-${user}-${t_ms}`,
      at, verdict: 'pass', kind: 'would_act', operator: 'ai', reason_codes: ['simulated'] },
  }] })).items[0]!;
}

test('a wall-clock live feed delivers twice, re-renders the tug and unsubscribes on verdict', () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-31T12:00:00Z'));
  const h = harness(); h.render();
  expect(h.feed).toHaveBeenCalledTimes(1);
  const window = h.feed.mock.calls[0]![0];
  expect(window).toEqual({ match_key: 'mill:0:0', opened_at: '2026-10-31T12:00:00.000Z', window_ms: 15000 });
  const a = ballot('101', window.opened_at, '1'); const b = ballot('102', window.opened_at, '2');
  const c = ballot('103', window.opened_at, '1');
  h.deliveries[0]?.([a]);
  const first = h.render();
  expect(first).toContain('Counted for <b>Raze the mill</b>: <b>1</b>');
  expect(first).toContain('Counted for <b>Borrow the mill</b>: <b>0</b>');
  h.deliveries[0]?.([a, b, c]);
  const second = h.render();
  expect(second).toContain('Counted for <b>Raze the mill</b>: <b>2</b>');
  expect(second).toContain('Counted for <b>Borrow the mill</b>: <b>1</b>');
  expect(second).toContain('Live chat · Gatehouse verdicts');
  expect(second).toContain('<span class="ty-u">101</span>'); expect(second).not.toContain('Simulated tally');
  expect(h.feed).toHaveBeenCalledTimes(1);
  h.step('enter'); const closed = h.render();
  expect(h.stops[0]).toHaveBeenCalledOnce();
  h.deliveries[0]?.([]); expect(h.render()).toBe(closed);
  h.unmount();
  console.log('[live ballot component] 2 deliveries; tug 1–0 then 2–1; 1 verdict unsubscribe');
});

test('mode changes, cancel, undo, reset and unmount close the outgoing subscription', () => {
  const h = harness(); h.render(); h.render(false);
  expect(h.stops[0]).toHaveBeenCalledOnce();
  h.render(); expect(h.feed).toHaveBeenCalledTimes(2);
  h.step('cancel'); h.render(); expect(h.stops[1]).toHaveBeenCalledOnce();
  h.step('enter'); h.render(); h.step('enter'); h.render();
  expect(h.stops[2]).toHaveBeenCalledOnce();
  h.step('undo'); h.render(); h.step('reset'); h.render();
  expect(h.stops[3]).toHaveBeenCalledOnce();
  h.unmount(); expect(h.stops[4]).toHaveBeenCalledOnce();
});

test('mixed deliveries label both sources and retain indexing for future known arrivals', () => {
  const h = harness(); h.render(); const opened_at = h.feed.mock.calls[0]![0].opened_at;
  h.deliveries[0]?.([ballot('101', opened_at, '1'), ballot('102', opened_at, '2', 'simulated', 500)]);
  const html = h.render();
  expect(html).toContain('data-provenance="mixed"'); expect(html).toContain('Live chat · Gatehouse verdicts · SIMULATED');
  h.tick(500); expect(h.render()).toContain('<span class="ty-u">simulated_viewer_0102</span>'); h.unmount();
  const session = createChatSession(SAMPLE.chat, { window_ms: 15000 });
  const events = indexWindow([{ t_ms: 500, user_id: '102', text: '2 [generated SIMULATED]', cheer: false,
    provenance: 'simulated', status: 'chatter' }]);
  expect(nextDue(session, events)).toBe(500);
});

test('the next live window never renders the previous match tally before its effect commits', () => {
  const h = harness(); h.render(); const opened_at = h.feed.mock.calls[0]![0].opened_at;
  h.deliveries[0]?.([ballot('101', opened_at, '1')]); h.render();
  h.step('enter'); h.render(); h.step('enter');
  const next = h.render();
  expect(next).toContain('<b>0</b> counted ballots'); expect(h.feed).toHaveBeenCalledTimes(2);
  h.unmount();
});

test('deliveries re-arm the clock without resetting its monotonic anchor', async () => {
  vi.useFakeTimers();
  let now = 0; vi.spyOn(performance, 'now').mockImplementation(() => now);
  const session = {};
  const ref = { current: { session, at: 0 } };
  vi.spyOn(React, 'useRef').mockReturnValue(ref);
  const effects = effectProbe(); const tick = vi.fn();
  function render(due: number) {
    function Probe() { useSessionClock(due, ms => tick(ms), session); return null; }
    renderToStaticMarkup(<Probe />); effects.commit();
  }
  render(1000); now = 500; await vi.advanceTimersByTimeAsync(500);
  render(550); now = 550; await vi.advanceTimersByTimeAsync(50);
  expect(tick).toHaveBeenCalledExactlyOnceWith(550); effects.unmount();
});
