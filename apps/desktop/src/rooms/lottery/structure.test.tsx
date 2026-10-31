import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { ProposalQueue } from '@castle-control/ui/steward';
import LotteryRoom from './index.jsx';
import SealSlot from '../seal-slot/index.jsx';
import { draftRoll, lotterySession } from './session.js';
import { fixtureCooldown, fixtureDraws, fixtureWrit } from '../../lots-fixture.js';
import { lotsCopy as copy } from '../../lots-copy.js';
import { createLotsPreview } from '../../lots-model.js';
import { createCoreLotsPort } from '../../lots-core.js';
import { ConnectedLotsRoom } from './core.jsx';
import { FixtureCast } from './result.jsx';
import { createDrawDisplay } from './display.js';

const snapshot = { mode: 'fixture', phase: 'ready' } as const;
const render = (queue: ProposalQueue) => renderToStaticMarkup(<LotteryRoom snapshot={snapshot}
  replay={false} queue={queue} seal_slot={<SealSlot chamber="lottery" queue={queue} />} />);

test('lots-09 current writ exposes disclosure state and its controlled section', async () => {
  const port = createLotsPreview(); await port.seal(); await port.start();
  const display = createDrawDisplay().getSnapshot();
  for (const expanded of [false, true, false]) {
    port.nested(expanded);
    const html = renderToStaticMarkup(<FixtureCast port={port} hash="simulated-seal" display={display} />);
    const toggle = html.match(/<button\b[^>]*>[\s\S]*?<\/button>/g)?.find(button =>
      button.includes(expanded ? copy.journey.close : copy.journey.read));
    expect(toggle).toContain(`aria-expanded="${expanded}"`);
    const id = toggle?.match(/aria-controls="([^"]+)"/)?.[1];
    expect(id).toBeTruthy();
    expect(html).toContain(`<section id="${id}"`);
    expect(html).toContain(`<section id="${id}"${expanded ? '' : ' hidden=""'}`);
  }
});

test('lots-09 fixture and connected rooms have no names on generic divs', () => {
  const port = createCoreLotsPort({ mode: 'core', endpoint: 'http://127.0.0.1:3210/', session_token: 'a'.repeat(64) });
  for (const html of [render(new ProposalQueue()), renderToStaticMarkup(<ConnectedLotsRoom port={port} />)]) {
    const divs = html.match(/<div\b[^>]*>/g) ?? [];
    expect(divs.filter(div => div.includes('aria-label=') && !div.includes('role='))).toEqual([]);
  }
});

test('lots-09 core proof toggle controls a stable section and waits for an available writ', async () => {
  const draw = fixtureDraws[0];
  if (!draw) throw new Error('Missing simulated draw');
  const run_id = '01ARZ3NDEKTSV4RRFFQ69G5FAV';
  const responses = new Map<string, unknown>([
    ['lots.draw.list', { draws: [draw] }], ['lots.draw.check', { result: 'ok', reasons: [] }],
    ['lots.roll.seal', { draw_id: draw.draw_id, draw_run_id: run_id, sealed: { roll: fixtureWrit.roll, seal: fixtureWrit.seal } }],
    ['lots.cast', { draw_run_id: run_id, writ_id: '01ARZ3NDEKTSV4RRFFQ69G5FAW',
      cast: { seal: fixtureWrit.seal, winners: fixtureWrit.winners, label: 'streamer-controlled' } }],
  ]);
  const port = createCoreLotsPort({ mode: 'core', endpoint: 'http://127.0.0.1:3210/', session_token: 'a'.repeat(64) },
    { rpc: async (_endpoint, _session, method) => responses.get(method) });
  await port.load(); await port.seal(); await port.start();
  const render = () => renderToStaticMarkup(<ConnectedLotsRoom port={port} />);
  const toggle = (html: string) => html.match(/<button\b[^>]*>[\s\S]*?<\/button>/g)?.find(button => button.endsWith(`>${copy.core.proof}</button>`));
  expect(toggle(render())).toContain('disabled=""');
  responses.set('lots.writ.get', fixtureWrit); await port.recompute();
  let controlled_id: string | undefined;
  for (const expanded of [false, true, false]) {
    port.nested(expanded);
    const html = render(); const button = toggle(html);
    expect(button).toContain(`aria-expanded="${expanded}"`);
    expect(button).not.toContain('disabled=""');
    const id = button?.match(/aria-controls="([^"]+)"/)?.[1];
    expect(id).toBeTruthy(); controlled_id ??= id;
    expect(id).toBe(controlled_id);
    expect(html).toContain(`<section id="${id}"${expanded ? '' : ' hidden=""'}`);
  }
});

test('the seal frame removes only the shell slot top rule and spacing', () => {
  const css = readFileSync(new URL('./room.css', import.meta.url), 'utf8');
  const rule = css.match(/\.lottery-room\s+\.lottery-seal-frame\s+\.shell-seal-slot\s*\{([^}]*)\}/)?.[1];
  expect(rule).toBeDefined();
  for (const property of ['border-top', 'margin-top', 'padding-top']) {
    expect(rule).toMatch(new RegExp(`(?:^|;)\\s*${property}:\\s*0\\s*(?:;|$)`));
  }
  expect(rule).not.toMatch(/(?:^|;)\s*(?:border|margin|padding|padding-bottom)\s*:/);
});

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
