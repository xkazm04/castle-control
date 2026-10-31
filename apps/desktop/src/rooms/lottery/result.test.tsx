import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { createLotsPreview } from '../../lots-model.js';
import { createDrawDisplay } from './display.js';
import { FixtureCast } from './result.jsx';

test.each([['S', 0.75], ['M', 1], ['L', 1.5]] as const)(
  'lots-08 OBS URL carries %s size as scale %s and preserves every anchor', async (size, scale) => {
    const port = createLotsPreview(); await port.seal(); await port.start();
    expect(port.getSnapshot().started).toBe(true);
    const display = createDrawDisplay();
    for (const anchor of ['tl', 'tr', 'bl', 'br', 'center'] as const) {
      display.edit({ size, anchor });
      const html = renderToStaticMarkup(<FixtureCast port={port} hash="simulated-seal" display={display.getSnapshot()} />);
      expect(html).toContain(`/lots/hall-questions?scale=${scale}&amp;anchor=${anchor}`);
    }
  });
