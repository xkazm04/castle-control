import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { ProposalQueue } from '@castle-control/ui/steward';
import ModeratorRoom from './index.jsx';

test('the gate is the picture, the desk says what needs you, and benches wait behind one More', () => {
  const markup = renderToStaticMarkup(<ModeratorRoom snapshot={{ mode: 'fixture', phase: 'ready' }}
    replay={false} queue={new ProposalQueue()} seal_slot={<aside aria-label="Seal slot" />} />);
  const gate = markup.indexOf('class="cc-panel gh-gate moderator-held-plate"');
  const desk = markup.indexOf('class="gh-desk"');
  const needs = markup.indexOf('aria-label="What needs you"');
  const bans = markup.indexOf('class="gh-bans moderator-ban"');
  const herald = markup.indexOf('class="gh-herald"');
  const seal = markup.indexOf('aria-label="Seal slot"');
  const more = markup.indexOf('<details class="gh-more"');
  expect(gate).toBeGreaterThan(0);
  for (const [before, after] of [[gate, desk], [desk, needs], [needs, bans], [bans, herald], [herald, seal], [seal, more]] as const) {
    expect(after).toBeGreaterThan(before);
  }
  // The gate holds one held message at a time with its two proposals; the drawbridge stays on the face.
  expect(markup.slice(gate, desk)).toContain('>Propose Pass</button>');
  expect(markup.slice(gate, desk)).toContain('>Propose Bar</button>');
  expect(markup.slice(needs, bans)).toContain('Raise the drawbridge');
  expect(markup.slice(herald, seal)).toContain('Vote bar on stream');
  // Nothing from the benches sits on the face of the room.
  const face = markup.slice(0, more);
  for (const bench of ['Garrison orders', 'Rule bench', 'The live room', 'Stream output preview', 'gate log']) expect(face).not.toContain(bench);
  const region = markup.slice(more);
  expect(region).toContain('aria-rowcount="420"');
  // moderator/README.md, C · Herald, Porting risks: the moat precedes garrison orders.
  expect(region.indexOf('The moat')).toBeLessThan(region.indexOf('Garrison orders'));
  expect(region.indexOf('Garrison orders')).toBeLessThan(region.indexOf('href="#/chamber/moderator/drill"'));
  expect(region.indexOf('gate log')).toBeGreaterThan(region.indexOf('href="#/chamber/moderator/drill"'));
  expect(region.indexOf('Stream output preview')).toBeGreaterThan(region.indexOf('gate log'));
});
