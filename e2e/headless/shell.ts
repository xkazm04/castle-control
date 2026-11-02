// Open the desktop UI in CORE mode on a headless session's core. Mirrors
// e2e/night/launch.ts (openDesktop + serveShell), which binds both to its own
// e2e-night core and exports neither, so the same twelve lines live here.
// The capability reaches only the page's init script; traces and video are off.
import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { SHELL_ORIGIN } from '../night/launch.ts';

type Handoff = import('../../packages/headless/src/index.ts').Handoff;

/**
 * The core trusts only the Tauri webview origin. Every shell request is
 * fulfilled from Vite, so the page's own fetch and WebSocket calls reach the
 * real core with the Origin the shell would send.
 */
async function serveShell(page: Page, viteOrigin: string): Promise<void> {
  const context = page.context();
  await context.route(`${SHELL_ORIGIN}/**`, async route => {
    const url = new URL(route.request().url());
    const response = await route.fetch({ url: `${viteOrigin}${url.pathname}${url.search}` });
    await route.fulfill({ response });
  });
  // Vite's HMR socket has no server under the shell origin; hold it open, silent.
  await context.routeWebSocket(url => url.host === new URL(SHELL_ORIGIN).host, () => undefined);
}

/**
 * `beacons.art.status` makes the core look up the Leonardo key in the OS
 * keychain (cc-beacons/src/art/key.rs). The headless layer denies it; the
 * Beacons room calls it on mount, so this page answers it locally with "no
 * key" and the core never reaches the keychain. Every other RPC goes through.
 * Returns the RPC methods the page sent, in order.
 */
async function shieldKeychain(page: Page, endpoint: string): Promise<() => string[]> {
  const methods: string[] = [];
  await page.route(new URL('rpc', endpoint).href, async route => {
    const body: unknown = route.request().postDataJSON();
    const method = body && typeof body === 'object' && 'method' in body && typeof body.method === 'string'
      ? body.method : 'unparsed';
    methods.push(method);
    if (method === 'beacons.art.status') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{"available":false}' });
    } else await route.fallback();
  });
  return () => [...methods];
}

/** Install the shell route and launch object, then navigate to `hash`. */
export async function openHeadlessDesktop(page: Page, viteOrigin: string, handoff: Handoff, hash: string):
  Promise<() => string[]> {
  await serveShell(page, viteOrigin);
  const rpcMethods = await shieldKeychain(page, handoff.endpoint);
  const launch = { mode: 'core', endpoint: handoff.endpoint, session_token: handoff.token };
  // Same main-frame guard as launch.rs; main.tsx consumes and deletes it.
  await page.addInitScript(({ launch, host }) => {
    if (window === window.top && location.protocol === 'http:' && location.hostname === host && location.port === '') {
      Object.assign(window, { __CASTLE_CONTROL_LAUNCH__: launch });
    }
  }, { launch, host: new URL(SHELL_ORIGIN).hostname });
  await page.goto(`${SHELL_ORIGIN}/${hash}`);
  return rpcMethods;
}

/**
 * Loopback-only guard for the CORE-mode page, registered before navigation.
 * It is guardPage's policy (e2e/network.ts) with one difference: WebSockets
 * are observed, not routed. guardPage's routeWebSocket + connectToServer drops
 * the core's /events subscription (observed: one /events socket, then "Core
 * connection interrupted"), and guardNight (night/support.ts) takes a NightCore.
 * HTTP to anything but the shell, the core or the overlay is refused; console
 * errors, page errors and non-loopback sockets must stay empty.
 */
export async function guardHeadless(page: Page, coreOrigin: string, overlayOrigin: string): Promise<() => number> {
  const permitted = new Set([SHELL_ORIGIN, coreOrigin, overlayOrigin]);
  // The core's /events socket, and Vite's HMR socket that serveShell holds silent.
  const sockets = new Set([new URL(coreOrigin).host, new URL(SHELL_ORIGIN).host]);
  const blocked: string[] = [];
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  let requests = 0;
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('websocket', socket => {
    const url = new URL(socket.url());
    if (!sockets.has(url.host)) blocked.push(`${url.protocol}//${url.host}`);
  });
  // Registered first, so the shell route (registered later) answers its own origin.
  await page.context().route('**/*', async route => {
    requests++;
    const url = route.request().url();
    if (url.startsWith('data:') || permitted.has(new URL(url).origin)) await route.fallback();
    else { blocked.push(new URL(url).origin); await route.abort('blockedbyclient'); }
  });
  return () => {
    console.log(`[e2e diagnostics] walked ${requests} requests, 1 console listener, 1 page-error listener`);
    expect(requests, 'Network guard refused empty request inventory').toBeGreaterThan(0);
    expect({ blocked, consoleErrors, pageErrors }).toEqual({ blocked: [], consoleErrors: [], pageErrors: [] });
    return requests;
  };
}

export { SHELL_ORIGIN };
