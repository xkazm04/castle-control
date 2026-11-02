import { renderToReadableStream } from 'react-dom/server';
import { afterEach, expect, test, vi } from 'vitest';
import { chambers } from '@castle-control/ui';
import { createDesktopClient } from './client.js';
import type { Snapshot } from './model.js';
import { DesktopView } from './view.jsx';
import { initialNavigation } from './navigation.js';

afterEach(() => { vi.useRealTimers(); });

async function withUpdatedFixture(check: (snapshot: Snapshot) => Promise<void>) {
  vi.useFakeTimers();
  const client = createDesktopClient({ mode: 'fixture' });
  const stop = client.start();
  try {
    await vi.waitFor(() => { expect(client.getSnapshot().status?.stream?.live).toBe(false); });
    await vi.advanceTimersByTimeAsync(1500);
    await vi.waitFor(() => { expect(client.getSnapshot().status?.stream?.live).toBe(true); });
    await check(client.getSnapshot());
  } finally { stop(); }
}

// Each real lazy route retains the default five-second deadline. Cold chunk
// imports must not accumulate across four chambers and Keep/Overview in one test.
test.each(chambers)('validated simulated events update rampart chips on $name route', async ({ id, name }) => {
  await withUpdatedFixture(async snapshot => {
    const stream = await renderToReadableStream(<DesktopView current={id} snapshot={snapshot} theme="day"
      on_navigate={() => undefined} on_theme_change={() => undefined} search="" on_search={() => undefined} />);
    await stream.allReady;
    const html = await new Response(stream).text();
    for (const label of [name, 'On air is simulated', 'Twitch simulated', 'OBS simulated', 'Gatehouse simulated', 'Simulated']) {
      expect(html).toContain(label);
    }
    expect(html).toContain('aria-label="On air is simulated: nothing is broadcast"');
    expect(html).not.toContain('desktop-simulated');
    expect(html).not.toContain('SIMULATED SOURCE');
  });
});

test.each(['keep', 'overview'])('validated simulated events update rampart chips on #/%s', async surface => {
  await withUpdatedFixture(async snapshot => {
    const stream = await renderToReadableStream(<DesktopView navigation={initialNavigation(`#/${surface}`)}
      snapshot={snapshot} theme="day" on_navigate={() => undefined} on_theme_change={() => undefined} />);
    await stream.allReady;
    const html = await new Response(stream).text();
    expect(html).toContain('Armed 0');
    expect(html).toContain('Watching 3');
    expect(html).toContain('aria-label="On air is simulated: nothing is broadcast"');
    expect(html).not.toContain('desktop-simulated');
    expect(html).not.toContain('SIMULATED SOURCE');
    expect(html.match(/aria-label="Talk to the Steward\.\.\."/g) ?? []).toHaveLength(surface === 'keep' ? 0 : 1);
  });
});
