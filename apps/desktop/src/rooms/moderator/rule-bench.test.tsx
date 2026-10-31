import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { ProposalQueue } from '@castle-control/ui/steward';
import { createCoreGatehousePort } from '../../gatehouse-core.js';
import { benchInput, evaluateDraft } from '../../moderation-bench.js';
import { fixtureMessages, fixtureRules } from '../../moderation-fixture.js';
import ModeratorRoom from './index.jsx';
import { RuleBench } from './rule-bench.jsx';
import { ReplayPanel } from './messages.jsx';
import { moderationSession, proposeCommand, sealModerationProposal, coreRuleBench } from './session.js';

test('fixture draft marks the replay and survives into a separate, hash-free pattern preview', () => {
  const queue = new ProposalQueue(); const { bench } = moderationSession(queue);
  bench.setDraft({ name: 'Caps lock!', pattern: 'go left', action: 'delete' });
  const html = renderToStaticMarkup(<ModeratorRoom snapshot={{ mode: 'fixture', phase: 'ready' }} replay={false} queue={queue} />);
  expect(html).toContain('data-draft-match="true"'); expect(html).toContain('draft matches');
  expect(html).toContain('Draft matches'); expect(html).toContain('draft pattern hits');
  expect(html.match(/id="watching-name"/g)).toHaveLength(1);
  const drill = renderToStaticMarkup(<ModeratorRoom snapshot={{ mode: 'fixture', phase: 'ready' }} replay queue={queue} />);
  const preview = drill.match(/<section[^>]+aria-label="Draft pattern preview"[^>]*>(.*?)<\/section>/s)?.[1];
  expect(preview).toContain('Draft pattern preview'); expect(preview).toContain('Pattern preview only');
  expect(preview).not.toMatch(/instrument.hash|acted|DrillRunResult/i);
  expect(drill).toContain('Recording gap');
});

test('a new fixture rule saves only under a seal, and repeated edits keep its id', () => {
  const queue = new ProposalQueue(); const { bench, port } = moderationSession(queue);
  bench.setDraft({ name: 'Links', pattern: 'go left', action: 'delete' });
  const { input } = benchInput(bench.getSnapshot(), port.getSnapshot().rules);
  const result = evaluateDraft(input, port.getSnapshot().rules, fixtureMessages.slice(0, 420));
  if (!result.ok) throw new Error(result.refusal);
  proposeCommand(queue, { kind: 'rule', rule: result.rule }, 'New watching rule');
  expect(port.getSnapshot().rules).toHaveLength(fixtureRules.rules.length);
  const proposal = queue.pending('moderator')[0]; if (!proposal) throw new Error('Missing proposal');
  sealModerationProposal(queue, proposal);
  expect(port.getSnapshot().rules.at(-1)).toEqual(result.rule);
  expect(bench.getSnapshot().selection).toBe('links-2');
  expect(port.getSnapshot().rules.every(rule => rule.mode === 'shadow')).toBe(true);
  const edit = { ...result.rule, name: 'Edited new rule' };
  port.send({ kind: 'rule', rule: edit });
  expect(port.getSnapshot().rules.at(-1)).toEqual(edit);
  expect(port.getSnapshot().rules).toHaveLength(fixtureRules.rules.length + 1);
});

test('core bench cannot drill without a saved baseline and explains the existing drill link', () => {
  const port = createCoreGatehousePort({ mode: 'core', endpoint: 'http://127.0.0.1:3210/', session_token: 'a'.repeat(64) });
  const bench = coreRuleBench(port);
  bench.setDraft({ name: 'New', pattern: 'go left', action: 'delete' });
  const html = renderToStaticMarkup(<RuleBench rules={[]} messages={[]} bench={bench} core={port} />);
  expect(html).toMatch(/<button[^>]+disabled=""[^>]*>Drill against today/);
  expect(html).toContain('Save a recording baseline'); expect(html).toContain('href="#/chamber/moderator/drill"');
  expect(html).toContain('Save as watching'); expect(html).not.toContain('Arm');
});

test('draft-only replay filter uses the same hits, preserves verdicts and remains windowed', () => {
  const messages = fixtureMessages.slice(0, 420);
  const result = evaluateDraft({ name: 'Caps lock!', pattern: 'go left', action: 'delete' }, fixtureRules.rules, messages);
  expect(result.total_hits).toBe(166); expect(result.newly_acting).toBe(166);
  const html = renderToStaticMarkup(ReplayPanel({ messages, marked: result.hit_ids, filter: 'draft', query: '',
    on_filter: () => undefined, on_query: () => undefined }));
  expect(html).toContain('aria-rowcount="166"');
  const rows = [...html.matchAll(/data-message-row="([^"]+)" data-verdict="([^"]+)" data-draft-match="true"/g)];
  expect(rows.length).toBeGreaterThan(0); expect(rows.length).toBeLessThan(30);
  for (const row of rows) {
    expect(result.hit_ids.has(row[1] ?? '')).toBe(true);
    expect(row[2]).toBe(messages.find(item => item.message_id === row[1])?.verdict);
  }
});
