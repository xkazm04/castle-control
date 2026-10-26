import { expect, test } from 'vitest';
import { ProposalQueue, proposalQueue } from './queue.js';
import type { Proposal } from './port.js';

function draft(overrides: Partial<Proposal> = {}): Proposal {
  return {
    id: 'proposal-1', chamber: 'lottery', kind: 'seal', title: 'Question draw',
    revision: 1, state: 'drafted',
    fields: [{ key: 'winners', label: 'Winners', value: 3, struck: [] }], ...overrides,
  };
}

test('add or update never duplicates; updates use the amendment lifecycle', () => {
  const queue = new ProposalQueue();
  expect(queue.addOrUpdate(draft()).ok).toBe(true);
  expect(queue.addOrUpdate(draft({ fields: [{ key: 'winners', label: 'Winners', value: 5, struck: [] }] })).ok).toBe(true);
  expect(queue.getSnapshot().proposals).toHaveLength(1);
  expect(queue.pending()[0]).toMatchObject({ revision: 2, state: 'amended' });
  expect(queue.pending()[0]?.fields[0]?.struck).toEqual([3]);
});

test('two readers share stable immutable snapshots and unsubscribe independently', () => {
  const queue = new ProposalQueue();
  const initial = queue.getSnapshot();
  let inspector = initial;
  let room = initial;
  const stopInspector = queue.subscribe(() => { inspector = queue.getSnapshot(); });
  const stopRoom = queue.subscribe(() => { room = queue.getSnapshot(); });
  expect(queue.getSnapshot()).toBe(initial);
  queue.addOrUpdate(draft());
  expect(inspector).toBe(room);
  expect(initial.proposals).toHaveLength(0);
  expect(Object.isFrozen(room)).toBe(true);
  expect(Object.isFrozen(room.proposals)).toBe(true);
  expect(Object.isFrozen(room.proposals[0]?.fields[0]?.struck)).toBe(true);
  stopInspector();
  queue.amend('proposal-1', [{ key: 'winners', value: 5 }]);
  expect(inspector).not.toBe(room);
  stopRoom();
});

test('the exported application queue is one instance for both surfaces', async () => {
  const room = await import('./index.js');
  expect(room.proposalQueue).toBe(proposalQueue);
});

test('selection and focus notify both readers without changing proposals', () => {
  const queue = new ProposalQueue();
  queue.addOrUpdate(draft());
  const proposals = queue.getSnapshot().proposals;
  expect(queue.select('proposal-1')).toBe(true);
  expect(queue.getSnapshot()).toMatchObject({ selected_proposal_id: 'proposal-1', focus: { chamber: 'lottery' } });
  expect(queue.select('missing')).toBe(false);
  queue.focus({ chamber: 'moderator', layer: 'consensus' });
  expect(queue.getSnapshot().focus).toEqual({ chamber: 'moderator', layer: 'consensus' });
  expect(queue.getSnapshot().proposals).toBe(proposals);
  queue.select();
  expect(Object.hasOwn(queue.getSnapshot(), 'selected_proposal_id')).toBe(false);
});

test('tear up leaves no pending proposal and terminal proposals cannot be revived', () => {
  const queue = new ProposalQueue();
  queue.addOrUpdate(draft());
  queue.tearUp('proposal-1');
  expect(queue.pending()).toEqual([]);
  expect(queue.byChamber('lottery')).toHaveLength(1);
  expect(queue.addOrUpdate(draft()).ok).toBe(false);
  expect(queue.amend('proposal-1', [{ key: 'winners', value: 8 }]).ok).toBe(false);
});

test.each(['sealed', 'proclaimed', 'torn', 'amended'] as const)('cannot insert a proposal already %s', state => {
  const queue = new ProposalQueue();
  expect(queue.addOrUpdate(draft({ state })).ok).toBe(false);
  expect(queue.getSnapshot().proposals).toEqual([]);
});

test('only explicit seal and proclaim calls can authorize; invalid calls leave snapshot untouched', () => {
  const queue = new ProposalQueue();
  queue.addOrUpdate(draft());
  const original = queue.getSnapshot();
  expect(queue.addOrUpdate(draft({ state: 'sealed' })).ok).toBe(false);
  expect(queue.proclaim('proposal-1').ok).toBe(false);
  expect(queue.seal('missing').ok).toBe(false);
  expect(queue.getSnapshot()).toBe(original);
  expect(queue.seal('proposal-1', 'caller-hash').ok).toBe(true);
  expect(queue.getSnapshot().proposals[0]).toMatchObject({ state: 'sealed', seal_hash: 'caller-hash' });
  queue.addOrUpdate(draft({ id: 'visual-1', chamber: 'visuals', kind: 'proclaim' }));
  expect(queue.seal('visual-1').ok).toBe(false);
  expect(queue.proclaim('visual-1').ok).toBe(true);
  expect(queue.getSnapshot().proposals[1]?.state).toBe('proclaimed');
});

test('queue owns a frozen copy, refuses identity changes, and filters by chamber', () => {
  const queue = new ProposalQueue();
  const input = draft();
  queue.addOrUpdate(input);
  expect(queue.getSnapshot().proposals[0]).not.toBe(input);
  expect(queue.addOrUpdate(draft({ chamber: 'studio' })).ok).toBe(false);
  expect(queue.byChamber('studio')).toEqual([]);
  expect(queue.pending('lottery')).toHaveLength(1);
});
