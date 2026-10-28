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

test('main deletes the launch global and the lazy shell still receives the live opt-in and capability', async () => {
  network();
  const launch = { mode: 'core', steward: 'live', endpoint: 'http://127.0.0.1:3210/', session_token: 'a'.repeat(64) };
  vi.stubGlobal('window', { __CASTLE_CONTROL_LAUNCH__: launch });
  vi.stubGlobal('document', { getElementById: () => ({ textContent: '' }) });
  await import('./main.jsx');
  expect(window).not.toHaveProperty('__CASTLE_CONTROL_LAUNCH__');
  const node = render.mock.calls.at(-1)?.[0];
  if (!isValidElement<{ client: DesktopClient }>(node)) throw new Error('Missing desktop client');
  const client = node.props.client;
  stops.push(client.start());
  await vi.waitFor(() => { expect(client.getSnapshot().phase).toBe('ready'); });
  expect(coreStewardConnection(client.getSnapshot())?.launch.session_token).toBe(launch.session_token);
  for (const surface of ['#/keep', '#/overview', '#/chamber/studio']) {
    const html = await markup(client, surface);
    expect(html).toContain('LIVE STEWARD');
    expect(html).not.toContain('SIMULATED STEWARD');
    expect(html).not.toContain(launch.session_token);
  }
});

test.each([undefined, 'simulated'] as const)('core launch with opt-in %s leaves the lazy shell simulated', async steward => {
  const transport = network();
  const client = createDesktopClient({ mode: 'core', endpoint: 'http://127.0.0.1:3210/', session_token: 'a'.repeat(64),
    ...(steward ? { steward } : {}) }, transport);
  stops.push(client.start());
  await vi.waitFor(() => { expect(client.getSnapshot().phase).toBe('ready'); });
  expect(await markup(client)).toContain('SIMULATED STEWARD · SAMPLE DATA');
});

test('fixture and unconnected live launches keep the simulated label', async () => {
  network();
  const fixture = createDesktopClient({ mode: 'fixture' });
  const core = createDesktopClient({ mode: 'core', endpoint: 'http://127.0.0.1:3210/', session_token: 'a'.repeat(64), steward: 'live' });
  for (const client of [fixture, core]) expect(await markup(client)).toContain('SIMULATED STEWARD · SAMPLE DATA');
});
