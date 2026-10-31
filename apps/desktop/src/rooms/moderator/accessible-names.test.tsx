import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { ProposalQueue } from '@castle-control/ui/steward';
import { createModerationPreview } from '../../moderation-model.js';
import { fixtureMessages, fixtureReplay } from '../../moderation-fixture.js';
import { GateControls } from './controls.jsx';
import { Drill } from './drill.jsx';
import { ReplayPanel } from './messages.jsx';

function standaloneControl(html: string, label: string, tag: 'select' | 'input') {
  const labels = [...html.matchAll(/<label\b[^>]*>[\s\S]*?<\/label>/g)].map(match => match[0]);
  const id = labels.map(text => text.match(/<label\b[^>]*\bfor="([^"]+)"[^>]*>([^<]*)<\/label>/))
    .find(match => match?.[2] === label)?.[1];
  expect(id, `Expected a standalone label with text exactly ${label}`).toBeTruthy();
  const control = [...html.matchAll(new RegExp(`<${tag}\\b[^>]*>`, 'g'))].map(match => match[0])
    .find(text => text.includes(`id="${id}"`));
  expect(control, 'Expected the control to reference the label target').toBeTruthy();
  if (!control) throw new Error('Missing labelled control');
  expect(labels.some(text => text.includes(control)), 'Control must not be nested inside a label').toBe(false);
  expect(control).not.toMatch(/aria-label(?:ledby)?=/);
  return labels;
}

test('GateControls names its standalone delay select exactly Propose chat delay', () => {
  const html = renderToStaticMarkup(<GateControls state={createModerationPreview().getSnapshot()} queue={new ProposalQueue()} />);
  standaloneControl(html, 'Propose chat delay', 'select');
});

test('Drill names its standalone state select exactly Evaluation state', () => {
  const html = renderToStaticMarkup(<Drill result={fixtureReplay} />);
  standaloneControl(html, 'Evaluation state', 'select');
});

test.each([false, true])('ReplayPanel keeps the live output outside its search label (core=%s)', core => {
  for (const query of ['', 'simulated-message-26']) {
    const html = renderToStaticMarkup(<ReplayPanel messages={fixtureMessages.slice(0, 420)} core={core} filter="all" query={query}
      on_filter={() => undefined} on_query={() => undefined} />);
    const labels = [...html.matchAll(/<label\b[^>]*>[\s\S]*?<\/label>/g)].map(match => match[0]);
    expect(labels.some(label => label.includes('<output'))).toBe(false);
    expect(html).toMatch(/<output\b[^>]*>\d+ matching<\/output>/);
    standaloneControl(html, core ? 'Search core chat' : 'Search the room', 'input');
  }
});

test('verdict and draft filter names separate their words from line counts', () => {
  const messages = fixtureMessages.slice(0, 420);
  const marked = new Set(messages.slice(0, 3).map(message => message.message_id));
  const html = renderToStaticMarkup(<ReplayPanel messages={messages} marked={marked} filter="all" query=""
    on_filter={() => undefined} on_query={() => undefined} />);
  for (const verdict of ['all', 'pass', 'hold', 'bar'] as const) {
    const count = verdict === 'all' ? messages.length : messages.filter(message => message.verdict === verdict).length;
    const label = verdict.charAt(0).toUpperCase() + verdict.slice(1);
    expect(html).toContain(`aria-label="${label} · ${count} lines"`);
  }
  expect(html).toContain('aria-label="Draft matches · 3 lines"');
});
