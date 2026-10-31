import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import * as presentation from './presentation.jsx';
import { Drill } from './drill.jsx';
import { fixtureMessages, fixtureReplay } from '../../moderation-fixture.js';

test('ClockTime uses the local Prague clock and retains the full ISO metadata', () => {
  const at = '2026-10-26T12:15:00Z';
  // Fix only the host zone; preserve the production locale/options formatter.
  const original = Intl.DateTimeFormat;
  vi.spyOn(Intl, 'DateTimeFormat').mockImplementation(function (locales, options) {
    expect(options).not.toHaveProperty('timeZone');
    return new original(locales, { ...options, timeZone: 'Europe/Prague' });
  });
  try {
    const ClockTime = Reflect.get(presentation, 'ClockTime') as ((props: { at: string }) => React.ReactNode) | undefined;
    expect(ClockTime).toBeTypeOf('function'); if (!ClockTime) return;
    expect(renderToStaticMarkup(<ClockTime at={at} />)).toBe(`<time dateTime="${at}" title="${at}">13:15:00</time>`);
  } finally { vi.restoreAllMocks(); }
});

test('all 4200 simulated decisions have deterministic staggered timestamps', () => {
  expect(new Set(fixtureMessages.map(message => message.at)).size).toBe(4200);
  const times = fixtureMessages.map(message => Date.parse(message.at));
  expect(times.every((at, i) => i === 0 || at - (times[i - 1] ?? 0) === 2000)).toBe(true);
  expect(times.at(-1)).toBe(Date.parse('2026-10-26T12:15:00Z'));
});

test('drill gaps display clock times instead of raw ISO text', () => {
  const html = renderToStaticMarkup(<Drill result={fixtureReplay} />);
  expect(html.replace(/<[^>]+>/g, '')).not.toContain('T12:05:00Z');
  expect(html).toContain('dateTime="2026-10-26T12:05:00Z"');
});
