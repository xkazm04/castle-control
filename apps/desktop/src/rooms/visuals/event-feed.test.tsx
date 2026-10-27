import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { rowHeight, rowWindow } from '@castle-control/ui';
import { createBeaconsPreview } from '../../beacons-model.js';
import { ContributionFeed } from './event-feed.jsx';
import type { ContributionSource } from '@castle-control/contract';

test('600 pushed test-fire events render bounded windows reaching the first and last events', () => {
  const port = createBeaconsPreview();
  for (let burst = 0; burst < 12; burst++) port.fire('gift', 50);
  const events = port.getSnapshot().events.slice(0, 600);
  expect(events).toHaveLength(600);
  expect(new Set(events.map(event => event.id)).size).toBe(600);
  for (const scroll_top of [0, 300 * rowHeight * 3, 600 * rowHeight * 3]) {
    const html = renderToStaticMarkup(<ContributionFeed events={events} origin="Local preview" scroll_top={scroll_top} />);
    const range = rowWindow(600, scroll_top, rowHeight * 3);
    const count = range.end - range.start;
    expect(html).toContain('aria-rowcount="600"');
    expect(html.match(/data-contribution-row=/g)).toHaveLength(count);
    expect(count).toBeLessThan(20);
    expect(html).toContain(`data-contribution-row="${events[range.start]?.id}"`);
    expect(html).toContain(`data-contribution-row="${events[range.end - 1]?.id}"`);
    expect(html.match(/simulated · Local preview/g)).toHaveLength(count);
    expect(html).toContain(`aria-rowindex="${range.start + 1}"`);
    if (scroll_top === 0) {
      expect(html).toContain('data-contribution-row="simulated-event-1150"');
      expect(html).not.toContain('data-contribution-row="simulated-event-649"');
    } else if (scroll_top === 600 * rowHeight * 3) {
      expect(html).toContain('data-contribution-row="simulated-event-649"');
      expect(html).not.toContain('data-contribution-row="simulated-event-1150"');
    }
  }
});

test('feed has a keyboard-reachable named scroll window and an honest empty state', () => {
  const html = renderToStaticMarkup(<ContributionFeed events={[]} origin="Core simulation" />);
  expect(html).toContain('role="table" aria-label="Simulated Beacons contribution events"');
  expect(html).toContain('tabindex="0"');
  expect(html).toContain('No simulated contributions yet. Run a test fire to add one.');
  expect(html).toContain('not live accounting');
  expect(html).not.toContain('data-contribution-row');
});

test('each supported contribution source keeps its units, timestamp and simulated provenance', () => {
  const base = createBeaconsPreview().getSnapshot().events[0];
  if (!base) throw new Error('Expected generated fixture');
  const cases: readonly [ContributionSource, string][] = [
    ['cheer', 'Bits cheer'], ['bits_use', 'Bits use'], ['subscribe', 'subscriptions'], ['gift', 'gift subscriptions'],
    ['resub', 'resubscriptions'], ['hype_train', 'Hype Train level'], ['channel_points', 'channel points'],
    ['charity', 'charity minor currency units'], ['goal', 'goal minor currency units'], ['power_up', 'power-ups'],
  ];
  for (const [source, label] of cases) {
    const html = renderToStaticMarkup(<ContributionFeed origin="Core simulation"
      events={[{ ...base, burst: { source, amount: 123 } }]} />);
    expect(html).toContain(`123 ${label}`);
    expect(html).toContain(`dateTime="${base.at}"`);
    expect(html).toContain('simulated · Core simulation');
    expect(html).toContain('not live accounting');
    expect(html).not.toContain('\u2014');
  }
});
