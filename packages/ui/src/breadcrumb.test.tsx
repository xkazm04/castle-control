import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import { Breadcrumb } from './breadcrumb.jsx';

test('Breadcrumb includes draft detail, 1-4 locator and a Back link to its actual origin', () => {
  const html = renderToStaticMarkup(<Breadcrumb chamber="lottery" detail="Writ · draft · rev 1" back_href="#/overview" />);
  for (const text of ['The keep', 'The Lot Chamber', 'Writ · draft · rev 1', 'Chamber locator', 'Back', 'Esc', 'href="#/overview"']) expect(html).toContain(text);
  for (const id of ['lottery', 'moderator', 'visuals', 'studio']) expect(html).toContain(`href="#/chamber/${id}"`);
  expect(html.match(/aria-current="location"/g)).toHaveLength(1);
});

test('Breadcrumb Back delegates to its owner to preserve the navigation origin', () => {
  const back = vi.fn(); const prevented = vi.fn();
  const tree = Breadcrumb({ chamber: 'lottery', back_href: '#/keep', on_back: back });
  tree.props.children[2].props.onClick({ preventDefault: prevented });
  expect(back).toHaveBeenCalledOnce();
  expect(prevented).toHaveBeenCalledOnce();
});
