import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { ProposalQueue } from '@castle-control/ui/steward';
import ModeratorRoom from './index.jsx';

test('holds, replay and tools occupy separate columns, with the seal slot after the tools', () => {
  const markup = renderToStaticMarkup(<ModeratorRoom snapshot={{ mode: 'fixture', phase: 'ready' }}
    replay={false} queue={new ProposalQueue()} seal_slot={<aside aria-label="Seal slot" />} />);
  const review = markup.indexOf('class="room-column moderator-workbench"');
  const replay = markup.indexOf('class="room-column moderator-details moderator-replay"');
  const tools = markup.indexOf('class="room-column moderator-tools"');
  expect(review).toBeGreaterThan(0);
  expect(replay).toBeGreaterThan(review);
  expect(tools).toBeGreaterThan(replay);
  expect(markup.slice(review, replay)).toContain('moderator-held-plate');
  expect(markup.slice(review, replay)).toContain('moderator-consensus');
  expect(markup.slice(replay, tools)).toContain('aria-rowcount="420"');
  expect(markup.slice(replay, tools)).not.toContain('Garrison orders');
  const region = markup.slice(tools);
  // moderator/README.md, C · Herald, Porting risks: moat precedes garrison
  // orders intentionally because the drawbridge is the emergency control.
  expect(region.indexOf('The moat')).toBeLessThan(region.indexOf('Garrison orders'));
  expect(region.indexOf('Garrison orders')).toBeLessThan(region.indexOf('href="#/chamber/moderator/drill"'));
  expect(region.indexOf('gate log')).toBeGreaterThan(region.indexOf('href="#/chamber/moderator/drill"'));
  expect(region.indexOf('aria-label="Seal slot"')).toBeGreaterThan(region.indexOf('gate log'));
  expect(markup.match(/class="cc-plate cc-offset-shadow/g)).toHaveLength(3);
  expect(markup.match(/role="region"[^>]*tabindex="0"/g)).toHaveLength(3);
  expect(markup.slice(replay, tools)).toContain('data-fill="true"');
});
