import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { tokens } from '@castle-control/tokens';
import { ProposalQueue } from '@castle-control/ui/steward';
import { lotsCopy as copy } from '../../lots-copy.js';
import { createCoreLotsPort } from '../../lots-core.js';
import { createLotsPreview } from '../../lots-model.js';
import { ConnectedLotsRoom } from './core.jsx';
import { createDrawDisplay } from './display.js';
import LotteryRoom from './index.jsx';
import { PolicyStamp, WritHeading } from './print.jsx';
import { FixtureCast } from './result.jsx';
import { draftRoll, lotterySession, sealLotteryProposal } from './session.js';
import { LotteryWrit } from './writ.jsx';

test.each([['ok', 'ok'], ['warn', 'held'], ['blocked', 'blocked']] as const)(
  'policy %s uses the %s stamp with its word from copy', (result, kind) => {
    const markup = renderToStaticMarkup(<PolicyStamp result={result} />);
    expect(markup).toContain(`data-stamp="${kind}"`);
    expect(markup).toContain(`>${copy.checks[result]}</span>`);
    expect(markup).toContain('role="img"');
    expect(markup).not.toContain('data-stamp="draft"');
  },
);

test.each([
  [false, false, 'simulated', copy.waiting], [true, false, 'draft', copy.awaiting],
  [false, true, 'sealed', copy.frozen_stamp], [true, true, 'draft', copy.awaiting],
] as const)('writ heading awaiting=%s frozen=%s uses %s', (awaiting, frozen, kind, word) => {
  const markup = renderToStaticMarkup(<WritHeading awaiting={awaiting} frozen={frozen} />);
  expect(markup).toContain(`data-stamp="${kind}"`);
  expect(markup).toContain(`>${word}</span>`);
});

test('fixture heading follows the real queue through draft, tear and seal', async () => {
  const queue = new ProposalQueue();
  const render = () => renderToStaticMarkup(<LotteryRoom snapshot={{ mode: 'fixture', phase: 'ready' }} replay={false} queue={queue} />)
    .match(/<span class="lottery-heading-stamp">[\s\S]*?<\/h3>/)?.[0];
  expect(render()).toContain('data-stamp="simulated"');
  draftRoll(queue);
  expect(render()).toContain('data-stamp="draft"');
  const first = queue.pending('lottery')[0];
  if (!first) throw new Error('Missing generated draft');
  queue.tearUp(first.id);
  expect(render()).toContain('data-stamp="simulated"');
  draftRoll(queue);
  const proposal = queue.pending('lottery')[0];
  if (!proposal) throw new Error('Missing generated draft');
  const draft = renderToStaticMarkup(<LotteryWrit proposal={proposal} />);
  expect(draft).toMatch(/data-stamp="draft" data-land=""/);
  await sealLotteryProposal(queue, proposal);
  expect(render()).toContain('data-stamp="sealed"');
  const sealed = queue.getSnapshot().proposals.find(item => item.id === proposal.id);
  if (!sealed) throw new Error('Missing generated sealed writ');
  const markup = renderToStaticMarkup(<LotteryWrit proposal={sealed} />);
  expect(markup).toMatch(/data-stamp="sealed" data-land=""/);
  expect(markup).toContain('class="cc-stamp-bleed" data-stamp="sealed"');
  expect(lotterySession(queue).port.getSnapshot().sealed).toBe(true);
});

test.each([true, false, undefined])('core simulated=%s stamps only known simulated provenance', simulated => {
  const port = createCoreLotsPort({ mode: 'core', endpoint: 'http://127.0.0.1:3210/', session_token: 'a'.repeat(64) });
  const markup = renderToStaticMarkup(<ConnectedLotsRoom port={port} {...(simulated === undefined ? {} : { simulated })} />);
  const stamps = markup.match(/data-stamp="simulated"/g) ?? [];
  expect(stamps).toHaveLength(simulated ? 2 : 0);
  if (!simulated) expect(markup).toContain(simulated === false ? 'Live mode · trusted quicknet' : 'Round source unknown');
});

test('sealed winners retain their order and print at .15, .43 and .71 seconds', async () => {
  const port = createLotsPreview(); await port.seal(); await port.start();
  const display = createDrawDisplay(); display.edit({ reveal_ms: 750 });
  const markup = renderToStaticMarkup(<FixtureCast port={port} hash="simulated-seal" display={display.getSnapshot()} />);
  const tickets = markup.match(/<p class="ticket cc-print-in"[^>]*>[\s\S]*?<\/p>/g) ?? [];
  const winners = port.getSnapshot().simulated_winners ?? [];
  expect(tickets).toHaveLength(3);
  tickets.forEach((ticket, index) => {
    expect(ticket).toContain(`style="--cc-entrance-index:${index}"`);
    expect(ticket).toContain(`>${winners[index]}</p>`);
    expect(ticket).toContain('data-role="lot-ticket"');
  });
  const css = readFileSync(new URL('./appearance.css', import.meta.url), 'utf8');
  expect(css).toContain('--cc-entrance-start: .15s; --cc-entrance-step: var(--motion-shell)');
  expect(tokens.layout['motion-shell']).toBe('.28s');
  expect([0, 1, 2].map(index => Number((.15 + index * Number.parseFloat(tokens.layout['motion-shell'])).toFixed(2))))
    .toEqual([.15, .43, .71]);
  expect(markup).toContain('--draw-reveal:750ms');
  expect(markup).toMatch(/data-stamp="sealed" data-land=""/);
  expect(markup).toContain('class="cc-stamp-bleed" data-stamp="sealed"');
});

test('reduced motion leaves every mounted ticket visible immediately', async () => {
  const port = createLotsPreview(); await port.seal(); await port.start();
  const winners = port.getSnapshot().simulated_winners ?? [];
  const markup = renderToStaticMarkup(<FixtureCast port={port} hash="simulated-seal" display={createDrawDisplay().getSnapshot()} />);
  expect(markup.match(/data-role="lot-ticket"/g)).toHaveLength(winners.length);
  const css = readFileSync(new URL('./appearance.css', import.meta.url), 'utf8');
  const reduced = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'));
  expect(reduced).toContain('.lottery-room .ticket.cc-print-in');
  for (const declaration of ['animation: none', 'opacity: 1', 'transform: none', 'clip-path: none']) expect(reduced).toContain(declaration);
});

test('both panels and ordered desk sections use the shared entrance index', () => {
  const markup = renderToStaticMarkup(<LotteryRoom snapshot={{ mode: 'fixture', phase: 'ready' }} replay={false} queue={new ProposalQueue()} />);
  expect(markup).toMatch(/data-role="lot-urn-panel" style="--cc-entrance-index:0"/);
  expect(markup).toMatch(/data-role="lot-writ-panel" style="--cc-entrance-index:1"/);
  for (const [label, index] of [[copy.setup, 3], [copy.stream, 4], [copy.lookup_title, 8]] as const) {
    const section = markup.match(new RegExp(`<article aria-label="${label}"[^>]*>`))?.[0];
    expect(section).toContain('panel cc-print-in');
    expect(section).toContain(`--cc-entrance-index:${index}`);
  }
});

test('the urn count uses one shadowed figure followed by its caption', () => {
  const markup = renderToStaticMarkup(<LotteryRoom snapshot={{ mode: 'fixture', phase: 'ready' }} replay={false} queue={new ProposalQueue()} />);
  const count = markup.match(/data-role="lot-count">([\s\S]*?)<\/span>/)?.[1] ?? '';
  expect(count).toContain('data-ghost="shadow"');
  expect(count).not.toContain('data-ghost="overprint"');
  expect(count.match(/class="cc-hero-figure"/g)).toHaveLength(1);
  expect(count).toContain('>87</b><span class="cc-hero-caption">lots · eligible');
});

test('fixture and core keep the writ heading and scroll cue outside the keyboard scroll region', () => {
  const port = createCoreLotsPort({ mode: 'core', endpoint: 'http://127.0.0.1:3210/', session_token: 'a'.repeat(64) });
  const rooms = [<LotteryRoom snapshot={{ mode: 'fixture', phase: 'ready' }} replay={false} queue={new ProposalQueue()} />,
    <ConnectedLotsRoom port={port} />];
  for (const room of rooms) {
    const markup = renderToStaticMarkup(room);
    const desk = markup.slice(markup.indexOf('data-role="lot-writ-panel"'));
    const body = desk.indexOf('class="lottery-desk-body"');
    expect(body).toBeGreaterThan(desk.indexOf('</h3>'));
    expect(desk.slice(0, body)).toContain('class="topline"');
    expect(desk).toContain(`class="lottery-desk-body" role="region" aria-label="${copy.desk_contents}" tabindex="0"`);
    expect(desk).toContain(`<p class="lottery-scroll-cue">${copy.desk_scroll}`);
    expect(desk).toContain('</div><p class="lottery-scroll-cue">');
    expect(desk.indexOf('class="lottery-scroll-cue"')).toBeGreaterThan(desk.indexOf('class="cc-numbered-discs"'));
  }
});
