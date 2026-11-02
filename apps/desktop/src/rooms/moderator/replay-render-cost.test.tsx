import { act } from 'react';
import type { ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import type { DecisionId, MessageId } from '@castle-control/contract';
import { expect, test } from 'vitest';
import { installFakeDom } from '../../fake-dom.js';
import { ReplayPanel } from './messages.jsx';

// Counting spy: every array scan and every message_text read made while React
// re-renders the panel. All 4200 lines are generated and labelled simulated.
function simulatedLines(total: number) {
  const reads = { text: 0, filter: 0 };
  const lines = Array.from({ length: total }, (_, index) => {
    const line = { decision_id: `simulated-decision-${index}` as DecisionId, message_id: `simulated-message-${index}` as MessageId,
      at: '2026-10-29T12:00:00Z', verdict: (['pass', 'hold', 'bar'] as const)[index % 3]! };
    return Object.defineProperty(line, 'message_text', { enumerable: true, get() { reads.text += 1; return `simulated line ${index}`; } });
  });
  const scan = lines.filter.bind(lines);
  Object.defineProperty(lines, 'filter', { value: (...args: Parameters<typeof scan>) => { reads.filter += 1; return scan(...args); } });
  return { lines, reads };
}

async function rendersWith(filter: 'all' | 'draft' | 'pass', query: string, marked?: ReadonlySet<string>) {
  const { lines, reads } = simulatedLines(4200);
  const { container, uninstall } = installFakeDom();
  try {
    const root = createRoot(container);
    const draw = (footer: ReactNode) => act(async () => { root.render(<ReplayPanel messages={lines} filter={filter} query={query}
      marked={marked} footer={footer} on_filter={() => {}} on_query={() => {}} />); });
    await draw('first');
    const first = { ...reads };
    reads.text = 0; reads.filter = 0;
    // Ten more renders where only an unrelated prop (the footer) changes.
    for (let tick = 0; tick < 10; tick += 1) await draw(`tick ${tick}`);
    const repeat = { ...reads };
    await act(async () => { root.unmount(); });
    return { first, repeat };
  } finally { uninstall(); }
}

test('replay panel scans and lowercases the lines once per input change, not once per render', async () => {
  const { first, repeat } = await rendersWith('all', '');
  expect(first.filter).toBeGreaterThan(0);
  expect(first.text).toBeGreaterThanOrEqual(4200);
  expect(repeat.filter).toBe(0);
  expect(repeat.text).toBeLessThan(10 * 60); // the visible window only, never the 4200-line scan
});

test('replay panel still recomputes when the filter inputs change', async () => {
  const { lines, reads } = simulatedLines(300);
  const { container, uninstall } = installFakeDom();
  try {
    const root = createRoot(container);
    const draw = (query: string) => act(async () => { root.render(<ReplayPanel messages={lines} filter="all" query={query}
      on_filter={() => {}} on_query={() => {}} />); });
    await draw(''); reads.text = 0;
    await draw('simulated line 29');
    expect(reads.text).toBeGreaterThanOrEqual(300);
    expect(container.textContent).toContain('simulated line 29');
    expect(container.textContent).not.toContain('simulated line 5 ');
    await act(async () => { root.unmount(); });
  } finally { uninstall(); }
});
