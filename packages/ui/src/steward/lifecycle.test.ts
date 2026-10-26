import { describe, expect, test } from 'vitest';
import { transition } from './lifecycle.js';
import type { Proposal, ProposalEvent, ProposalKind, ProposalState } from './port.js';

function draft(overrides: Partial<Proposal> = {}): Proposal {
  return {
    id: 'proposal-1', chamber: 'lottery', kind: 'seal', title: 'Question draw',
    revision: 1, state: 'drafted',
    fields: [{ key: 'winners', label: 'Winners', value: 3, struck: [] }],
    ...overrides,
  };
}

const states: ProposalState[] = ['drafted', 'amended', 'sealed', 'proclaimed', 'torn'];
const kinds: ProposalKind[] = ['seal', 'proclaim'];
const events: ProposalEvent[] = [
  { type: 'amend', fields: [{ key: 'winners', value: 5 }] },
  { type: 'seal', seal_hash: 'sample-hash' }, { type: 'proclaim' }, { type: 'tearUp' },
];
const matrix = kinds.flatMap(kind => states.flatMap(state => events.map(event => ({ kind, state, event }))));

describe('complete lifecycle matrix', () => {
  test.each(matrix)('$kind $state + $event.type', ({ kind, state, event }) => {
    const proposal = draft({ kind, state });
    const before = structuredClone(proposal);
    const result = transition(proposal, event);
    const pending = state === 'drafted' || state === 'amended';
    const legal = pending && (event.type === 'amend' || event.type === 'tearUp'
      || (kind === 'seal' && event.type === 'seal') || (kind === 'proclaim' && event.type === 'proclaim'));
    expect(result.ok).toBe(legal);
    expect(proposal).toEqual(before);
    if (result.ok) {
      const expected = { amend: 'amended', seal: 'sealed', proclaim: 'proclaimed', tearUp: 'torn' };
      expect(result.proposal.state).toBe(expected[event.type]);
      expect(result.proposal.revision).toBe(event.type === 'amend' ? 2 : 1);
    } else {
      expect(result.reason.length).toBeGreaterThan(0);
    }
  });
});

test('amendment history preserves previous values in order', () => {
  const first = transition(draft(), { type: 'amend', fields: [{ key: 'winners', value: 5 }] });
  expect(first.ok).toBe(true);
  if (!first.ok) return;
  const second = transition(first.proposal, { type: 'amend', fields: [{ key: 'winners', value: 7 }] });
  expect(second.ok).toBe(true);
  if (!second.ok) return;
  expect(second.proposal.fields[0]).toEqual({ key: 'winners', label: 'Winners', value: 7, struck: [3, 5] });
  expect(second.proposal.revision).toBe(3);
  expect(first.proposal.fields[0]?.struck).toEqual([3]);
});

test.each([
  { fields: [] }, { fields: [{ key: 'missing', value: 5 }] },
  { fields: [{ key: 'winners', value: 4 }, { key: 'winners', value: 5 }] },
])('malformed amendments are refused atomically: $fields', ({ fields }) => {
  const proposal = draft();
  expect(transition(proposal, { type: 'amend', fields }).ok).toBe(false);
  expect(proposal.fields[0]?.value).toBe(3);
});

test('caller supplied hash is retained only when sealing', () => {
  const result = transition(draft(), { type: 'seal', seal_hash: 'caller-hash' });
  expect(result.ok && result.proposal.seal_hash).toBe('caller-hash');
  const plain = transition(draft(), { type: 'seal' });
  expect(plain.ok && Object.hasOwn(plain.proposal, 'seal_hash')).toBe(false);
});
