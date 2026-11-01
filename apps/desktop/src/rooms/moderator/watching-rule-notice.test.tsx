import { renderToStaticMarkup } from 'react-dom/server';
import * as React from 'react';
import type { FormHTMLAttributes, ReactNode } from 'react';
import { afterEach, expect, test, vi } from 'vitest';
import { ProposalQueue } from '@castle-control/ui/steward';
import { createCoreGatehousePort } from '../../gatehouse-core.js';
import { evaluateDraft } from '../../moderation-bench.js';
import { WatchingRuleEditor } from './watching-rule.jsx';
import { coreRuleBench } from './session.js';
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

function form(): React.ReactElement<FormHTMLAttributes<HTMLFormElement>> {
  for (const child of React.Children.toArray(captured.tree)) {
    if (React.isValidElement<FormHTMLAttributes<HTMLFormElement>>(child) && child.type === 'form') return child;
  }
  throw new Error('Missing editor form');
}

test('a refusal thrown while proposing a rule reaches the notice instead of a generic message', async () => {
  let notice: unknown;
  vi.spyOn(React, 'useState').mockImplementation((initial?: unknown): [unknown, React.Dispatch<unknown>] => {
    notice ??= typeof initial === 'function' ? initial() : initial;
    return [notice, next => { notice = typeof next === 'function' ? next(notice) : next; }];
  });
  const queue = new ProposalQueue();
  vi.spyOn(queue, 'addOrUpdate').mockImplementation(() => { throw new Error('Synthetic proposal refusal'); });
  const port = createCoreGatehousePort({ mode: 'core', endpoint: 'http://127.0.0.1:3210/', session_token: 'a'.repeat(64) });
  const bench = coreRuleBench(port); const draft = { name: 'Simulated rule', pattern: 'left', action: 'warn' } as const;
  bench.setDraft(draft);
  const result = evaluateDraft(draft, [], []);
  const render = () => renderToStaticMarkup(<WatchingRuleEditor rules={[]} queue={queue} bench={bench} result={result} />);
  render();
  await form().props.onSubmit?.({ preventDefault: () => undefined } as React.SubmitEvent<HTMLFormElement>);
  const html = render();
  expect(html).toContain('Synthetic proposal refusal'); expect(html).not.toContain(copy.rule_invalid);
  expect(html).toContain('role="alert"');
});
