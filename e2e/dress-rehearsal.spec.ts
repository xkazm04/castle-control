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
  // Outside a running rehearsal there are no page forms at all, folded or not: each station's button opens its Steward flow.
  await expect(page.locator('details.rh-more')).toHaveCount(0);
  for (const action of ['Connect my OBS', 'Set up the scene', 'Add sources', 'Run a scenario', 'Clean up']) {
    await expect(board.getByRole('button', { name: action, exact: true })).toBeVisible();
  }
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

test('Connect my OBS asks for the password inside its hold card, masked, and the seal leaves nothing behind', async ({ page }) => {
  const verify = await guardPage(page);
  await page.goto('/#/rehearsal');
  const dock = page.locator('.cc-steward-dock');
  await dock.getByRole('button', { name: 'Connect my OBS', exact: true }).first().click();
  for (const option of ['On this computer', '4455', 'OBS asks for a password']) await page.locator('.cc-steward-option', { hasText: option }).first().click();
  // Not before the hold card: the remember step shows no field.
  await expect(page.locator('input[name="password"]')).toHaveCount(0);
  await page.locator('.cc-steward-option', { hasText: 'Just this time' }).first().click();
  const card = dock.locator('.cc-steward-step[data-step="seal"]');
  const field = card.getByLabel('OBS password');
  await expect(field).toBeVisible();
  await expect(field).toHaveAttribute('type', 'password'); await expect(field).toHaveAttribute('autocomplete', 'off');
  const secret = ['SIMULATED', 'e2e', 'only'].join('-');
  await field.fill(secret);
  await expect(dock).not.toContainText(secret);
  const seal = dock.getByRole('button', { name: /hold to seal/i }).first();
  await seal.focus(); await page.keyboard.down('Space');
  try { await expect(dock.getByText('Dress rehearsal needs the desktop app, so nothing was sent to OBS or the core.').first()).toBeVisible(); }
  finally { await page.keyboard.up('Space'); }
  await expect(page.locator('input[name="password"]')).toHaveCount(0);
  expect(page.url()).not.toContain(secret);
  expect(await page.evaluate(() => JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }))).not.toContain('SIMULATED-e2e-only');
  await page.goto('about:blank'); verify();
});
