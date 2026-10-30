import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { ProposalQueue } from '@castle-control/ui/steward';
import LotteryRoom from './index.jsx';
import SealSlot from '../seal-slot/index.jsx';
import { draftRoll, lotterySession } from './session.js';
import { fixtureCooldown, fixtureDraws } from '../../lots-fixture.js';
import { lotsCopy as copy } from '../../lots-copy.js';

const snapshot = { mode: 'fixture', phase: 'ready' } as const;
const render = (queue: ProposalQueue) => renderToStaticMarkup(<LotteryRoom snapshot={snapshot}
  replay={false} queue={queue} seal_slot={<SealSlot chamber="lottery" queue={queue} />} />);

test('C puts the urn stage before the independently scrolling desk and its ordered tools', () => {
  // lottery/README.md, C · Herald: “The stage moves to the left ... reverses
  // today's writ-left, urn-right order.” This deliberately replaces the old order.
  for (const drafted of [false, true]) {
    const queue = new ProposalQueue();
    if (drafted) draftRoll(queue);
    const markup = render(queue);
    const stageStart = markup.indexOf('class="cc-stage-wrap"');
    const deskStart = markup.indexOf('class="cc-desk"');
    expect(stageStart).toBeGreaterThan(0);
    expect(deskStart).toBeGreaterThan(stageStart);
    const stage = markup.slice(stageStart, deskStart);
    const desk = markup.slice(deskStart);
    expect(stage).toContain('class="cc-stage ');
    expect(stage).toContain('class="cc-urn"');
    expect(stage).toContain('class="cc-medals"');
    expect(stage.match(/data-corner=/g)).toHaveLength(4);
    expect(stage.match(/data-lot-dot=/g)).toHaveLength(lotterySession(queue).port.getSnapshot().entries.length);
    expect(stage).not.toContain('aria-label="Seal slot"');
    const sections = [drafted ? 'cc-ticket cc-writ' : 'class="cc-blazons"', 'class="cc-ribbon"',
      'class="lottery-seal-frame"', 'aria-label="Entry lookup"', 'aria-label="Saved simulated proof bundle"',
      'class="cc-numbered-discs"'].map(marker => desk.indexOf(marker));
    expect(sections.every((index, position) => index >= 0 && (position === 0 || index > (sections[position - 1] ?? -1)))).toBe(true);
    expect(desk).not.toContain('data-lot-dot=');
    if (drafted) expect(desk).toContain('Proposal · not sealed');
  }
});

test('blazons expose pressed selection, named shield charges and per-template verdict reasons', () => {
  const queue = new ProposalQueue();
  lotterySession(queue).port.select('free-prize');
  const markup = render(queue);
  const cards = markup.match(/<button[^>]*data-card="selectable"[\s\S]*?<\/button>/g) ?? [];
  expect(cards).toHaveLength(fixtureDraws.length);
  cards.forEach((card, index) => {
    const draw = fixtureDraws[index];
    expect(card).toContain('class="cc-shield"');
    expect(card).toContain(`class="cc-card-title">${draw?.name}</b>`);
    expect(card).toContain(`aria-pressed="${draw?.draw_id === 'free-prize'}"`);
    expect(card).toContain('data-stamp="verdict"');
  });
  expect(cards[0]).toContain('>?</text>');
  expect(cards[1]).toContain(copy.reasons.missing_rules);
  expect(cards[1]).toContain(copy.reasons.missing_disclaimer);
  expect(cards[2]).toContain(copy.reasons.paid_weight);
  expect(markup).toContain(copy.lookup_hint);
});

test('stage medal values and cohort legend come from the selected fixture and amended proposal', () => {
  const queue = new ProposalQueue();
  const state = lotterySession(queue).port.getSnapshot();
  const markup = render(queue);
  expect(markup).toContain(`class="cc-hero-figure" data-text="${state.entries.length}"`);
  const medals = markup.match(/class="cc-medal-disc">([\s\S]*?)<\/span>/g) ?? [];
  expect(medals).toEqual([
    `class="cc-medal-disc">${state.draw.rules.winner_count}</span>`,
    `class="cc-medal-disc">${fixtureCooldown.length}</span>`,
    'class="cc-medal-disc">1/3</span>',
  ]);
  for (const cohort of ['new_account', 'subscriber', 'raider'] as const) {
    expect(markup).toContain(`<li data-cohort="${cohort}">${copy.cohorts[cohort]} <b>${state.entries.filter(entry => entry.cohort === cohort).length}</b>`);
  }
  draftRoll(queue);
  const proposal = queue.pending('lottery')[0];
  if (!proposal) throw new Error('Missing generated proposal');
  queue.amend(proposal.id, [{ key: 'winners', value: 5 }]);
  expect(render(queue)).toContain('class="cc-medal-disc"><s>3</s><ins>5</ins>');
});

test('a drafted writ has exactly one shared hold control and no ticket authorization control', () => {
  const queue = new ProposalQueue(); draftRoll(queue);
  const markup = render(queue);
  expect(markup.match(/aria-label="Hold to seal"/g)).toHaveLength(1);
  expect(markup.match(/aria-label="Seal hold progress"/g)).toHaveLength(1);
  expect(markup.slice(markup.indexOf('cc-ticket cc-writ'), markup.indexOf('class="cc-ribbon"'))).not.toContain('cc-seal-button');
});
