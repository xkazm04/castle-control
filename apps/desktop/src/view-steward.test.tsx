import { isValidElement } from 'react';
import type { ReactNode } from 'react';
import { renderToReadableStream } from 'react-dom/server';
import { afterEach, expect, test, vi } from 'vitest';
import { invoke } from '@castle-control/contract';
import { coreStewardConnection, createDesktopClient } from './client.js';
import type { DesktopClient } from './model.js';
import { simulatedRead } from './simulated.js';
import { initialNavigation } from './navigation.js';
import { DesktopView } from './view.jsx';

const { render } = vi.hoisted(() => ({ render: vi.fn<(node: ReactNode) => void>() }));
vi.mock('react-dom/client', () => ({ createRoot: () => ({ render }) }));
const stops: (() => void)[] = [];
afterEach(() => { for (const stop of stops.splice(0)) stop(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const launch = { mode: 'core', steward: 'live', endpoint: 'http://127.0.0.1:3210/', session_token: 'a'.repeat(64) };
let mainClient: DesktopClient | undefined;

function network() {
  const fetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => new Response(JSON.stringify(
    String(init?.body).includes('"status.get"') ? { ...simulatedRead(1).status, simulated: false } : { state: 'connected' })));
  vi.stubGlobal('fetch', fetch);
  const socket = vi.fn(() => ({ onopen: null, onmessage: null, onclose: null, onerror: null, close: vi.fn() }));
  vi.stubGlobal('WebSocket', class { constructor() { return socket(); } });
  return { socket, rpc: invoke };
}

async function markup(client: DesktopClient, surface = '#/keep') {
  const stream = await renderToReadableStream(<DesktopView snapshot={client.getSnapshot()} navigation={initialNavigation(surface)}
    theme="paper" on_navigate={vi.fn()} on_theme_change={vi.fn()} />);
  await stream.allReady;
  return new Response(stream).text();
}

/** Reuse main's actual client, including when a single route case runs alone. */
async function readyMainClient() {
  network();
  if (!mainClient) {
    vi.stubGlobal('window', { __CASTLE_CONTROL_LAUNCH__: launch });
    vi.stubGlobal('document', { getElementById: () => ({ textContent: '' }) });
    await import('./main.jsx');
    expect(window).not.toHaveProperty('__CASTLE_CONTROL_LAUNCH__');
    const node = render.mock.calls.at(-1)?.[0];
    if (!isValidElement<{ client: DesktopClient }>(node)) throw new Error('Missing desktop client');
    mainClient = node.props.client;
  }
  const client = mainClient;
  stops.push(client.start());
  await vi.waitFor(() => { expect(client.getSnapshot().phase).toBe('ready'); });
  return client;
}

test('main deletes the launch global and retains the live opt-in and capability', async () => {
  const client = await readyMainClient();
  expect(coreStewardConnection(client.getSnapshot())).toMatchObject({ live: true,
    launch: { session_token: launch.session_token, steward: 'live' } });
});

// Cold imports for three complete surfaces used to share the bootstrap test's
// five-second deadline. Keep real lazy imports, but test each route separately
// so transformation under the parallel workspace gate cannot consume that sum.
test.each(['#/keep', '#/overview', '#/chamber/studio'])('lazy %s receives main\'s live opt-in without exposing its capability', async surface => {
  const client = await readyMainClient();
  expect(coreStewardConnection(client.getSnapshot())?.launch.session_token).toBe(launch.session_token);
  const html = await markup(client, surface);
  expect(html).toContain('Live Steward');
  expect(html).not.toContain('cc-steward__role">simulated co-pilot · sample data');
  expect(html).not.toContain(launch.session_token);
});

test.each([undefined, 'simulated'] as const)('core launch with opt-in %s leaves the lazy shell simulated', async steward => {
  const transport = network();
  const client = createDesktopClient({ mode: 'core', endpoint: 'http://127.0.0.1:3210/', session_token: 'a'.repeat(64),
    ...(steward ? { steward } : {}) }, transport);
  stops.push(client.start());
  await vi.waitFor(() => { expect(client.getSnapshot().phase).toBe('ready'); });
  expect(await markup(client)).toContain('<span class="cc-steward__role">simulated co-pilot · sample data</span><span class="cc-sim">Simulated</span>');
});

test('fixture and unconnected live launches keep the simulated label', async () => {
  network();
  const fixture = createDesktopClient({ mode: 'fixture' });
  const core = createDesktopClient({ mode: 'core', endpoint: 'http://127.0.0.1:3210/', session_token: 'a'.repeat(64), steward: 'live' });
  for (const client of [fixture, core]) expect(await markup(client)).toContain('<span class="cc-steward__role">simulated co-pilot · sample data</span><span class="cc-sim">Simulated</span>');
});
