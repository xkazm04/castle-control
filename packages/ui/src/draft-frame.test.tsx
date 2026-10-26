import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { DraftFrame } from './draft-frame.jsx';

test('drafts always carry an explicit not-on-air label', () => {
  const html = renderToStaticMarkup(<DraftFrame><p>Question draw</p></DraftFrame>);
  expect(html).toContain('DRAFT · NOT ON AIR');
  expect(html).toContain('Question draw');
});
