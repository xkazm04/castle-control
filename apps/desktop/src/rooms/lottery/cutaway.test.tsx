import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { ProposalQueue } from '@castle-control/ui/steward';
import { lotsCopy as copy } from '../../lots-copy.js';
import { createCoreLotsPort } from '../../lots-core.js';
import { createLotsPreview } from '../../lots-model.js';
import { ConnectedLotsRoom } from './core.jsx';
import { createDrawDisplay } from './display.js';
import LotteryRoom from './index.jsx';
import { FixtureCast } from './result.jsx';
import { draftRoll, lotterySession, sealLotteryProposal } from './session.js';
import { LotteryWrit } from './writ.jsx';

const room = (queue: ProposalQueue) => renderToStaticMarkup(<LotteryRoom snapshot={{ mode: 'fixture', phase: 'ready' }} replay={false} queue={queue} />);

test('the roll panel follows the real queue through draft, tear and seal', async () => {
  const queue = new ProposalQueue();
  expect(room(queue)).toContain('data-role="lot-draw-card"');
  draftRoll(queue);
  expect(room(queue)).toContain('class="lottery-pending"');
  const first = queue.pending('lottery')[0];
  if (!first) throw new Error('Missing generated draft');
  queue.tearUp(first.id);
  expect(room(queue)).not.toContain('class="lottery-pending"');
  draftRoll(queue);
  const proposal = queue.pending('lottery')[0];
  if (!proposal) throw new Error('Missing generated draft');
  expect(renderToStaticMarkup(<LotteryWrit proposal={proposal} />)).toMatch(/data-stamp="draft" data-land=""/);
  await sealLotteryProposal(queue, proposal);
  const sealed_room = room(queue);
  expect(sealed_room).toContain('Sealed · the roll is frozen, waiting for the cast');
  expect(sealed_room).toContain('data-tone="sealed"');
  const sealed = queue.getSnapshot().proposals.find(item => item.id === proposal.id);
  if (!sealed) throw new Error('Missing generated sealed writ');
  const markup = renderToStaticMarkup(<LotteryWrit proposal={sealed} />);
  expect(markup).toMatch(/data-stamp="sealed" data-land=""/);
  expect(lotterySession(queue).port.getSnapshot().sealed).toBe(true);
});

test.each([true, false, undefined])('core simulated=%s marks only known simulated provenance', simulated => {
  const port = createCoreLotsPort({ mode: 'core', endpoint: 'http://127.0.0.1:3210/', session_token: 'a'.repeat(64) });
  const markup = renderToStaticMarkup(<ConnectedLotsRoom port={port} {...(simulated === undefined ? {} : { simulated })} />);
  expect(markup.match(/class="cc-sim">Simulated</g) ?? []).toHaveLength(simulated ? 1 : 0);
  expect(markup).toContain(simulated === false ? 'Live mode · trusted quicknet' : simulated ? 'SIMULATED audience' : 'Round source unknown');
});

test('cast winners keep their order and the reveal timing', async () => {
  const port = createLotsPreview(); await port.seal(); await port.start();
  const display = createDrawDisplay(); display.edit({ reveal_ms: 750 });
  const markup = renderToStaticMarkup(<FixtureCast port={port} display={display.getSnapshot()} />);
  const tickets = markup.match(/<li class="ticket"[^>]*>[\s\S]*?<\/li>/g) ?? [];
  const winners = port.getSnapshot().simulated_winners ?? [];
  expect(tickets).toHaveLength(3);
  tickets.forEach((ticket, index) => {
    expect(ticket).toContain(`<b aria-hidden="true">${index + 1}</b><span>${winners[index]}</span>`);
    expect(ticket).toContain('data-current-winner="true"');
  });
  expect(markup).toContain('--draw-reveal:750ms');
  expect(markup).toContain(`aria-label="${copy.journey.cast_title}"`);
});

test('reduced motion leaves every mounted ticket visible immediately', async () => {
  const port = createLotsPreview(); await port.seal(); await port.start();
  const winners = port.getSnapshot().simulated_winners ?? [];
  const markup = renderToStaticMarkup(<FixtureCast port={port} display={createDrawDisplay().getSnapshot()} />);
  expect(markup.match(/data-role="lot-ticket"/g)).toHaveLength(winners.length);
  const css = readFileSync(new URL('./appearance.css', import.meta.url), 'utf8');
  const reduced = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'));
  expect(reduced).toContain('.lottery-room .ticket.cc-print-in');
});

test('the urn count is one calm figure followed by its caption', () => {
  const markup = room(new ProposalQueue());
  expect(markup).toContain('data-role="lot-count"><b>87</b><span>lots · eligible</span>');
});

test('fixture and core keep the hall first and the rarely used tools behind one More disclosure', () => {
  const port = createCoreLotsPort({ mode: 'core', endpoint: 'http://127.0.0.1:3210/', session_token: 'a'.repeat(64) });
  for (const markup of [room(new ProposalQueue()), renderToStaticMarkup(<ConnectedLotsRoom port={port} />)]) {
    const hall = markup.indexOf('class="cc-hall"');
    const more = markup.indexOf('data-role="lot-more"');
    expect(hall).toBeGreaterThan(-1);
    expect(more).toBeGreaterThan(hall);
    expect(markup.match(/data-role="lot-more"/g)).toHaveLength(1);
    expect(markup.slice(more)).toContain(`aria-label="${copy.lookup_title}"`);
    expect(markup.slice(more)).toContain('class="cc-numbered-discs"');
    expect(markup.slice(hall, more)).not.toContain(copy.lookup_title);
  }
});
