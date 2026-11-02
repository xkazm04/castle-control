import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { MoatQuiet } from './heartbeat.jsx';

test('the quiet moat (core, no replay yet) draws the lanes only, says why, and has nothing to press', () => {
  const html = renderToStaticMarkup(<MoatQuiet />);
  expect(html).toContain('data-quiet="true"');
  expect(html).toContain('<small>No replay yet · run a drill in the Gatehouse</small>');
  expect(html).toContain('role="img" aria-label="The moat, empty: no replay has run yet"');
  expect(html).not.toContain('<button');
  expect(html).not.toContain('moat-marker');
  expect(html).not.toMatch(/HELD|simulated-message/);
});
