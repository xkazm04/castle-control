import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { createCoreBeaconsPort } from '../../beacons-core.js';
import { ConnectedBeacons } from './core.jsx';

test('core room explains the transparent OBS source and its sizing without promising unverified designs', async () => {
  // Generated configuration; no real channel or viewer data.
  const port = createCoreBeaconsPort({
    mode: 'core', endpoint: 'http://127.0.0.1:3210/', session_token: 'a'.repeat(64),
  }, { rpc: async () => ({ visuals: [{
    visual_id: 'synthetic-frame', name: 'Synthetic frame', design_id: 'unverified-design',
    curve: { ranges: [{ total: 0, intensity: 0 }, { total: 50, intensity: 1 }], decay: { kind: 'none' } },
  }] }) });
  await port.load();
  const html = renderToStaticMarkup(<ConnectedBeacons port={port} />);
  expect(html).not.toContain('OBS delivery are unavailable');
  expect(html).not.toContain('Rendering remains unavailable');
  expect(html).toContain('The copied browser-source URL is a transparent OBS browser source');
  expect(html).toContain('scales to fit the source width and height');
  expect(html).toContain('A visual naming an unverified design shows nothing.');
  expect(html).toContain('Money changes visuals only.');
  expect(html).toContain('>Copy browser-source URL</button>');
});
