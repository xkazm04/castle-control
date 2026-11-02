import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { PreviewMonitor, ProgramMonitor } from './program-monitor.jsx';

test('Program is an explicitly simulated monitor, separate from Preview', () => {
  const html = renderToStaticMarkup(<ProgramMonitor><p>Published picture</p></ProgramMonitor>);
  expect(html).toContain('Program monitor');
  expect(html).toContain('data-stamp="simulated"');
  expect(html).toContain('aria-label="Simulated: Simulated program"');
  expect(html).toContain('Simulated program');
  expect(html).toContain('Sample picture only · nothing is sent to OBS');
  expect(html).toContain('data-on-air="true"');
  expect(html).toContain('Published picture');
});

test('an empty Program has no lit lamp and presents the serif empty state', () => {
  for (const children of [null, undefined, false]) {
    const html = renderToStaticMarkup(<ProgramMonitor>{children}</ProgramMonitor>);
    expect(html).toContain('data-on-air="false"');
    expect(html).toContain('class="cc-empty cc-empty--compact"');
    expect(html).toContain('Nothing sealed to Program');
  }
});

test('Preview shares the frame but always identifies drafts separately from Program', () => {
  const empty = renderToStaticMarkup(<PreviewMonitor>{null}</PreviewMonitor>);
  for (const text of ['Preview monitor', 'cc-preview-lamp', 'data-stamp="draft"', 'Drafts only', 'cc-empty']) expect(empty).toContain(text);
  const filled = renderToStaticMarkup(<PreviewMonitor><p>Simulated draft</p></PreviewMonitor>);
  expect(filled).toContain('Simulated draft');
  expect(filled).not.toContain('cc-empty');
  expect(filled).not.toContain('Simulated program');
});
