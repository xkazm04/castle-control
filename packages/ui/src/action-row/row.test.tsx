import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import { createRef } from 'react';
import { ActionRow, ActionRowView, fitActionCount } from './index.jsx';

test('measured keys reserve more space only when needed, including gaps and exact fits', () => {
  expect(fitActionCount([80, 90, 100], 282, 6, 75)).toBe(3);
  expect(fitActionCount([80, 90, 100], 281, 6, 75)).toBe(2);
  expect(fitActionCount([80, 90, 100], 161, 6, 75)).toBe(1);
  expect(fitActionCount([80, 90, 100], 80, 6, 75)).toBe(0);
  expect(fitActionCount([], 80, 6, 75)).toBe(0);
});

test('keys beyond the measured fit leave the row and appear with their letters in more', () => {
  const entries = ['Q', 'W', 'E'].map(key => ({ key, label: `Action ${key}`, run: vi.fn() }));
  const count = fitActionCount([80, 90, 100], 161, 6, 75);
  const props = { entries, count, seal: null, on_open: vi.fn(), area: createRef<HTMLDivElement>(), measure: createRef<HTMLDivElement>(),
    more: createRef<HTMLButtonElement>(), menu: createRef<HTMLDivElement>() };
  const closed = renderToStaticMarkup(<ActionRowView {...props} open={false} />);
  expect(closed).toContain('more · 2');
  expect(closed.match(/data-role="action-key"/g)).toHaveLength(1);
  const open = renderToStaticMarkup(<ActionRowView {...props} open />);
  expect(open).toContain('role="menuitem"><kbd>W</kbd><span>Action W</span>');
  expect(open).toContain('role="menuitem"><kbd>E</kbd><span>Action E</span>');
});

test('the row renders the entry letters, labels, disabled states and the final seal slot', () => {
  const html = renderToStaticMarkup(<ActionRow entries={[
    { key: 'Q', label: 'Set up', run: vi.fn() }, { key: 'W', label: 'Cast', run: vi.fn(), disabled: true },
  ]} seal={<button data-role="seal-key">Hold Space</button>} open={false} on_open={vi.fn()} />);
  expect(html).toContain('data-role="action-row"');
  expect(html).toContain('data-primary="true" data-role="action-key"><kbd>Q</kbd>');
  expect(html).toContain('data-role="action-key"><kbd>Q</kbd><span>Set up</span>');
  expect(html).toContain('data-role="action-key" disabled=""><kbd>W</kbd>');
  expect(html.indexOf('data-role="seal-key"')).toBeGreaterThan(html.indexOf('data-role="action-key"'));
});
