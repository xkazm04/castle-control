import { test, expect } from '@playwright/test';
import { guardPage } from './network.ts';
import { auditFields, auditStyles, desktopSurfaces } from './styles.ts';

test('Dress rehearsal in fixture dev explains desktop entry and Escape returns to Keep', async ({ page }) => {
  const verify = await guardPage(page);
  const mutations: string[] = [];
  page.on('request', request => { if (new URL(request.url()).pathname === '/rpc') mutations.push(request.method()); });
  await page.goto('/#/keep');
  await page.getByRole('button', { name: 'Dress rehearsal', exact: true }).click();
  await expect(page).toHaveURL(/#\/rehearsal$/);
  await expect(page.getByRole('button', { name: 'Start dress rehearsal', exact: true })).toBeDisabled();
  await expect(page.getByRole('status').filter({ hasText: 'Dress rehearsal needs the desktop app.' })).toBeVisible();
  await expect(page.getByText(/generated SIMULATED chat/)).toBeVisible();
  // The status picture is on the page even before the desktop app starts a rehearsal.
  const board = page.getByRole('region', { name: 'Rehearsal status', exact: true });
  for (const station of ['OBS', 'Scene', 'Sources', 'Crowd', 'Session']) await expect(board.getByText(station, { exact: true })).toBeVisible();
  await auditStyles(page, desktopSurfaces); await auditFields(page);
  // Setup is a Steward flow; without the desktop app its seal says plainly that nothing was sent.
  const dock = page.locator('.cc-steward-dock');
  await dock.getByRole('button', { name: 'Connect my OBS', exact: true }).first().click();
  for (const option of ['On this computer', '4455', 'No password', 'Just this time']) await page.locator('.cc-steward-option', { hasText: option }).first().click();
  const seal = dock.getByRole('button', { name: /hold to seal/i }).first();
  await seal.focus(); await page.keyboard.down('Space');
  try { await expect(dock.getByText('Dress rehearsal needs the desktop app, so nothing was sent to OBS or the core.').first()).toBeVisible(); }
  finally { await page.keyboard.up('Space'); }
  await page.locator('.rehearsal-workspace').click({ position: { x: 4, y: 4 } });
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await expect(page).toHaveURL(/#\/keep$/); await expect(page.locator('.keep-home')).toBeVisible();
  expect(mutations).toEqual([]);
  await page.goto('about:blank'); verify();
});
