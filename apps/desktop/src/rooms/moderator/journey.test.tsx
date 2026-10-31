import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, expect, test, vi } from 'vitest';
import { ProposalQueue } from '@castle-control/ui/steward';
import { createModerationPreview } from '../../moderation-model.js';
import { fixtureConfirmationMs, fixtureHeld } from '../../moderation-fixture.js';
import ModeratorRoom from './index.jsx';
import { HeldQueue } from './controls.jsx';
import { ChatPlayback } from './playback.jsx';

afterEach(() => { vi.useRealTimers(); });
const room = () => renderToStaticMarkup(<ModeratorRoom snapshot={{ mode: 'fixture', phase: 'ready' }} replay={false} queue={new ProposalQueue()} />);

test('fixture journey offers a schema-backed watching rule editor and simulated playback', () => {
  const html = room();
  for (const label of ['Watching rule name', 'Watching match pattern', 'Propose watching rule', 'Play simulated chat']) expect(html).toContain(label);
  expect(createModerationPreview()).toHaveProperty('advanceChat');
});

test('resolved held messages announce their verdict beside the empty review queue', () => {
  vi.useFakeTimers(); const port = createModerationPreview(); const held = fixtureHeld[0];
  if (!held) throw new Error('Missing simulated held message');
  port.send({ kind: 'release', decision_id: held.decision_id });
  vi.advanceTimersByTime(fixtureConfirmationMs);
  const html = renderToStaticMarkup(<HeldQueue state={port.getSnapshot()} queue={new ProposalQueue()} />);
  expect(html).toContain('data-review-feedback');
  expect(html).toContain('Released');
  expect(html).toContain('Nothing sent to Twitch');
});

test('undo feedback stays at the review surface and preserves original ledger evidence', () => {
  const port = createModerationPreview(); const original = port.getSnapshot().ledger[0];
  if (!original) throw new Error('Missing simulated decision');
  port.send({ kind: 'undo', decision_id: original.decision_id });
  const html = renderToStaticMarkup(<HeldQueue state={port.getSnapshot()} queue={new ProposalQueue()} />);
  expect(html).toContain('data-review-feedback'); expect(html).toContain('undo');
  expect(port.getSnapshot().ledger).toContain(original);
});

test('both transparent output frames expose per-layer parameters and six existing styles', () => {
  const html = room();
  for (const layer of ['Chat overlay', 'Vote bar']) for (const field of ['size', 'anchor', 'colour', 'art style', 'show after (ms)', 'hide after (ms)']) {
    expect(html).toContain(`${layer} ${field}`);
  }
  for (const resolution of ['1920x1080', '1280x720']) expect(html).toContain(`data-output-frame="${resolution}"`);
  for (const value of ['heraldic', 'pixel', 'synthwave', 'watercolor', 'anime', 'glass']) expect(html).toContain(`value="${value}"`);
  expect(html).toContain('data-transparent="true"'); expect(html).toContain('Session only');
});

test('new simulated intake is visible without scrolling a historical virtual window', () => {
  const port = createModerationPreview(); port.advanceChat();
  const html = renderToStaticMarkup(<ChatPlayback port={port} state={port.getSnapshot()} />);
  expect(html).toContain('data-latest-arrival');
  expect(html).toContain(port.getSnapshot().messages[420]?.message_text);
});
