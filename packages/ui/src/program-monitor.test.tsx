import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { ProgramMonitor } from './program-monitor.jsx';

test('Program is an explicitly simulated monitor, separate from Preview', () => {
  const html = renderToStaticMarkup(<ProgramMonitor><p>Published picture</p></ProgramMonitor>);
  expect(html).toContain('Program monitor');
  expect(html).toContain('SIMULATED PROGRAM');
  expect(html).toContain('Published picture');
});
