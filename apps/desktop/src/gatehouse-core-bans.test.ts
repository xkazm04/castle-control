import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { parseMethodParams, parseMethodResult } from '@castle-control/contract';
import { gatehouseChatList, gatehouseHistoryList, gatehouseRulesUpsert } from '@castle-control/contract/gatehouse';
import type { GatehouseChatResult, GatehouseHistoryResult } from '@castle-control/contract';
import { createBanTracker } from './gatehouse-core-bans.js';
import { createCoreGatehousePort } from './gatehouse-core.js';
import { CoreBanReview, CoreRuleMode } from './rooms/moderator/core-bans.jsx';

// Generated SIMULATED rehearsal data only.
const at = '2026-11-02T12:00:00Z';
const now = Date.parse(at) + 10_000;
const { rule } = parseMethodParams(gatehouseRulesUpsert, { rule: { rule_id: 'no-boss-spoilers', name: 'No boss spoilers',
  rule_class: 'pattern', mode: 'armed', action: 'ban', delivery: 'streamer', pattern: 'spoiler' } });
type Raw = { decision_id: string; message_id: string; kind: string; verdict: string; rule_id: string; operator: string; at: string; reason_codes: string[] };
const pending = (id: string, message_id: string, when = at): Raw => ({ decision_id: id, message_id, kind: 'ban_pending',
  verdict: 'hold', rule_id: rule.rule_id, operator: 'ai', at: when, reason_codes: ['ban_pending'] });
const line = (decision: Raw, text: string) => ({ decision, provenance: 'simulated' as const,
  message: { message_id: decision.message_id, user_id: '900000001', at: decision.at, text } });
const first = pending('01K8F7A0000000000000000001', 'simulated-rehearsal-a-3');
const second = pending('01K8F7A0000000000000000002', 'simulated-rehearsal-a-9');
const stale = pending('01K8F7A0000000000000000003', 'simulated-rehearsal-a-1', '2026-11-02T11:50:00Z');
const confirmed: Raw = { decision_id: '01K8F7A0000000000000000004', message_id: first.message_id, kind: 'banned',
  verdict: 'bar', rule_id: rule.rule_id, operator: 'human', at, reason_codes: ['ban_confirmed'] };

const historyPage = (value: unknown): GatehouseHistoryResult => parseMethodResult(gatehouseHistoryList, JSON.stringify(value));
const chatPage = (value: unknown): GatehouseChatResult => parseMethodResult(gatehouseChatList, JSON.stringify(value));
function pages(history: GatehouseHistoryResult[], chat: GatehouseChatResult[]) {
  const cursors: { history: (string | undefined)[]; chat: (string | undefined)[] } = { history: [], chat: [] };
  const serve = <T>(list: T[], seen: (string | undefined)[]) => async (cursor?: string) => {
    seen.push(cursor);
    const page = list.shift();
    if (!page) throw new Error('Unexpected read');
    return page;
  };
  return { cursors, read: { history: serve(history, cursors.history), chat: serve(chat, cursors.chat) } };
}
const historyItem = (decision: Raw) => ({ decision, provenance: 'simulated' as const, recorded_at: decision.at });

test('a ban proposal stays open until a human review of the same message follows, with text from the chat line', async () => {
  const { read, cursors } = pages([
    historyPage({ items: [historyItem(stale), historyItem(first)], next_cursor: 'history:100', unavailable_count: 0 }),
    historyPage({ items: [historyItem(second)], unavailable_count: 0 }),
    historyPage({ items: [historyItem(second), historyItem(confirmed)], unavailable_count: 0 }),
  ], [
    chatPage({ items: [line(first, 'SIMULATED spoiler: the boss dies')], next_cursor: 'chat:100', unavailable_count: 0 }),
    chatPage({ items: [line(second, 'SIMULATED spoiler: again')], unavailable_count: 0 }),
    chatPage({ items: [], unavailable_count: 0 }),
  ]);
  const tracker = createBanTracker(read);
  const before = await tracker.refresh(now);
  expect(before.pending.map(item => [item.decision_id, item.text, item.user_id])).toEqual([
    [second.decision_id, 'SIMULATED spoiler: again', '900000001'], [first.decision_id, 'SIMULATED spoiler: the boss dies', '900000001']]);
  expect(before.expired).toBe(1);
  expect(before.outcomes).toEqual([]);
  const after = await tracker.refresh(now);
  // The next poll resumes from the last complete page instead of re-reading the ledger.
  expect(cursors).toEqual({ history: [undefined, 'history:100', 'history:100'], chat: [undefined, 'chat:100', 'chat:100'] });
  expect(after.pending.map(item => item.decision_id)).toEqual([second.decision_id]);
  expect(after.outcomes).toEqual([expect.objectContaining({ reason: 'ban_confirmed', kind: 'banned', simulated: true,
    user_id: '900000001', rule_id: rule.rule_id })]);
});

test('the rehearsal ban review names the generated chatter, the rule and the SIMULATED outcome', async () => {
  const port = createCoreGatehousePort({ mode: 'core', endpoint: 'http://127.0.0.1:3210/', session_token: 'a'.repeat(64) },
    { rpc: async () => { throw new Error('Unexpected read'); } });
  const { read } = pages([
    historyPage({ items: [historyItem(first), historyItem(second), historyItem(confirmed)], unavailable_count: 0 }),
  ], [chatPage({ items: [line(first, 'SIMULATED spoiler: the boss dies'), line(second, 'SIMULATED spoiler: again')], unavailable_count: 0 })]);
  const bans = await createBanTracker(read).refresh(now);
  const state = { ...port.getSnapshot(), rules: [rule], bans };
  const html = renderToStaticMarkup(createElement(CoreBanReview, { state, port }));
  expect(html).toContain('aria-label="Ban review · SIMULATED"');
  expect(html).toContain('aria-label="Proposed ban · SIMULATED"');
  expect(html).toContain('SIMULATED spoiler: again');
  expect(html).toContain('SIMULATED viewer 900000001');
  expect(html).toContain('No boss spoilers');
  expect(html).toContain('>Confirm SIMULATED ban<');
  expect(html).toContain('SIMULATED ban recorded · SIMULATED viewer 900000001 · No boss spoilers · rehearsal store only, nothing sent to Twitch');
  const arm = renderToStaticMarkup(createElement(CoreRuleMode, { rule: { ...rule, mode: 'shadow' }, busy: false, port }));
  expect(arm).toContain('aria-label="Arm in rehearsal: No boss spoilers"');
  expect(renderToStaticMarkup(createElement(CoreRuleMode, { rule: { ...rule, rule_class: 'rail' }, busy: false, port }))).toBe('');
});
