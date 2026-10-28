import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { ProposalQueue } from '@castle-control/ui/steward';
import LotteryRoom from './index.jsx';
import { draftRoll, lotterySession } from './session.js';

test('the writ faces the urn, followed by the saved proof and visible fairness steps', () => {
  const queue = new ProposalQueue();
  draftRoll(queue);
  const markup = renderToStaticMarkup(<LotteryRoom snapshot={{ mode: 'fixture', phase: 'ready' }}
    replay={false} queue={queue} seal_slot={<aside aria-label="Seal slot" />} />);
  const details = markup.slice(markup.indexOf('class="room-column lottery-details"'));
  const urn = details.indexOf('class="lottery-urn-figure"');
  const proof = details.indexOf('class="lottery-proof"');
  const fairness = details.indexOf('class="lottery-fairness"');
  expect(urn).toBeGreaterThan(0);
  expect(proof).toBeGreaterThan(urn);
  expect(fairness).toBeGreaterThan(proof);
  expect(details.indexOf('aria-label="Seal slot"')).toBeGreaterThan(fairness);
  expect(details).toContain('<ol class="lottery-steps">');
  expect(details.match(/data-lot-dot=/g)).toHaveLength(lotterySession(queue).port.getSnapshot().entries.length);
  expect(markup.indexOf('class="lottery-writ"')).toBeLessThan(markup.indexOf('class="room-column lottery-details"'));
  expect(markup).toContain('Proposal · not sealed');
});
