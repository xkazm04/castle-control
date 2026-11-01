import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import { RoomTitle } from './room-title.jsx';
import { Stamp } from './stamp/stamp.jsx';
import { chambers } from './shell.jsx';

test.each(chambers)('room title identifies $name, its function, detail and stamp slot', chamber => {
  const html = renderToStaticMarkup(<RoomTitle chamber={chamber.id} detail="Simulated revision 2"
    stamp={<Stamp kind="draft" />} back_label="Back to the keep" on_back={vi.fn()} />);
  for (const text of [chamber.description, `The ${chamber.name}`, `data-module="${chamber.id}"`,
    `chamber ${chamber.number} of 4`, 'aria-label="Breadcrumb"', 'aria-current="page">Simulated revision 2',
    'data-stamp="draft"', 'Back to the keep', '<kbd class="cc-kbd">Esc</kbd>']) expect(html).toContain(text);
  expect(html.match(/<h1\b/g)).toHaveLength(1);
  expect(html.match(/aria-current="page"/g)).toHaveLength(1);
});

test('title without detail makes the room current and omits the optional stamp', () => {
  const html = renderToStaticMarkup(<RoomTitle chamber="studio" back_label="Return to overview" on_back={vi.fn()} />);
  expect(html).toContain('<b aria-current="page">Map Room</b>');
  expect(html).not.toContain('data-stamp');
  expect(html).toContain('Return to overview');
});

test('the crumb and labelled Back button delegate navigation to the owner', () => {
  const back = vi.fn();
  const tree = RoomTitle({ chamber: 'lottery', back_label: 'Return to draw', on_back: back });
  tree.props.children[0].props.children[0].props.children[0].props.onClick();
  tree.props.children[1].props.onClick();
  expect(back).toHaveBeenCalledTimes(2);
  expect(tree.props.children[1].props.type).toBe('button');
});
