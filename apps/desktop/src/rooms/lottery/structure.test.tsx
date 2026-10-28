import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { ProposalQueue } from '@castle-control/ui/steward';
import LotteryRoom from './index.jsx';
import { draftRoll, lotterySession } from './session.js';

test('the workbench holds writ, proof and fairness, facing the urn and seal slot in details', () => {
  const queue = new ProposalQueue();
  draftRoll(queue);
  const markup = renderToStaticMarkup(<LotteryRoom snapshot={{ mode: 'fixture', phase: 'ready' }}
    replay={false} queue={queue} seal_slot={<aside aria-label="Seal slot" />} />);
  const workbenchStart = markup.indexOf('class="room-column lottery-workbench"');
  const detailsStart = markup.indexOf('class="room-column lottery-details"');
  expect(workbenchStart).toBeGreaterThan(0);
  expect(detailsStart).toBeGreaterThan(workbenchStart);
  const workbench = markup.slice(workbenchStart, detailsStart);
  const details = markup.slice(detailsStart);
  const writ = workbench.indexOf('class="lottery-writ"');
  const guardrails = workbench.indexOf('class="lottery-guardrails"');
  const proof = workbench.indexOf('class="lottery-proof"');
  const fairness = workbench.indexOf('class="lottery-fairness"');
  expect(writ).toBeGreaterThan(0);
  expect(guardrails).toBeGreaterThan(writ);
  expect(proof).toBeGreaterThan(guardrails);
  expect(fairness).toBeGreaterThan(proof);
  expect(workbench).toContain('<ol class="lottery-steps">');
  expect(workbench).not.toContain('class="lottery-urn-figure"');
  expect(workbench).not.toContain('aria-label="Seal slot"');
  const urn = details.indexOf('class="lottery-urn-figure"');
  expect(urn).toBeGreaterThan(0);
  expect(details.indexOf('aria-label="Seal slot"')).toBeGreaterThan(urn);
  expect(details).not.toContain('class="lottery-proof"');
  expect(details).not.toContain('class="lottery-fairness"');
  expect(details.match(/data-lot-dot=/g)).toHaveLength(lotterySession(queue).port.getSnapshot().entries.length);
  expect(markup).toContain('Proposal · not sealed');
});
