/// <reference types="node" />
import { expect, test } from 'vitest';
import { parseDuelList, slugId } from './list.js';
import { SAMPLE, SAMPLE_LABEL } from './sample.js';

const items = [
  { id: 'sample-one', title: 'One', by: 'sample-author' },
  { id: 'sample-two', title: 'Two', by: 'sample-author', note: '' },
];
test('list door trims required text, omits absent keys, preserves notes, and freezes its own copy', () => {
  const list = parseDuelList({ title: ' Sample list ', prompt: ' Choose ', items });
  expect(list.title).toBe('Sample list');
  expect(list.prompt).toBe('Choose');
  expect(list.items[0]).not.toHaveProperty('note');
  expect(list.items[1]!.note).toBe('');
  expect(Object.isFrozen(list.items[0])).toBe(true);
  expect(Object.isFrozen(list.items)).toBe(true);
  expect(Object.isFrozen(list)).toBe(true);
  expect(parseDuelList({ title: 'Sample', items })).not.toHaveProperty('prompt');
});

test.each([
  null, [], 'text', new Date(), { title: 'Blank', items: [] }, { title: 'Blank', items: items.slice(0, 1) },
  { title: ' ', items }, { title: 'Sample', prompt: '', items }, { title: 'Sample', prompt: undefined, items },
  { title: 'Sample', items, extra: true }, { title: 'Sample', items, [Symbol('unknown')]: true },
  { title: 'Sample', items: [items[0], items[0]] }, { title: 'Sample', items: Array(2) },
  ...['bad_id', '-bad', 'bad-', 'Bad', 'bad--id', '', 1].map((id) => ({ title: 'Sample', items: [items[0], { ...items[1], id }] })),
  ...[{ title: '' }, { by: ' ' }, { note: 1 }, { note: null }, { note: undefined }, { extra: true }]
    .map((change) => ({ title: 'Sample', items: [items[0], { ...items[1], ...change }] })),
  { title: 'Sample', items: Array.from({ length: 65 }, (_, n) => ({ ...items[0], id: `sample-${n}` })) },
])('list door refuses malformed input %#', (value) => {
  expect(() => parseDuelList(value)).toThrow(TypeError);
});

test('64 unique SAMPLE contestants are allowed; ids follow the winner mk rule', () => {
  expect(parseDuelList({ title: 'Sample', items: Array.from({ length: 64 }, (_, n) => ({ ...items[0], id: `sample-${n}` })) }).items)
    .toHaveLength(64);
  expect(slugId('Bramble & Bone')).toBe('bramble-bone');
  expect(slugId(' Some TITLE! ')).toBe('-some-title-');
});

test('every SAMPLE list parses at the same door with explicit provenance', () => {
  expect(SAMPLE_LABEL).toBe('SAMPLE');
  for (const list of [SAMPLE.bracket, SAMPLE.chat, SAMPLE.ladder.top, SAMPLE.ladder.queue]) {
    expect(list.provenance).toBe('sample');
    const { title, items, prompt } = list;
    expect(parseDuelList({ title, items, ...(prompt === undefined ? {} : { prompt }) }).items).toEqual(items);
  }
  expect(SAMPLE.bracket.items).toHaveLength(8);
  expect(SAMPLE.chat.items).toHaveLength(4);
  expect(SAMPLE.chat.window_ms).toBe(15000);
  expect(SAMPLE.ladder.top.items).toHaveLength(10);
  expect(SAMPLE.ladder.queue.items).toHaveLength(3);
  expect(SAMPLE.ladder.provenance).toBe('sample');
  expect(SAMPLE.bracket.items[0]).toEqual({
    id: 'the-ashen-warden', title: 'The Ashen Warden', by: 'simulated_viewer_0311', note: 'cathedral roof · phase two',
  });
});
