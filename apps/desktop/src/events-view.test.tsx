import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, expect, test, vi } from 'vitest';
import { chambers } from '@castle-control/ui';
import { createDesktopClient } from './client.js';
import { DesktopView } from './view.jsx';

afterEach(() => { vi.useRealTimers(); });

test('validated simulated events update rampart chips on all four rendered routes', async () => {
  vi.useFakeTimers();
  const client = createDesktopClient({ mode: 'fixture' });
  const stop = client.start();
  try {
    await vi.waitFor(() => { expect(client.getSnapshot().status?.stream?.live).toBe(false); });
    await vi.advanceTimersByTimeAsync(1500);
    await vi.waitFor(() => { expect(client.getSnapshot().status?.stream?.live).toBe(true); });
    for (const { id, name } of chambers) {
      const html = renderToStaticMarkup(<DesktopView current={id} snapshot={client.getSnapshot()} theme="paper"
        on_navigate={() => undefined} on_theme_change={() => undefined} search="" on_search={() => undefined} />);
      for (const label of [name, 'On air', 'Twitch: connected', 'OBS: connected', '3 watching', 'Simulated', 'SIMULATED SOURCE']) {
        expect(html).toContain(label);
      }
    }
  } finally { stop(); }
});
