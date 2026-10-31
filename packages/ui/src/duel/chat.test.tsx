import { renderToStaticMarkup } from 'react-dom/server';
import { createChatSession, SAMPLE, stepChat } from '@castle-control/duel';
import type { ChatSession } from '@castle-control/duel';
import { indexWindow, simulateChatPages, tallyAt } from '@castle-control/duel/ballots';
import { expect, test, vi } from 'vitest';
import { Chat, chatWindows } from './chat.jsx';
import { nextDue } from './clock.js';
import { Countdown, Seal } from './seal.jsx';
import { createTiltyardState, tiltyardReducer } from './session.js';
import { Tiltyard } from './stage.jsx';
import { Ticker } from './ticker.jsx';
import { tiltyardWords as words } from './words.js';

const initial = () => createChatSession(SAMPLE.chat, { key: 'mill', window_ms: SAMPLE.chat.window_ms });
const load = chatWindows(simulateChatPages);
const window = load(initial())!;
const noop = () => undefined;
const render = (session: ChatSession) => renderToStaticMarkup(<Chat session={session} window={window} words={words} on_event={noop} />);
function expectTug(html: string, elapsed: number) {
  const tally = tallyAt(window, elapsed);
  expect(html).toContain(`<span>Counted for <b>Raze the mill</b>: <b>${tally.counted[0]}</b></span>`);
  expect(html).toContain(`<span>Counted for <b>Borrow the mill</b>: <b>${tally.counted[1]}</b></span>`);
  expect(html).toContain(`<b>${tally.total}</b> counted ballots · one per viewer`);
  return tally;
}

test('9000ms SAMPLE chat renders the ring, seconds, indexed tug, barred ballots and newest five SIMULATED events', () => {
  const session = stepChat(initial(), { kind: 'tick', ms: 9000, counted: tallyAt(window, 9000).counted });
  const html = render(session);
  expect(html).toContain('ty-barrier');
  expect(html.match(/class="ty-cone /g)).toHaveLength(2);
  const tally = expectTug(html, 9000);
  expect(tally.barred[0] + tally.barred[1]).toBeGreaterThan(0);
  for (const role of ['ring', 'secs', 'tug', 'tug-bar', 'tug-left', 'tug-right', 'tug-legend', 'barred', 'hatch', 'flipnote', 'ticker', 'closed-note']) {
    expect(html).toContain(`data-role="ty-${role}"`);
  }
  expect(html).toContain('stroke-dasharray="351.9"');
  expect(html).toContain('data-role="ty-secs">6</b><small>seconds');
  expect(html).toContain('animation-duration:15000ms;animation-delay:-9000ms;stroke-dashoffset:211.14;animation-play-state:running');
  expect(html.match(/data-role="ty-tick"/g)).toHaveLength(5);
  expect(html).toContain('generated, not real chat');
  expect(html).toContain('SIMULATED · Simulated chat ticker');
  expect(html).toContain('Barred · never counted');
  const stage = renderToStaticMarkup(<Tiltyard lists={SAMPLE} words={words} label="SAMPLE · SIMULATED" initial_mode="chat" ballots={simulateChatPages} />);
  expect(stage).toContain('SAMPLE · SIMULATED');
  expect(stage).toContain('Window open.');
});

test('a simulated ticker renders padded viewer labels with source provenance', () => {
  const sample = indexWindow([{ ...window.events[0]!, user_id: '191' }]);
  const html = renderToStaticMarkup(<Ticker window={sample} seen={1} second={1} words={words} />);
  expect(html).toContain('data-provenance="simulated"');
  expect(html).toContain('<span class="ty-u">simulated_viewer_0191</span>');
});

test('live and mixed tickers use actual provenance and format each viewer independently', () => {
  const live = { ...window.events[0]!, user_id: '947', provenance: 'live' as const };
  const sample = indexWindow([live]);
  const html = renderToStaticMarkup(<Ticker window={sample} seen={1} second={1} words={words} />);
  expect(html).toContain('data-provenance="live"');
  expect(html).toContain('<span class="ty-u">947</span>');
  expect(html).not.toContain('simulated_viewer_');
  const mixed = indexWindow([live, { ...window.events[0]!, user_id: '191' }]);
  const mixed_html = renderToStaticMarkup(<Ticker window={mixed} seen={2} second={1} words={words} />);
  expect(mixed_html).toContain('data-provenance="mixed"');
  expect(mixed_html).toContain('<span class="ty-u">simulated_viewer_0191</span>');
  expect(mixed_html).toContain('<span class="ty-u">947</span>');
});

test('streamer calls keep their counted snapshot and render Your call with the public call line', () => {
  const counted = tallyAt(window, 9000).counted;
  const live = stepChat(initial(), { kind: 'tick', ms: 9000, counted });
  const called = stepChat(live, { kind: 'pick', side: 1, counted });
  expect(called.verdict?.how).toBe('call');
  expect(called.calls.at(-1)?.counted).toEqual(counted);
  const html = render(called);
  expectTug(html, 9000);
  expect(html).toContain('Your call');
  expect(html).toContain(`Streamer call · logged openly. Tally at the call: ${counted[0]}–${counted[1]}.`);
  expect(html).toContain('data-role="ty-secs">0</b><small>closed');
  expect(html).toContain('animation-play-state:paused');
  expect(nextDue(called, window)).toBe(1000);
});

test('tally close renders the flip note and winner copy, then advances after four real seconds', () => {
  const counted = tallyAt(window, 15000).counted;
  const closed = stepChat(initial(), { kind: 'tick', ms: 15000, counted });
  const html = render(closed);
  expectTug(html, 15000);
  expect(html).toContain('and lean the other way. They never count.');
  expect(html).toContain('Chat chose');
  expect(html).toContain('next match in <b>4</b>s');
  expect(stepChat(closed, { kind: 'tick', ms: 3999, counted }).phase).toBe('verdict');
  expect(stepChat(closed, { kind: 'tick', ms: 4000, counted }).match_key).toBe('mill:0:1');
});

test('no source renders the plain board and never invents a ticker or ballots', () => {
  const html = renderToStaticMarkup(<Tiltyard lists={SAMPLE} words={words} label="Chat" initial_mode="chat" />);
  expect(html).toContain('No ballot source is connected.');
  expect(html).not.toContain('ty-barrier');
  expect(html).not.toContain('ty-cone');
  expect(html).not.toContain('data-role="ty-tug"');
  expect(html).not.toContain('data-role="ty-ticker"');
  expect(html).not.toContain('Window open.');
});

test('source pages are memoised per match key across ticks, undo, pause and reset', () => {
  const source = vi.fn(simulateChatPages);
  const windows = chatWindows(source);
  let session = initial();
  const first = windows(session);
  session = stepChat(session, { kind: 'tick', ms: 9000, counted: [0, 0] });
  expect(windows(session)).toBe(first);
  session = stepChat(session, { kind: 'cancel', counted: [0, 0] });
  expect(windows(session)).toBe(first);
  const html = render(session);
  expect(html).toContain('Vote window paused'); expect(html).toContain('Resume the window');
  expect(html).not.toContain('ty-barrier');
  expect(html).not.toContain('ty-cone');
  session = stepChat(session, { kind: 'enter', counted: [0, 0] });
  expect(session.elapsed).toBe(9000);
  session = stepChat(stepChat(session, { kind: 'pick', side: 0, counted: [0, 0] }), { kind: 'enter', counted: [0, 0] });
  expect(windows(session)).not.toBe(first);
  session = stepChat(session, { kind: 'undo', counted: [0, 0] });
  expect(windows(session)).toBe(first);
  expect(windows(stepChat(session, { kind: 'reset', counted: [0, 0] }))).toBe(first);
  expect(source).toHaveBeenCalledTimes(2);
  expect(source.mock.calls[0]).toEqual(['mill:0:0', 15000, '2026-01-01T00:00:00.000Z']);
});

test('stage events include the time since the last wakeup and announce every close and new window', () => {
  const state = createTiltyardState(SAMPLE, 'chat', false, words);
  expect(state.announcement).toBe('Semifinal: Raze the mill versus Borrow the mill. Window open.');
  const counted = tallyAt(window, 9123).counted;
  const called = tiltyardReducer(state, { kind: 'event', event: { kind: 'pick', side: 1 }, elapsed_ms: 9123, counted, words });
  expect(called.chat.verdict?.elapsed).toBe(9123);
  expect(called.chat.verdict?.counted).toEqual(counted);
  expect(called.announcement).toBe(`Streamer call: Borrow the mill, ${counted[1]} to ${counted[0]}.`);
  const next = tiltyardReducer(called, { kind: 'event', event: { kind: 'enter' }, counted, words });
  expect(next.announcement).toBe('Semifinal: Tax the miller versus Spare it. Window open.');
});

test('a paused CSS countdown retains elapsed time and scales its duration and negative delay', () => {
  const html = renderToStaticMarkup(<Seal><Countdown window_ms={15000} elapsed={9000} speed={3}
    paused closed={false} seconds="seconds" closed_label="closed" /></Seal>);
  expect(html).toContain('animation-duration:5000ms;animation-delay:-3000ms;stroke-dashoffset:211.14;animation-play-state:paused');
});

test('a key arriving at the theatre deadline opens the next window without calling it using an old tally', () => {
  const state = createTiltyardState(SAMPLE, 'chat', false, words);
  const closed = tiltyardReducer(state, { kind: 'event', event: { kind: 'enter' }, counted: [1, 9], words });
  const next = tiltyardReducer(closed, { kind: 'event', event: { kind: 'pick', side: 0 }, elapsed_ms: 4001, counted: [1, 9], words });
  expect(next.chat.phase).toBe('live');
  expect(next.chat.match_key).toBe('mill:0:1');
  expect(next.chat.calls).toHaveLength(0);
  expect(next.announcement).toContain('Window open.');
});

test('Enter closes immediately, a tie names its seed rule, and either arrow skips the verdict', () => {
  const session = stepChat(initial(), { kind: 'enter', counted: [0, 0] });
  expect(render(session)).toContain('Tie 0–0 → better seed goes through');
  for (const side of [0, 1] as const) {
    const next = stepChat(session, { kind: 'pick', side, counted: [0, 0] });
    expect(next.phase).toBe('live'); expect(next.match_key).toBe('mill:0:1');
  }
});

test('the final window reaches the champion and retains its cached source for the rail', () => {
  let session = initial();
  const windows = chatWindows(simulateChatPages);
  let last = windows(session);
  for (let n = 0; n < 3; n++) {
    last = windows(session);
    session = stepChat(stepChat(session, { kind: 'enter', counted: [1, 0] }), { kind: 'enter', counted: [1, 0] });
  }
  expect(session.phase).toBe('done');
  expect(windows(session)).toBe(last);
  const html = renderToStaticMarkup(<Chat session={session} window={last} words={words} on_event={noop} />);
  expect(html).toContain('data-role="ty-champion-card"');
  expect(html).not.toContain('ty-barrier');
  expect(html).not.toContain('ty-cone');
  expect(html).toContain('data-role="ty-ticker"');
});

test('the public nextDue clock stays within the churn budget and reaches exactly tallyAt(window, window_ms)', () => {
  let session = initial();
  const arrivals = new Set(window.events.map(event => event.t_ms)).size;
  const budget = Math.ceil(session.window_ms / 1000) + arrivals + 2;
  let wakeups = 0;
  while (session.phase === 'live') {
    const ms = nextDue(session, window);
    if (ms === null || ms <= 0 || ++wakeups > budget) throw new Error('Invalid nextDue wakeup');
    session = stepChat(session, { kind: 'tick', ms, counted: tallyAt(window, session.elapsed + ms).counted });
  }
  expect(wakeups).toBeLessThanOrEqual(budget);
  expect(session.verdict?.counted).toEqual(tallyAt(window, session.window_ms).counted);
  console.log(`[nextDue churn] ${wakeups} wakeups <= ${budget}; ${arrivals} distinct arrivals; final ${session.verdict?.counted.join('–')}`);
});
