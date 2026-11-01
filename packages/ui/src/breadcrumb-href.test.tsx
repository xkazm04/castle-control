import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { Breadcrumb } from './breadcrumb.jsx';

test('the first crumb and Back both follow the back_href prop instead of a baked-in route', () => {
  const html = renderToStaticMarkup(<Breadcrumb chamber="lottery" back_href="#/castle" />);
  expect(html).toContain('<a href="#/castle">The keep</a>');
  expect(html).toContain('<a href="#/castle">Back');
  expect(html).not.toContain('#/keep');
});
