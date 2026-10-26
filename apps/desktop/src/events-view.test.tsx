import { renderToReadableStream } from 'react-dom/server';
import { afterEach, expect, test, vi } from 'vitest';
import { chambers } from '@castle-control/ui';
import { createDesktopClient } from './client.js';
import { DesktopView } from './view.jsx';
import { initialNavigation } from './navigation.js';

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
      const stream = await renderToReadableStream(<DesktopView current={id} snapshot={client.getSnapshot()} theme="paper"
        on_navigate={() => undefined} on_theme_change={() => undefined} search="" on_search={() => undefined} />);
      await stream.allReady;
      const html = await new Response(stream).text();
      for (const label of [name, 'ON AIR simulated', 'Twitch simulated', 'OBS simulated', 'Gatehouse simulated', 'Simulated', 'SIMULATED SOURCE']) {
        expect(html).toContain(label);
      }
    }
    for (const surface of ['keep', 'overview']) {
      const stream = await renderToReadableStream(<DesktopView navigation={initialNavigation(`#/${surface}`)}
        snapshot={client.getSnapshot()} theme="paper" on_navigate={() => undefined} on_theme_change={() => undefined} />);
      await stream.allReady;
      const html = await new Response(stream).text();
      expect(html).toContain('Armed 0');
      expect(html).toContain('Watching 3');
      expect(html.match(/aria-label="Talk to the Steward\.\.\."/g)).toHaveLength(1);
    }
  } finally { stop(); }
});
