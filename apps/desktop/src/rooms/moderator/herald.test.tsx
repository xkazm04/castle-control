import { Children, isValidElement } from 'react';
import type { ButtonHTMLAttributes, ChangeEvent, InputHTMLAttributes, ReactElement, ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { ProposalQueue } from '@castle-control/ui/steward';
import type { Verdict } from '@castle-control/contract';
import { createModerationPreview } from '../../moderation-model.js';
import { fixtureCharts, fixtureMessages, fixtureRules, fixtureLedger } from '../../moderation-fixture.js';
import { createCoreGatehousePort } from '../../gatehouse-core.js';
import { moderationCopy as copy } from '../../moderation-copy.js';
import { ConnectedGatehouse } from './core.jsx';
import { ConsensusSelection } from './consensus.jsx';
import { ReplayPanel } from './messages.jsx';
import { VerdictMark } from './presentation.jsx';
import { Rules } from './controls.jsx';
import { GateLog } from './log.jsx';

function find<T>(tree: ReactNode, predicate: (props: T) => boolean): ReactElement<T> {
  let found: ReactElement<T> | undefined;
  const visit = (node: ReactNode) => Children.forEach(node, child => {
    if (!isValidElement<T & { children?: ReactNode }>(child)) return;
    if (predicate(child.props)) found = child;
    else visit(child.props.children);
  });
  visit(tree);
  if (!found) throw new Error('Missing herald control');
  return found;
}
type Banner = ButtonHTMLAttributes<HTMLButtonElement> & { 'data-verdict-pick'?: string };
const click = (props: ButtonHTMLAttributes<HTMLButtonElement>) => props.onClick?.({ detail: 0 } as Parameters<NonNullable<typeof props.onClick>>[0]);

test('C banners select exactly one verdict; counts and rowcount derive from the same replay', () => {
  const messages = fixtureMessages.slice(0, 420);
  let filter: Verdict | 'all' = 'all'; let query = '';
  const panel = () => ReplayPanel({ messages, filter, query, on_filter: value => { filter = value; }, on_query: value => { query = value; } });
  for (const verdict of ['all', 'pass', 'hold', 'bar'] as const) {
    click(find<Banner>(panel(), props => props['data-verdict-pick'] === verdict).props);
    const html = renderToStaticMarkup(panel());
    const matching = messages.filter(item => verdict === 'all' || item.verdict === verdict);
    expect(html).toContain(`aria-rowcount="${matching.length}"`);
    expect(html).toContain(`${matching.length} matching`);
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
    expect(html).toContain(`data-verdict-pick="${verdict}" aria-pressed="true"`);
    for (const value of ['all', 'pass', 'hold', 'bar'] as const) {
      const count = value === 'all' ? messages.length : messages.filter(item => item.verdict === value).length;
      expect(html).toMatch(new RegExp(`data-verdict-pick="${value}"[^>]*><span><svg[^>]*>.*?</svg>.*?</span><b>${count}</b>`));
    }
    expect(html).not.toContain('<select');
    const rendered = [...html.matchAll(/data-message-row="([^"]+)" data-verdict="([^"]+)"/g)];
    expect(rendered.length).toBeGreaterThan(0);
    expect(rendered.every(row => verdict === 'all' || row[2] === verdict)).toBe(true);
    expect(rendered.length).toBeLessThan(30);
  }
  click(find<Banner>(panel(), props => props['data-verdict-pick'] === 'all').props);
  find<InputHTMLAttributes<HTMLInputElement>>(panel(), props => props.type === 'search').props.onChange?.({
    currentTarget: { value: 'simulated-message-26' },
  } as ChangeEvent<HTMLInputElement>);
  const searched = renderToStaticMarkup(panel());
  const expected = messages.filter(item => `${item.message_id} ${item.message_text ?? ''}`.toLowerCase().includes(query));
  expect(searched).toContain(`aria-rowcount="${expected.length}"`);
  expect(searched).toContain(`${expected.length} matching`);
  expect(searched).toContain('data-verdict-pick="all" aria-pressed="true"');
});

test('every pennant carries its verdict word and only the Pass flag is transparent', () => {
  for (const verdict of ['pass', 'hold', 'bar'] as const) {
    const html = renderToStaticMarkup(<VerdictMark verdict={verdict} />);
    expect(html).toContain(`data-verdict="${verdict}"`);
    expect(html).toMatch(new RegExp(`data-pennant="flag"[^>]*><i aria-hidden="true"></i><span>${verdict[0]?.toUpperCase()}${verdict.slice(1)}</span>`));
    expect(html).toContain(`--cc-ink:${verdict === 'pass' ? 'transparent' : `var(--${verdict === 'hold' ? 'or' : 'gules'})`}`);
    expect(html).not.toContain('aria-label=');
  }
});

test('rules separate Watching/Armed stamps from proposals and keep the shadow safety notice', () => {
  const port = createModerationPreview(); const queue = new ProposalQueue();
  let html = renderToStaticMarkup(<Rules state={port.getSnapshot()} queue={queue} />);
  expect(html.match(/data-stamp="mode"/g)).toHaveLength(3);
  expect(html.match(/data-stamp="mode"[^>]*>Watching<\/span>/g)).toHaveLength(3);
  expect(html).toContain('Propose Arm'); expect(html).toContain(copy.modes);
  const rule = fixtureRules.rules[0];
  if (!rule) throw new Error('Missing generated rule');
  port.send({ kind: 'mode', rule_id: rule.rule_id, mode: 'armed' });
  html = renderToStaticMarkup(<Rules state={port.getSnapshot()} queue={queue} />);
  expect(html).toContain('data-tone="solid"'); expect(html).toContain('>Armed</span>');
  expect(html).toContain('Propose Watch'); expect(html).toContain(copy.modes);
});

test('ruled gate-roll entries show each retained original message beside its decision', () => {
  const port = createModerationPreview();
  const html = renderToStaticMarkup(<GateLog state={port.getSnapshot()} queue={new ProposalQueue()} />);
  for (const decision of fixtureLedger) {
    expect(decision.message_text).toBeTruthy();
    expect(html).toContain(decision.message_text);
  }
  expect(html).toContain('moderator-roll-entry');
  expect(html).not.toContain('moderator-log-row');
  expect(html).toContain('Propose Undo'); expect(html).toContain('Propose Petition');
});

test('room-local consensus chips change the 2x2 values without an action port', () => {
  let selected = 0;
  const panel = () => ConsensusSelection({ results: fixtureCharts, selected, on_select: value => { selected = value; } });
  for (let index = 0; index < fixtureCharts.length; index++) {
    const tree = panel();
    const label = ['All messages', 'Emotes only', 'Text only', 'Kappa'][index];
    click(find<ButtonHTMLAttributes<HTMLButtonElement>>(tree, props => props.children === label).props);
    expect(selected).toBe(index);
    const html = renderToStaticMarkup(panel());
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
    expect(html.match(/class="moderator-tile"/g)).toHaveLength(4);
    for (const direction of fixtureCharts[index]?.directions ?? []) expect(html).toContain(`${(direction.share * 100).toFixed(1)}%`);
    expect(html).not.toContain('<select');
  }
});

test('core also renders three C plates with moat before rules and honest unavailable controls', () => {
  const port = createCoreGatehousePort({ mode: 'core', endpoint: 'http://127.0.0.1:3210/', session_token: 'a'.repeat(64) }, {
    rpc: async () => { throw new Error('SSR must not call the core'); },
  });
  const html = renderToStaticMarkup(<ConnectedGatehouse port={port} replay={false} seal_slot={<aside aria-label="Seal slot" />} />);
  expect(html.match(/class="cc-plate cc-offset-shadow/g)).toHaveLength(3);
  expect(html.match(/role="region"[^>]*tabindex="0"/g)).toHaveLength(3);
  expect(html.indexOf('The moat')).toBeLessThan(html.indexOf('Garrison orders'));
  expect(html.indexOf('Garrison orders')).toBeLessThan(html.indexOf('href="#/chamber/moderator/drill"'));
  expect(html.indexOf('core decision history')).toBeLessThan(html.indexOf('aria-label="Seal slot"'));
  expect(html).toContain(copy.core_queues_unavailable); expect(html).toContain(copy.core_moat_unavailable);
  expect(html).not.toContain('Propose Ban'); expect(html).not.toContain('sample chat replay');
});
