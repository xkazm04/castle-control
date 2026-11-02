import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { createLotsPreview } from '../../lots-model.js';
import { createDrawDisplay } from './display.js';
import { OverlayNote } from './result.jsx';

test.each([['S', 0.75], ['M', 1], ['L', 1.5]] as const)(
  'lots-08 OBS URL carries %s size as scale %s and preserves every anchor', async (size, scale) => {
    const port = createLotsPreview(); await port.seal(); await port.start();
    expect(port.getSnapshot().started).toBe(true);
    const display = createDrawDisplay();
    for (const anchor of ['tl', 'tr', 'bl', 'br', 'center'] as const) {
      display.edit({ size, anchor });
      const html = renderToStaticMarkup(<OverlayNote draw_id={port.getSnapshot().draw.draw_id} display={display.getSnapshot()} />);
      expect(html).toContain(`/lots/hall-questions?scale=${scale}&amp;anchor=${anchor}`);
    }
  });

test('the OBS URL carries the selected draw shape for the renderer page', async () => {
  const port = createLotsPreview(); await port.seal(); await port.start();
  const display = createDrawDisplay();
  for (const shape of ['urn', 'wheel', 'deck', 'ballot_box'] as const) {
    display.edit({ shape });
    const html = renderToStaticMarkup(<OverlayNote draw_id={port.getSnapshot().draw.draw_id} display={display.getSnapshot()} />);
    expect(html).toContain(`/lots/hall-questions?scale=1&amp;anchor=br&amp;shape=${shape}`);
  }
});
