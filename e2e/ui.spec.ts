import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { repo, routes, slug, stewardStates, themes } from './inventory.ts';
import { guardPage } from './network.ts';
import { startOverlay, visualId } from './overlay-server.ts';
import { auditFields, auditStyles, desktopSurfaces } from './styles.ts';

const diagnostics = new WeakMap<Page, () => void>();
let overlay: Awaited<ReturnType<typeof startOverlay>>;
test.beforeAll(async () => { overlay = await startOverlay(); });
test.afterAll(async () => { await overlay?.close(); });
test.beforeEach(async ({ page }) => { diagnostics.set(page, await guardPage(page)); });
test.afterEach(async ({ page }, info) => {
  const directory = join(repo, 'e2e/screenshots', info.project.name);
  await mkdir(directory, { recursive: true });
  const verify = diagnostics.get(page);
  if (!verify) throw new Error('Missing diagnostic guard');
  try {
    await page.screenshot({ path: join(directory, `${slug(info.title)}.png`), fullPage: true,
      animations: 'disabled', caret: 'hide' });
  } finally {
    // Stop active SSE/HMR before checking the complete page's diagnostics.
    await page.goto('about:blank');
    verify();
  }
});

for (const route of routes) for (const theme of themes) for (const steward of stewardStates) {
  test(`desktop-${slug(route)}-${theme}-steward-${steward}`, async ({ page }) => {
    // main.tsx defaults to fixtures when no native launch is injected.
    await page.goto(`/${route}`);
    await expect(page.locator('.cc-sample')).toHaveText('Simulated');
    await expect(page.locator('.keep-home, .overview-workspace, .shell-room')).toBeVisible();
    await expect(page.getByText('Opening the room...', { exact: true })).toHaveCount(0);
    await expect(page.locator('.cc-steward-bar')).toBeVisible();
    if (route.endsWith('/drill')) await expect(page.locator('.moderator-drill')).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`${route.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`));
    if (theme === 'stock') await page.getByRole('button', { name: 'Toggle paper and dark stock' }).click();
    await expect(page.locator('.cc-frame')).toHaveAttribute('data-theme', theme);
    if (steward === 'open') {
      // Steward is a persistent panel in this shell. Open means focused controls;
      // Overview additionally exposes its existing Talkback tab, with no LLM call.
      await page.getByRole('button', { name: 'Steward', exact: true }).click();
      await expect(page.getByRole('textbox', { name: 'Talk to the Steward...' })).toBeFocused();
      const talkback = page.getByRole('tab', { name: 'Talkback', exact: true });
      if (await talkback.count()) {
        await talkback.click();
        await expect(talkback).toHaveAttribute('aria-selected', 'true');
      }
      await expect(page.getByRole('region', { name: 'The Steward', exact: true })).toBeVisible();
    }
    await page.evaluate(() => document.fonts.ready.then(() => undefined));
    await auditStyles(page, desktopSurfaces);
    await auditFields(page);
  });
}

test('overlay-simulated-connected', async ({ page }) => {
  const before = overlay.pushes();
  await page.goto(`${overlay.url}/beacons/${visualId}`);
  await expect(page.locator('#scene')).toContainText('SIMULATED');
  const badge = page.locator('[data-simulated-badge]');
  await expect(badge).toBeVisible();
  await expect(badge).toHaveText('SIMULATED');
  await expect(page.locator('#scene')).toHaveAttribute('data-simulated', 'true');
  await expect(page.locator('#scene')).toHaveAttribute('data-intensity', '0.75');
  expect(overlay.pushes() - before, 'Walked simulated SSE connections').toBeGreaterThan(0);
  // OBS composites this canvas over a scene. Only this test permits transparency;
  // token font/ink, explicit white backgrounds and all other audits stay strict.
  await auditStyles(page, [
    { name: 'overlay canvas', selector: '#scene' },
    { name: 'simulated rendered layer', selector: '#scene > div' },
    { name: 'simulated provenance badge', selector: '[data-simulated-badge]' },
  ], { canvas: 'obs-transparent' });
});
