import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { StageFrame } from './stage-frame.jsx';

test('StageFrame keeps generic stage, three figures, two actions and navigation slots separate', () => {
  const html = renderToStaticMarkup(<StageFrame label="Example overview" stage={<div>Graphical caller content</div>}
    headline_figures={[<b key="a">First</b>, <b key="b">Second</b>, <b key="c">Third</b>]}
    primary_actions={[<button key="a">Act</button>, <button key="b">Pause</button>]}
    entry_points={<a href="#/example/detail">Open detail</a>} />);
  for (const text of ['cc-stage-graphic', 'Graphical caller content', 'cc-stage-figures', 'First', 'Second', 'Third',
    'cc-stage-actions', '>Act</button>', '>Pause</button>', 'cc-stage-entries', 'href="#/example/detail"']) expect(html).toContain(text);
  expect(html).not.toMatch(/lottery|urn|Twitch/);
});
