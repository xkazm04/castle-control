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
  await auditStyles(page, desktopSurfaces); await auditFields(page);
  await page.keyboard.press('Escape');
  await expect(page).toHaveURL(/#\/keep$/); await expect(page.locator('.keep-home')).toBeVisible();
  expect(mutations).toEqual([]);
  await page.goto('about:blank'); verify();
});
