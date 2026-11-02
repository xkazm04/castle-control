import { drawerProbe, openGatehouseDrawer } from './component-probe.jsx';
import { useEffect, useMemo, useRef, useState } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, expect, test, vi } from 'vitest';
import { ProposalQueue } from '@castle-control/ui/steward';
import ModeratorRoom from './index.jsx';
import { moderationSession, proposeCommand } from './session.js';
import { createCoreGatehousePort } from '../../gatehouse-core.js';
import { ConnectedGatehouse } from './core.jsx';
import { fixtureHeld } from '../../moderation-fixture.js';

afterEach(() => vi.restoreAllMocks());

function layout(html: string, sections: number) {
  expect(html).toContain('class="cc-chamber-layout"');
  expect(html.match(/data-role="room-picture"/g)).toHaveLength(1);
  expect(html).toContain('class="gh-gate-art cc-folio-art"');
  expect(html).toContain('aria-label="Room sections 1"');
  expect(html).toContain('aria-label="Room sections 2"');
  expect(html.match(/data-role="room-section"/g)).toHaveLength(sections);
  expect(html).toContain('Proposal · awaiting your seal'); expect(html).toContain('Program ·');
  expect(html).toContain('>Full chart</button>'); expect(html).toContain('>Proposal list</button>');
  expect(html).not.toContain('role="dialog"');
}

test('the portcullis picture precedes the original held message in the first section column', () => {
  const markup = renderToStaticMarkup(<ModeratorRoom snapshot={{ mode: 'fixture', phase: 'ready' }} replay={false} queue={new ProposalQueue()} />);
  const plate = markup.match(/<aside[^>]*class="cc-panel gh-gate moderator-held-plate"[\s\S]*?<\/aside>/)?.[0] ?? '';
  expect(markup).toContain('>At the portcullis</h3>');
  expect(markup.indexOf('class="gh-gate-art cc-folio-art"')).toBeLessThan(markup.indexOf('class="gh-held__msg"'));
  expect(markup).toContain('data-role="room-picture"');
  expect(plate).toContain('class="gh-held__msg"');
  expect(plate).toContain(fixtureHeld[0]?.message_text);
});

test('fixture layout puts picture/minis beside queue and gate/Herald columns; all benches are reachable in Drawer', () => {
  const queue = new ProposalQueue();
  const probe = drawerProbe(<ModeratorRoom snapshot={{ mode: 'fixture', phase: 'ready' }}
    replay={false} queue={queue} seal_slot={<aside aria-label="Seal slot" />} />, { controlled: false });
  const face = probe.render(); layout(face, 3);
  const column = face.slice(face.indexOf('aria-label="Room sections 1"'), face.indexOf('aria-label="Room sections 2"'));
  for (const text of ['Propose Pass', 'Propose Bar', 'Hold reason', 'simulated-message-0', 'Review queue', '1 pending ban']) expect(column).toContain(text);
  for (const text of ['Propose Ban', 'Propose Dismiss', 'simulated-message-26', '<small>Shield Mode · fixture only</small>']) expect(face).not.toContain(text);
  const gate_column = face.slice(face.indexOf('aria-label="Room sections 2"'));
  for (const text of ['What needs you', 'Raise the drawbridge', 'The Herald’s chart', 'Show the vote bar', 'Restyle', '36.7%']) expect(gate_column).toContain(text);
  for (const text of ['Garrison orders', 'Rule bench', 'The live room', 'Stream output preview', 'gate log']) expect(face).not.toContain(text);
  probe.click('Full chart'); expect(moderationSession(queue).view.getSnapshot().more).toBe(true);
  const opened = probe.render(); const drawer = opened.slice(opened.indexOf('role="dialog"'));
  expect(drawer).toContain('The Herald and more of the Gatehouse'); expect(drawer).toContain('aria-rowcount="420"');
  for (const text of ['Propose Ban', 'Propose Dismiss', 'simulated-message-26', '1 held message and 1 pending ban need you.', 'Shield Mode · fixture only']) expect(drawer).toContain(text);
  expect(drawer).toContain('Custom design'); expect(drawer).toContain('aria-label="Seal slot"');
  expect(drawer).toContain('Vote bar on stream'); expect(drawer).toContain('last 3 min');
  const order = ['Rule bench', 'The moat', 'Garrison orders', 'href="#/chamber/moderator/drill"', 'gate log', 'Stream output preview'].map(text => drawer.indexOf(text));
  expect(order.every((at, index) => at >= 0 && (index === 0 || at > (order[index - 1] ?? -1)))).toBe(true);
  probe.click('Close'); expect(probe.render()).not.toContain('role="dialog"');
  probe.click('Proposal list'); expect(probe.render()).toContain('aria-label="Seal slot"');
  probe.click('Close'); probe.render(); expect(moderationSession(queue).view.getSnapshot().more).toBe(false);
});

test('core uses both columns and the same reachable drawer without inventing queue actions', () => {
  const port = createCoreGatehousePort({ mode: 'core', endpoint: 'http://127.0.0.1:3210/', session_token: 'a'.repeat(64) }, {
    rpc: async () => { throw new Error('SSR must not call the core'); },
  });
  const probe = drawerProbe(<ConnectedGatehouse port={port} replay={false} seal_slot={<aside aria-label="Seal slot" />} />);
  const face = probe.render(); layout(face, 2);
  expect(face).toContain('held-message queue and pending ban queue are unavailable'); expect(face).not.toContain('Propose Ban');
  expect(face).not.toContain('No chat has reached the gate on your core yet.');
  expect(face).not.toContain('aria-label="Consensus messages"');
  probe.click('Full chart'); const opened = probe.render();
  for (const text of ['role="dialog"', 'Rule bench', 'The moat', 'Garrison orders', 'core decision history', 'aria-label="Seal slot"']) expect(opened).toContain(text);
  expect(opened).not.toContain('sample chat replay');
  expect(opened).toContain('No chat has reached the gate on your core yet.');
  expect(opened).toContain('Bans require the original message and human review.');
  expect(opened).toContain('Refresh consensus');
  expect(opened).toContain('aria-label="Consensus messages"');
  probe.click('Close'); expect(probe.render()).not.toContain('role="dialog"');
});

test('the drill route retains its existing layout and return route', () => {
  const html = renderToStaticMarkup(<ModeratorRoom snapshot={{ mode: 'fixture', phase: 'ready' }} replay queue={new ProposalQueue()} />);
  expect(html).toContain('class="moderator-drill-room"');
  expect(html).toContain('Recording gap'); expect(html).toContain('href="#/chamber/moderator"');
});

test('proposal/program minis and the expanded vote bar read the same room session', () => {
  const queue = new ProposalQueue(); const { port, output, view } = moderationSession(queue);
  const held = port.getSnapshot().held[0];
  if (!held) throw new Error('Missing simulated held message');
  proposeCommand(queue, { kind: 'release', decision_id: held.decision_id }, 'Pass held message');
  output.update('vote', 'anchor', 'top-right'); output.update('vote', 'size', 'L'); output.update('vote', 'art_style', 'pixel');
  view.setFilter(1);
  const room = <ModeratorRoom snapshot={{ mode: 'fixture', phase: 'ready' }} replay={false} queue={queue} />;
  const face = renderToStaticMarkup(room);
  expect(face).toContain('Pass held message'); expect(face).toContain('1 proposal');
  expect(face).toContain('aria-label="Emotes only" aria-pressed="true">Emotes');
  const details = openGatehouseDrawer(room);
  expect(details).toContain('data-anchor="top-right" data-size="L"');
  expect(details).toContain('data-art-style="pixel"'); expect(details).toContain('Pass held message');
  expect(details).toContain('top right · size L');
});

test('opening the drawer can mount seal-slot hooks without mocking or sharing their hook slots', () => {
  const effect = vi.fn();
  function SealSlotWithHooks() {
    const [label] = useState('SIMULATED seal slot');
    const ref = useRef({ label: 'native ref' });
    const content = useMemo(() => `${label} · ${ref.current.label}`, [label]);
    useEffect(effect, []);
    return <aside aria-label="Seal slot">{content}</aside>;
  }
  const probe = drawerProbe(<ModeratorRoom snapshot={{ mode: 'fixture', phase: 'ready' }} replay={false}
    queue={new ProposalQueue()} seal_slot={<SealSlotWithHooks />} />);
  layout(probe.render(), 3);
  for (const trigger of ['Full chart', 'Proposal list', 'Review queue · 1 held · 1 pending ban']) {
    probe.click(trigger);
    const html = probe.render();
    expect(html).toContain('role="dialog"'); expect(html).toContain('SIMULATED seal slot · native ref');
    const details = html.slice(html.indexOf('role="dialog"'));
    expect(details).toContain('simulated-message-26'); expect(details).toContain('Propose Dismiss');
    expect(html.match(/data-review-feedback="true"/g)).toHaveLength(1);
    probe.click('Close'); expect(probe.render()).not.toContain('role="dialog"');
  }
  for (const hook of [useState, useRef, useEffect, useMemo]) expect(vi.isMockFunction(hook)).toBe(false);
  expect(effect).not.toHaveBeenCalled();
});
