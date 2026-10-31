import assert from 'node:assert/strict';
import type { Page } from '@playwright/test';

export function loopback(url: string): boolean {
  const parsed = new URL(url);
  return ['http:', 'https:', 'ws:', 'wss:'].includes(parsed.protocol)
    && ['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname);
}

/** Install before navigation: HTTP/SSE and WebSockets have separate doors. */
export async function guardPage(page: Page, coreOrigin?: string): Promise<() => number> {
  if (coreOrigin && (!loopback(coreOrigin) || new URL(coreOrigin).origin !== coreOrigin)) {
    throw new Error('Expected the exact launched loopback core origin');
  }
  // CORE mode admits only its launched read-only origin. Existing fixture
  // journeys keep their loopback policy; no new host/port wildcard is added.
  const permitted = (url: string) => coreOrigin ? new URL(url).origin === coreOrigin : loopback(url);
  const blocked: string[] = [];
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  let requests = 0;
  page.on('console', message => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.context().route('**/*', async route => {
    requests++;
    const url = route.request().url();
    if (permitted(url)) await route.continue();
    else { blocked.push(url); await route.abort('blockedbyclient'); }
  });
  await page.context().routeWebSocket('**/*', socket => {
    if (permitted(socket.url())) socket.connectToServer();
    else { blocked.push(socket.url()); socket.close({ code: 1008, reason: 'Loopback fixtures only' }); }
  });
  return () => {
    console.log(`[e2e diagnostics] walked ${requests} requests, 1 console listener, 1 page-error listener`);
    assert.ok(requests > 0, 'Network guard refused empty request inventory');
    assert.deepEqual({ blocked, consoleErrors, pageErrors }, { blocked: [], consoleErrors: [], pageErrors: [] });
    return requests;
  };
}
