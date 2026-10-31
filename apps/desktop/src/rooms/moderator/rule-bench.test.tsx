import { renderToStaticMarkup } from 'react-dom/server';
import * as React from 'react';
import type { FormHTMLAttributes, ReactNode } from 'react';
import { afterEach, expect, test, vi } from 'vitest';
import { ProposalQueue } from '@castle-control/ui/steward';
import { createCoreGatehousePort } from '../../gatehouse-core.js';
import { benchInput, evaluateDraft } from '../../moderation-bench.js';
import { fixtureMessages, fixtureRules } from '../../moderation-fixture.js';
import ModeratorRoom from './index.jsx';
import { RuleBench } from './rule-bench.jsx';
import { ReplayPanel } from './messages.jsx';
import { moderationSession, proposeCommand, sealModerationProposal, coreRuleBench } from './session.js';
import { moderationCopy as copy } from '../../moderation-copy.js';

const captured = vi.hoisted(() => ({ tree: undefined as ReactNode }));
vi.mock('react', async importOriginal => ({ ...await importOriginal<typeof React>() }));
vi.mock('@castle-control/ui', async importOriginal => {
  const kit = await importOriginal<typeof import('@castle-control/ui')>();
  return { ...kit, HeraldicCard: (props: React.ComponentProps<typeof kit.HeraldicCard>) => {
    captured.tree = props.children; return <kit.HeraldicCard {...props} />;
  } };
});
afterEach(() => { vi.restoreAllMocks(); captured.tree = undefined; });

function form(tree: ReactNode): React.ReactElement<FormHTMLAttributes<HTMLFormElement>> {
  for (const child of React.Children.toArray(tree)) {
    if (!React.isValidElement<{ children?: ReactNode }>(child)) continue;
    if (child.type === 'form') return child as React.ReactElement<FormHTMLAttributes<HTMLFormElement>>;
    if (child.props.children) {
      const found = React.Children.toArray(child.props.children).find(item => React.isValidElement(item) && item.type === 'form');
      if (React.isValidElement<FormHTMLAttributes<HTMLFormElement>>(found)) return found;
    }
  }
  throw new Error('Missing real editor form');
}

test.each([false, true])('core bench reports its settled save beside the form (success=%s)', async succeeds => {
  // Preserve the editor's state between server renders while exercising its real
  // submit handler and real port. No DOM dependency or replacement save logic.
  let notice: unknown;
  const stateHook = vi.fn<(initial?: unknown) => [unknown, React.Dispatch<unknown>]>(initial => {
    notice ??= typeof initial === 'function' ? (initial as () => unknown)() : initial;
    return [notice, next => { notice = typeof next === 'function' ? (next as (value: unknown) => unknown)(notice) : next; }];
  });
  vi.spyOn(React, 'useState').mockImplementation(stateHook);
  let settle: (value: unknown) => void = () => { throw new Error('Missing pending save'); };
  const rpc = vi.fn(() => new Promise<unknown>((resolve, reject) => { settle = value => succeeds ? resolve(value) : reject(value); }));
  const port = createCoreGatehousePort({ mode: 'core', endpoint: 'http://127.0.0.1:3210/', session_token: 'a'.repeat(64) }, { rpc });
  const bench = coreRuleBench(port); bench.setDraft({ name: 'Simulated saved rule', pattern: 'left', action: 'warn' });
  const render = () => renderToStaticMarkup(<RuleBench rules={port.getSnapshot().rules} messages={[]} bench={bench} core={port} />);
  render(); form(captured.tree).props.onSubmit?.({ preventDefault: () => undefined } as React.SubmitEvent<HTMLFormElement>);
  form(captured.tree).props.onSubmit?.({ preventDefault: () => undefined } as React.SubmitEvent<HTMLFormElement>);
  expect(rpc).toHaveBeenCalledTimes(1); expect(render()).toContain(copy.bench_save_pending);
  const sent = rpc.mock.calls[0]; expect(sent).toBeDefined();
  const result = evaluateDraft({ name: 'Simulated saved rule', pattern: 'left', action: 'warn' }, [], []);
  if (!result.ok) throw new Error('Missing simulated rule');
  settle(succeeds ? result.rule : { code: 'invalid', message: 'Private save detail' });
  await vi.waitFor(() => expect(port.getSnapshot().busy).toBe(false));
  const html = render();
  expect(html).not.toContain(copy.bench_save_pending); expect(html).not.toContain('Private save detail');
  if (succeeds) { expect(html).toContain(`Saved as watching rule ${result.rule.rule_id}.`); expect(html).not.toContain('role="alert"'); }
  else expect(html).toMatch(/<p[^>]*role="alert"[^>]*>Not saved: .*invalid/i);
  expect(html.match(/role="status"/g)).toHaveLength(1); expect(html.match(/aria-live="polite"/g)).toHaveLength(1);
  const fields = React.Children.toArray(form(captured.tree).props.children);
  const nameField = fields.find(child => React.isValidElement<{ control_id?: string }>(child) && child.props.control_id === 'watching-name');
  if (!React.isValidElement<{ children?: ReactNode }>(nameField)) throw new Error('Missing name field');
  const input = React.Children.toArray(nameField.props.children)[0];
  if (!React.isValidElement<React.InputHTMLAttributes<HTMLInputElement>>(input)) throw new Error('Missing name input');
  input.props.onChange?.({ currentTarget: { value: 'Next simulated edit' } } as React.ChangeEvent<HTMLInputElement>);
  const edited = render(); expect(edited).not.toContain('Not saved:'); expect(edited).not.toContain('Saved as watching rule');
  expect(edited).not.toContain('role="alert"');
});

test('draft actions and refusals show plain words while keeping wire values in attributes', () => {
  const port = createCoreGatehousePort({ mode: 'core', endpoint: 'http://127.0.0.1:3210/', session_token: 'a'.repeat(64) });
  const bench = coreRuleBench(port); bench.setDraft({ name: 'Simulated rule', pattern: '(?=x)', action: 'timeout' });
  const html = renderToStaticMarkup(<RuleBench rules={[]} messages={[]} bench={bench} core={port} />);
  for (const label of ['Warn', 'Delete message', 'Time out 60 s', 'Hold for review']) expect(html).toContain(`>${label}</option>`);
  expect(html).toContain('data-pattern-refusal="unsupported_by_gate"');
  expect(html.replace(/<[^>]+>/g, '')).not.toContain('unsupported_by_gate');
});

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
