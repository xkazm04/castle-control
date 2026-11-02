import { expect, test } from 'vitest';
import { visibleRange } from './rule-table.jsx';
import { rowWindow } from './windowed-rows.jsx';

// Scroll parity: RuleTable and WindowedRows must window rows by one rule.
test('RuleTable windowing equals WindowedRows windowing across row counts and scroll offsets', () => {
  const disagreements: string[] = [];
  for (const total of [0, 1, 5, 15, 16, 17, 20, 100, 10000]) {
    for (const offset of [0, 31, 32, 96, 320, 640, 3200, 319680, 320000, 999999]) {
      const a = visibleRange(total, offset);
      const b = rowWindow(total, offset);
      if (a.start !== b.start || a.end !== b.end || a.before !== b.before || a.after !== b.after) {
        disagreements.push(`${total}@${offset}: table ${a.start}-${a.end} rows ${b.start}-${b.end}`);
      }
    }
  }
  expect(disagreements).toEqual([]);
});
