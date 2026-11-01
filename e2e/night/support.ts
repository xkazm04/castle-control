import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { SHELL_ORIGIN } from './launch.ts';
import type { NightCore } from './launch.ts';

export function viteOrigin(): string {
  const vite = test.info().config.metadata.vite;
  if (typeof vite !== 'string') throw new Error('night.config.ts must expose the Vite origin');
  return vite;
}

export function nightOut(): string {
  const out = test.info().config.metadata.out;
  if (typeof out !== 'string') throw new Error('night.config.ts must expose the night output folder');
  return out;
}

/**
 * Admit only the shell origin, the launched core and its overlay listener. The
 * shell route fulfils its own requests; anything else is refused and reported.
 * Console errors and page errors must stay empty. A refused core RPC (HTTP 400
 * with an error envelope) is accepted only when its method and code are listed
 * in `expected`, e.g. `lots.cast:conflict` while the public round is pending.
 */
export async function guardNight(page: Page, core: NightCore, expected: readonly string[] = []): Promise<() => Promise<void>> {
  const coreOrigin = new URL(core.endpoint).origin;
  const permitted = new Set([SHELL_ORIGIN, coreOrigin, core.overlayOrigin]);
  const blocked: string[] = [];
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const refused: string[] = [];
  const pending: Promise<void>[] = [];
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('response', response => {
    const request = response.request();
    if (response.status() !== 400 || response.url() !== `${coreOrigin}/rpc`) return;
    pending.push((async () => {
      const method: unknown = JSON.parse(request.postData() ?? '{}').method;
      const body: unknown = await response.json().catch(() => ({}));
      const code = body && typeof body === 'object' && 'code' in body ? String(body.code) : 'unparsed';
      refused.push(`${String(method)}:${code}`);
    })());
  });
  // Registered first, so the shell route (registered later) takes precedence for its origin.
  await page.context().route('**/*', async route => {
    const url = route.request().url();
    if (url.startsWith('data:') || permitted.has(new URL(url).origin)) await route.fallback();
    else { blocked.push(new URL(url).origin); await route.abort('blockedbyclient'); }
  });
  return async () => {
    await Promise.all(pending);
    const unexpected = refused.filter(item => !expected.includes(item));
    // Chrome logs each refused RPC once as a failed resource; those are the refusals checked above.
    const failed = 'Failed to load resource: the server responded with a status of 400 (Bad Request)';
    const errors = consoleErrors.filter(text => text !== failed);
    expect(consoleErrors.length - errors.length).toBe(refused.length);
    expect({ blocked, errors, pageErrors, unexpected }).toEqual({ blocked: [], errors: [], pageErrors: [], unexpected: [] });
  };
}

/** The SealButton is a deliberate hold; Space held on the focused button seals it. */
export async function holdToSeal(page: Page, button: Locator, gone: Locator): Promise<void> {
  await expect(button).toBeEnabled();
  await button.focus();
  await page.keyboard.down('Space');
  try { await expect(gone).toBeVisible({ timeout: 20_000 }); }
  finally { await page.keyboard.up('Space'); }
}

/** Wait until the core's simulated chat has produced at least `count` matches of a probe. */
export async function eventually<T>(read: () => Promise<T>, accept: (value: T) => boolean, timeout = 15_000): Promise<T> {
  const deadline = Date.now() + timeout;
  for (;;) {
    const value = await read();
    if (accept(value)) return value;
    if (Date.now() > deadline) throw new Error('Timed out waiting for the core');
    await new Promise(resolve => setTimeout(resolve, 200));
  }
}

/** Create a Beacons visual through the Beacons room UI. */
export async function createVisualInUi(page: Page, visual_id: string, name: string): Promise<void> {
  const room = page.getByRole('region', { name: 'Core Beacons', exact: true });
  await room.getByRole('textbox', { name: 'Visual ID', exact: true }).fill(visual_id);
  await room.getByRole('textbox', { name: 'Visual name', exact: true }).fill(name);
  await room.getByRole('combobox', { name: 'Art style', exact: true }).selectOption({ label: 'Heraldic altar' });
  await room.getByRole('combobox', { name: 'Driven by', exact: true }).selectOption({ label: 'Bits cheer' });
  await room.getByRole('button', { name: 'Save visual to core', exact: true }).click();
  await expect(room.getByText('Visual configuration saved by the core.', { exact: true })).toBeVisible();
}

/** In #/stream, hold to add one output row as an OBS browser source, and return its notice once settled. */
export async function addStreamOutput(page: Page, row: string): Promise<Locator> {
  const card = page.getByRole('article', { name: row, exact: true });
  const notice = card.getByRole('status');
  const phase = card.getByText(/^(idle|ready|resolving|adding|added|refused)$/);
  const before = await notice.textContent();
  const button = card.getByRole('button', { name: 'Hold to seal and proclaim', exact: true });
  await expect(button).toBeEnabled();
  await button.focus();
  await page.keyboard.down('Space');
  // The row leaves its previous state, then settles on added or refused.
  await expect(notice).not.toHaveText(before ?? '', { timeout: 20_000 });
  await page.keyboard.up('Space');
  await expect(phase).toHaveText(/^(added|refused)$/);
  return notice;
}
