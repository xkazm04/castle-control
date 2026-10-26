import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { ConsensusChart, InkButton, ReplaySummary, ReviewRow, RoomStatusHero, ThemeFrame, WindowedRows, rowHeight, rowWindow } from './index.js';
import { PromotedGallery } from './kit-promoted.jsx';

test('10,000 rows keep a bounded DOM window at the start, middle and end', () => {
  const rows = Array.from({ length: 10000 }, (_, id) => ({ id: `simulated-${id}` }));
  for (const scroll_top of [0, 5000 * rowHeight, 10000 * rowHeight]) {
    const html = renderToStaticMarkup(<WindowedRows rows={rows} label="Generated entries" row_key={row => row.id} scroll_top={scroll_top}>
      {row => <span role="cell">{row.id}</span>}
    </WindowedRows>);
    expect(html).toContain('aria-rowcount="10000"');
    expect(html.match(/role="row"/g)).toHaveLength(16);
    const range = rowWindow(rows.length, scroll_top);
    expect(html).toContain(`aria-rowindex="${range.start + 1}"`);
    expect(html).toContain(`simulated-${range.end - 1}`);
    expect(range.before + range.after + (range.end - range.start) * rowHeight).toBe(rows.length * rowHeight);
  }
  expect(rowWindow(rows.length, 10000 * rowHeight).end).toBe(10000);
});

test('window geometry handles empty and short lists and taller review rows', () => {
  for (const total of [0, 1, 5, 10000]) for (const height of [rowHeight, rowHeight * 4]) {
    const range = rowWindow(total, total * height, height);
    expect(range.start).toBeGreaterThanOrEqual(0);
    expect(range.end).toBe(total);
    expect(range.before + range.after + (range.end - range.start) * height).toBe(total * height);
  }
  expect(renderToStaticMarkup(<WindowedRows rows={[]} label="Empty entries" row_key={String} empty_state="Nothing here">
    {String}
  </WindowedRows>)).toContain('Nothing here');
});

test('consensus chart renders caller copy, series, filters and the empty state', () => {
  const props = { title: 'Opinion history', filter_label: 'Messages', empty_state: 'No results yet' };
  const empty = renderToStaticMarkup(<ConsensusChart {...props} results={[]} />);
  expect(empty).toContain('role="status"');
  expect(empty).toContain('No results yet');
  expect(empty).not.toContain('<svg');
  const html = renderToStaticMarkup(<ConsensusChart {...props} results={[{
    label: 'Text', at: '2026-10-26T12:00:00Z', window_s: 900,
    aria_label: 'Generated opinion history', summary: '17 messages shed · simulated',
    directions: [{ key: 'left', label: 'Go left', share: 0.6, change_label: '+5 pp / 3 min',
      series: [{ at: '2026-10-26T11:45:00Z', share: 0.3 }, { at: '2026-10-26T12:00:00Z', share: 0.6 }] }],
  }]} />);
  for (const text of ['Generated opinion history', 'Go left', '60.0%', '+5 pp / 3 min', '17 messages shed', '<polyline', 'Text']) expect(html).toContain(text);
});

test('review row preserves original quote, status and explicit action slots', () => {
  const html = renderToStaticMarkup(<ReviewRow heading={<b>Generated review</b>} quote="Original simulated message"
    detail="Rule supplied by caller" actions={<InkButton disabled>Approve</InkButton>} />);
  for (const text of ['role="cell"', '<blockquote tabindex="0">Original simulated message', 'Generated review', 'Rule supplied by caller', 'disabled=""', '>Approve</button>']) expect(html).toContain(text);
  const ledger = renderToStaticMarkup(<ReviewRow heading="Recorded decision" detail="Observed only" />);
  expect(ledger).not.toContain('<blockquote');
});

test('room hero and replay summary render plain caller values and actions', () => {
  const hero = renderToStaticMarkup(<RoomStatusHero label="Generated room status"
    cells={[{ id: 'tier', label: 'Room size', value: 'Medium', detail: '87 chatters' }]}
    actions={<InkButton>Preview</InkButton>} action_detail="Simulated control" />);
  for (const text of ['Generated room status', 'Room size', 'Medium', '87 chatters', '>Preview</button>', 'Simulated control']) expect(hero).toContain(text);
  const summary = renderToStaticMarkup(<ReplaySummary items={[{ id: 'observed', value: 50, label: 'Observed passes' }, { id: 'pending', value: 0, label: 'Pending' }]} />);
  for (const text of ['<b>50</b>', 'Observed passes', '<b>0</b>', 'Pending']) expect(summary).toContain(text);
});

test.each(['paper', 'stock'] as const)('gallery renders each promoted component in %s', theme => {
  const html = renderToStaticMarkup(<ThemeFrame theme={theme}><PromotedGallery /></ThemeFrame>);
  expect(html).toContain(`data-theme="${theme}"`);
  for (const name of ['cc-room-status', 'cc-window', 'cc-consensus-chart', 'cc-review-row', 'cc-replay-summary']) expect(html).toContain(name);
  expect(html).toContain('aria-rowcount="10000"');
  expect(html).not.toContain('Generated entry 10000');
  expect(html).toContain('No consensus history available.');
});
