import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { ProposalQueue } from '@castle-control/ui/steward';
import { keyFor } from '../../shell/steward-keys.jsx';
import { fixtureCharts } from '../../moderation-fixture.js';
import { createModerationPreview } from '../../moderation-model.js';
import { moderationCopy as copy } from '../../moderation-copy.js';
import { HeldQueue, ShieldButton } from './controls.jsx';
import { VoteControls } from './deck.jsx';
import { Consensus } from './consensus.jsx';

const label = (html: string) => html.replace(/<span class="cc-control-key" aria-hidden="true">[\s\S]*?<\/span>/g, '')
  .replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

function expectBadge(html: string, name: string, action: string) {
  const buttons = [...html.matchAll(/<button\b[^>]*>[\s\S]*?<\/button>/g)].map(match => match[0]);
  const button = buttons.find(item => label(item) === name);
  expect(button, `Missing control: ${name}`).toBeDefined();
  expect(button).toContain('class="cc-control-key" aria-hidden="true"');
  const letter = keyFor('moderator', action);
  expect(letter, `Missing shared action: ${action}`).toBeDefined();
  expect(button?.match(/<kbd[^>]*>(.*?)<\/kbd>/)?.[1]).toBe(letter);
}

test('review and drawbridge controls take their badges from the action-row lookup without changing their accessible names', () => {
  const state = createModerationPreview().getSnapshot(); const queue = new ProposalQueue();
  const review = renderToStaticMarkup(<HeldQueue state={state} queue={queue} />);
  for (const [name, action] of [[copy.propose_pass, 'release'], [copy.propose_bar, 'remove'],
    [copy.propose_ban, 'ban'], [copy.propose_dismiss, 'dismiss']] as const) expectBadge(review, name, action);
  const shield = renderToStaticMarkup(<ShieldButton state={state} queue={queue} />);
  expectBadge(shield, `${copy.shield} ${copy.shield_label}`, 'shield');
});

test('vote-bar controls and the Herald filter use the same shared key lookup', () => {
  const controls = renderToStaticMarkup(<VoteControls queue={new ProposalQueue()} full />);
  for (const [name, action] of [['Show the vote bar', 'vote_bar'], ['Restyle', 'restyle'], ['Custom design', 'custom']] as const) expectBadge(controls, name, action);
  const chart = renderToStaticMarkup(<Consensus results={fixtureCharts} compact />);
  expect(chart.match(/<kbd[^>]*>(.*?)<\/kbd>/)?.[1]).toBe(keyFor('moderator', 'filter'));
  for (const [full, short] of [['All messages', 'All'], ['Emotes only', 'Emotes'], ['Text only', 'Text'], ['Kappa', 'Kappa']]) {
    expect(chart).toMatch(new RegExp(`aria-label="${full}"[^>]*>${short}</button>`));
  }
});
