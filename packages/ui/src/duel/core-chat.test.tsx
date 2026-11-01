import { readFileSync } from 'node:fs';
import { maproomStageGet, parseMethodResult } from '@castle-control/contract';
import { parseJson } from '@castle-control/contract/door';
import { SAMPLE } from '@castle-control/duel';
import { simulateChatPages } from '@castle-control/duel/ballots';
import { renderToStaticMarkup } from 'react-dom/server';
import { Children, isValidElement } from 'react';
import type { ReactNode } from 'react';
import { expect, test, vi } from 'vitest';
import { CoreChat } from './core-chat.jsx';
import { Card } from './card.jsx';
import { Tiltyard } from './stage.jsx';
import { createTiltyardState, tiltyardReducer } from './session.js';
import { tiltyardWords as words } from './words.js';

const fixture = parseJson(readFileSync(new URL('../../../../crates/cc-types/tests/fixtures/tiltyard.json', import.meta.url), 'utf8'));
if (!fixture || typeof fixture !== 'object' || !('stages' in fixture) || !Array.isArray(fixture.stages)
  || !('simulated' in fixture) || fixture.simulated !== true || fixture.stages.length < 3) throw new Error('Missing SIMULATED stages');
const stages = fixture.stages.map((stage: unknown) => parseMethodResult(maproomStageGet, JSON.stringify(stage)));
const sessions = stages.flatMap(stage => stage.session ? [stage.session] : []);

test('core Chat renders returned counts, closed pair, explicit side/reason and champion without deciding in TS', () => {
  expect(sessions.some(session => session.verdict)).toBe(true);
  for (const session of sessions) {
    const html = renderToStaticMarkup(<CoreChat session={session} words={words} on_action={vi.fn()} on_start={vi.fn()} />);
    expect(html).toContain(`data-phase="${session.phase}"`);
    expect(html).toContain(`data-role="ty-core-left-count">${session.counted.left}</b>`);
    expect(html).toContain(`data-role="ty-core-right-count">${session.counted.right}</b>`);
    expect(html).not.toContain('data-role="ty-ticker"');
    if (session.verdict) {
      expect(html).toContain(`data-match-key="${session.verdict.match_key}"`);
      expect(html).toContain(`data-side="${session.verdict.verdict.side}" data-how="${session.verdict.verdict.how}"`);
    }
    if (session.champion) expect(html).toContain('data-role="ty-champion-card"');
  }
  expect(renderToStaticMarkup(<CoreChat words={words} on_action={vi.fn()} on_start={vi.fn()} />)).toContain('Start tournament');
});

test('a core call against the tally stays the core call; large string seeds and escaped labels survive rendering', () => {
  const original = sessions.find(session => session.verdict);
  if (!original?.verdict) throw new Error('Missing generated closed match');
  const session = { ...original, list: { ...original.list, items: original.list.items.map(item => ({ ...item,
    seed: '9999999999999999999999999999999999999999' })) },
    verdict: { ...original.verdict, verdict: { side: 'right' as const, how: 'call' as const } } };
  const html = renderToStaticMarkup(<CoreChat session={session} words={words} on_action={vi.fn()} on_start={vi.fn()} />);
  expect(html).toContain('data-side="right" data-how="call"');
  expect(html).toContain('Your call: Simulated right');
  expect(html).toContain('seed 9999999999999999999999999999999999999999');
  expect(html).toContain('Simulated &lt;left&gt; &amp; contestant');
});

test('round and match labels follow the seed count even before the core has materialized future rounds', () => {
  const initial = sessions.find(session => session.phase === 'live');
  if (!initial) throw new Error('Missing generated live match');
  const session = parseMethodResult(maproomStageGet, JSON.stringify({ at: stages[0]?.at, session: { ...initial,
    list: { ...initial.list, items: [...initial.list.items,
      { id: 'simulated-c', title: 'SIMULATED C', by: 'simulated_streamer', seed: '2' },
      { id: 'simulated-d', title: 'SIMULATED D', by: 'simulated_streamer', seed: '3' }] },
    bracket: { seeds: ['simulated-a', 'simulated-b', 'simulated-c', 'simulated-d'], rounds: [[
      { a: 'simulated-a', b: 'simulated-d' }, { a: 'simulated-b', b: 'simulated-c' }]] },
  } })).session;
  const html = renderToStaticMarkup(<CoreChat {...(session ? { session } : {})} words={words} on_action={vi.fn()} on_start={vi.fn()} />);
  expect(html).toContain('data-role="ty-round">Semifinal');
  expect(html).toContain('data-role="ty-core-match-label">Match 1');
});

test('core cards and controls emit wire actions, including resume as enter; paused cards cannot make a call', () => {
  const session = sessions.find(session => session.verdict);
  if (!session) throw new Error('Missing generated closed match');
  const on_action = vi.fn();
  type Props = { children?: ReactNode; onClick?: () => void; on_pick?: () => void; disabled?: boolean; side?: number };
  const events: string[] = [];
  function visit(node: ReactNode) {
    for (const child of Children.toArray(node)) {
      if (!isValidElement<Props>(child)) continue;
      if (child.type === Card) child.props.on_pick?.();
      if (child.type === 'button' && !child.props.disabled) { child.props.onClick?.(); events.push(String(child.props.children)); }
      visit(child.props.children);
    }
  }
  visit(CoreChat({ session, words, on_action, on_start: vi.fn() }));
  expect(on_action.mock.calls.map(call => call[0])).toEqual([
    { kind: 'pick', side: 'left' }, { kind: 'pick', side: 'right' },
    { kind: 'enter' }, { kind: 'cancel' }, { kind: 'undo' }, { kind: 'reset' }, { kind: 'speed' },
  ]);
  expect(events).toContain('Next match');
  const paused = { ...session, phase: 'called_off' as const };
  const html = renderToStaticMarkup(<CoreChat session={paused} words={words} on_action={on_action} on_start={vi.fn()} />);
  expect(html).toContain('Resume vote');
  expect(html.match(/data-role="ty-card"[^>]*disabled=""/g)).toHaveLength(2);
});

test('controlled Chat never ingests either ballot source and renders its supplied picture', () => {
  const ballots = vi.fn(simulateChatPages); const ballot_feed = vi.fn(() => vi.fn());
  const html = renderToStaticMarkup(<Tiltyard lists={SAMPLE} words={words} label="Controlled stage" initial_mode="chat"
    ballots={ballots} ballot_feed={ballot_feed} chat_control={{ phase: 'live', simulated: false,
      content: <p>Returned core picture</p>, on_event: vi.fn() }} />);
  expect(html).toContain('Returned core picture');
  expect(ballots).not.toHaveBeenCalled(); expect(ballot_feed).not.toHaveBeenCalled();
  expect(html).not.toContain('data-role="ty-tug"');
});

test('fixture Chat keeps its TS transition and tally source; external mode switches leave Chat untouched', () => {
  const ballots = vi.fn(simulateChatPages);
  const html = renderToStaticMarkup(<Tiltyard lists={SAMPLE} words={words} label="Fixture stage" initial_mode="chat" ballots={ballots} />);
  expect(ballots).toHaveBeenCalledExactlyOnceWith('mill:0:0', 15000, expect.any(String));
  expect(html).toContain('data-role="ty-tug"'); expect(html).toContain('data-role="ty-ticker"');
  const before = createTiltyardState(SAMPLE, 'chat', false);
  const closed = tiltyardReducer(before, { kind: 'event', event: { kind: 'enter' }, counted: [1, 9], words });
  expect(closed.chat.verdict?.side).toBe(1);
  const local = tiltyardReducer(closed, { kind: 'mode', mode: 'show', words });
  expect(local.chat.phase).toBe('live');
  const controlled = tiltyardReducer(closed, { kind: 'mode', mode: 'show', external_chat: true, words });
  expect(controlled.chat).toBe(closed.chat);
  const show_pick = tiltyardReducer(controlled, { kind: 'event', event: { kind: 'pick', side: 0 }, words });
  expect(show_pick.show.history).toHaveLength(1); expect(show_pick.chat).toBe(closed.chat);
});
