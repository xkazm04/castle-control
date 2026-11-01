import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { Kbd } from './kbd.jsx';

test('Kbd keeps native keyboard semantics, content, owner attributes and shared chrome', () => {
  expect(renderToStaticMarkup(<Kbd>1</Kbd>)).toBe('<kbd class="cc-kbd">1</kbd>');
  expect(renderToStaticMarkup(<Kbd className="owner-key" aria-label="Escape key" title="Back">Esc</Kbd>))
    .toBe('<kbd aria-label="Escape key" title="Back" class="cc-kbd owner-key">Esc</kbd>');
});
