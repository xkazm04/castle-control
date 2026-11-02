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
import { renderLotDrawer } from './drawer-test.jsx';
import { createDrawDisplay } from './display.js';

const snapshot = { mode: 'fixture', phase: 'ready' } as const;
const render = (queue: ProposalQueue, tools = false) => {
  const room = <LotteryRoom snapshot={snapshot} replay={false} queue={queue} seal_slot={<SealSlot chamber="lottery" queue={queue} />} />;
  return tools ? renderLotDrawer(lotterySession(queue).port, room) : renderToStaticMarkup(room);
};

test('lots-09 current writ exposes disclosure state and its controlled section', async () => {
  const port = createLotsPreview(); await port.seal(); await port.start();
  const display = createDrawDisplay().getSnapshot();
  for (const expanded of [false, true, false]) {
    port.nested(expanded);
    const html = renderToStaticMarkup(<FixtureCast port={port} display={display} />);
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
  const render = () => renderLotDrawer(port, <ConnectedLotsRoom port={port} />);
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

test('the picture comes first, compact controls flank it and full forms are reachable in the drawer', () => {
  for (const drafted of [false, true]) {
    const queue = new ProposalQueue();
    if (drafted) draftRoll(queue);
    const markup = render(queue);
    const stageStart = markup.indexOf('data-role="lot-urn-panel"');
    const columnsStart = markup.indexOf('class="cc-chamber-column"');
    expect(stageStart).toBeGreaterThan(0);
    expect(columnsStart).toBeGreaterThan(stageStart);
    const stage = markup.slice(stageStart, columnsStart);
    const columns = markup.slice(columnsStart);
    expect(stage).toContain('class="lottery-draw-svg"');
    expect(stage).toContain(`title="${copy.stage.titles.urn}">${copy.stage.titles.urn}</h2>`);
    expect(stage.match(/data-lot-dot=/g)).toHaveLength(lotterySession(queue).port.getSnapshot().entries.length);
    expect(stage).not.toContain('aria-label="Seal slot"');
    expect(columns).toContain('data-role="lot-roll-panel"');
    expect(columns.match(/data-role="lot-stat"/g)).toHaveLength(3);
    expect(columns).not.toContain('data-lot-dot=');
    expect(markup).not.toContain('role="dialog"');
    const opened = render(queue, true);
    const drawer = opened.slice(opened.indexOf('role="dialog"'));
    for (const form of ['Draw name', 'Eligible pool', 'Preview this draw']) {
      expect(markup).not.toContain(form);
      expect(drawer).toContain(form);
    }
    expect(drawer).toContain('aria-label="Seal slot"');
    if (drafted) expect(drawer).toContain('Proposal \u00b7 not sealed');
    else expect(columns).toContain('>Set up a draw</button>');
  }
});

test('compact rule chips and cohort legend come from the selected fixture', () => {
  const queue = new ProposalQueue();
  const state = lotterySession(queue).port.getSnapshot();
  const markup = render(queue);
  expect(markup).toContain(`<b>${state.draw.rules.winner_count}</b>`);
  expect(markup).toContain(`Held out<b>${fixtureCooldown.length}</b>`);
  expect(markup).toContain('<option value="1/3" selected="">1/3</option>');
  expect(markup).not.toContain('data-role="lot-legend"');
  const drawer = render(queue, true);
  for (const cohort of ['new_account', 'subscriber', 'raider'] as const) {
    expect(drawer).toContain(`<li data-cohort="${cohort}"><i class="cc-swatch" aria-hidden="true"></i>${copy.cohorts[cohort]} <b>${state.entries.filter(entry => entry.cohort === cohort).length}</b>`);
  }
  draftRoll(queue);
  const proposal = queue.pending('lottery')[0];
  if (!proposal) throw new Error('Missing generated proposal');
  queue.amend(proposal.id, [{ key: 'winners', value: 5 }]);
  expect(render(queue, true)).toMatch(/<s>3<\/s><ins[^>]*>5<\/ins>/);
});

test('a drafted writ has exactly one shared hold control and no ticket authorization control', () => {
  const queue = new ProposalQueue(); draftRoll(queue);
  const markup = render(queue, true);
  expect(markup.match(/aria-label="Hold to seal"/g)).toHaveLength(1);
  expect(markup.match(/aria-label="Seal hold progress"/g)).toHaveLength(1);
  const ticket = markup.match(/<article class="cc-ticket cc-writ[\s\S]*?<\/article>/)?.[0];
  expect(ticket).toBeDefined();
  expect(ticket).not.toContain('cc-seal-button');
});

test('fixture and core render ChamberLayout with a picture and both section columns', () => {
  const port = createCoreLotsPort({ mode: 'core', endpoint: 'http://127.0.0.1:3210/', session_token: 'a'.repeat(64) });
  for (const markup of [render(new ProposalQueue()), renderToStaticMarkup(<ConnectedLotsRoom port={port} />)]) {
    const pool = markup.slice(markup.indexOf('data-role="room-picture"'), markup.indexOf('class="cc-chamber-minis"'));
    expect(pool).toMatch(/class="lottery-stage"><div class="lottery-draw-stage"/);
    expect(pool).not.toContain('data-role="lot-stat"');
    expect(markup.match(/data-role="room-picture"/g)).toHaveLength(1);
    expect(markup.match(/class="cc-chamber-column"/g)).toHaveLength(2);
    expect(markup.match(/data-role="room-section"/g)).toHaveLength(5);
    expect(markup.match(/data-role="lot-stat"/g)).toHaveLength(3);
    expect(markup).toContain('>The writ and draw tools</button>');
  }
});
