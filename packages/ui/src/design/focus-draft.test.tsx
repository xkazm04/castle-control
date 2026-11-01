import { expect, test } from 'vitest';
import { ProposalQueue } from '../steward/queue.js';
import { DesignFocusView } from './focus.jsx';
import { DesignSession } from './session.js';

function controls(session: DesignSession, artifact: 'urn' | 'draw') {
  const view = DesignFocusView({ artifact, session, snapshot: session.getSnapshot() });
  return view.props.children[4].props;
}

test('Restyle and Custom amend the open draft for the artifact instead of piling up new drafts', () => {
  const session = new DesignSession(new ProposalQueue());
  controls(session, 'urn').on_restyle('wheel');
  controls(session, 'urn').on_custom('quiet engraved');
  controls(session, 'urn').on_custom('bold bright');
  const pending = session.queue.pending();
  expect(pending).toHaveLength(1);
  expect(pending[0]?.revision).toBe(3);
  session.dispose();
});

test('a draft for another artifact is not amended', () => {
  const session = new DesignSession(new ProposalQueue());
  controls(session, 'urn').on_custom('quiet engraved');
  controls(session, 'draw').on_custom('quiet engraved');
  expect(session.queue.pending()).toHaveLength(2);
  session.dispose();
});

test('after the open draft is torn up, the next click drafts a new one', () => {
  const session = new DesignSession(new ProposalQueue());
  controls(session, 'urn').on_custom('quiet engraved');
  const first = session.queue.pending()[0];
  if (!first) throw new Error('Expected draft');
  session.tearUp(first.id);
  controls(session, 'urn').on_custom('quiet engraved');
  expect(session.queue.pending()).toHaveLength(1);
  expect(session.queue.pending()[0]?.id).not.toBe(first.id);
  session.dispose();
});
