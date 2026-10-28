import { expect, it } from 'vitest';
import { readConfigSegment } from './config.ts';
import { parseChoiceBoard, CHOICE_BOARD_TEMPLATE } from '../templates/choice-board.ts';

it('reads data through the supplied schema and accepts exactly 5120 UTF-8 bytes', () => {
  const json = JSON.stringify(CHOICE_BOARD_TEMPLATE);
  const exact = json + ' '.repeat(5120 - new TextEncoder().encode(json).length);
  expect(readConfigSegment(exact, parseChoiceBoard)).toEqual({ ok: true, data: CHOICE_BOARD_TEMPLATE });
  expect(readConfigSegment(exact + ' ', parseChoiceBoard).ok).toBe(false);
  const unicode = JSON.stringify({ options: [{ label: 'é'.repeat(2400), votes: 0 },
    { label: 'Simulated second', votes: 0 }] });
  const padded = unicode + ' '.repeat(5120 - new TextEncoder().encode(unicode).length);
  expect(readConfigSegment(padded, parseChoiceBoard).ok).toBe(true);
  expect(readConfigSegment(padded + 'é', parseChoiceBoard).ok).toBe(false);
  expect(readConfigSegment(padded + ' ', parseChoiceBoard).ok).toBe(false);
});

it('never lets malformed JSON, schema errors or parser exceptions escape the boundary', () => {
  for (const segment of [undefined, null, {}, 123, '', '{', 'null', '[]', '{}',
    '{"options":[],"script":"untrusted"}', '{"options":[]} trailing']) {
    expect(() => readConfigSegment(segment, parseChoiceBoard)).not.toThrow();
    expect(readConfigSegment(segment, parseChoiceBoard).ok).toBe(false);
  }
  expect(readConfigSegment('{}', () => { throw new Error('simulated schema failure'); }).ok).toBe(false);
  let called = false;
  expect(readConfigSegment(' '.repeat(5121), () => { called = true; return {}; }).ok).toBe(false);
  expect(called).toBe(false);
});
