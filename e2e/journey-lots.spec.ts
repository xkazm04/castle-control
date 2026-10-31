import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { guardPage } from './network.ts';
import { auditFields, auditStyles, desktopSurfaces } from './styles.ts';

// Both journeys use the same asserted simulated configuration and cast.
async function configureAndCast(page: Page) {
  await page.goto('/#/chamber/lottery');
  await expect(page.locator('.cc-sample')).toHaveText('Simulated');
  await page.getByRole('textbox', { name: 'Draw name', exact: true }).fill('SIMULATED audience questions');
  await page.getByRole('combobox', { name: 'Eligible pool', exact: true }).selectOption('keyword');
  await page.getByRole('textbox', { name: 'Keyword', exact: true }).fill('!join');
  await page.getByRole('spinbutton', { name: 'Winners', exact: true }).fill('3');
  await page.getByRole('combobox', { name: 'Weights', exact: true }).selectOption('concave');
  await page.getByRole('checkbox', { name: 'Free !join path with equal odds', exact: true }).uncheck();
  await page.getByRole('combobox', { name: 'Content type', exact: true }).selectOption('prize');
  await expect(page.locator('.cc-desk > p').filter({ hasText: /^Attach an official-rules template before starting a prize draw\.$/ })).toBeVisible();
  await page.getByRole('checkbox', { name: 'Attach official-rules template', exact: true }).check();
  await page.getByRole('checkbox', { name: 'Acknowledge Twitch disclaimer', exact: true }).check();
  await page.getByRole('checkbox', { name: 'Paid entry', exact: true }).check();
  await expect(page.getByRole('button', { name: 'Preview this draw', exact: true })).toBeDisabled();
  await page.getByRole('checkbox', { name: 'Paid entry', exact: true }).uncheck();
  await page.getByRole('combobox', { name: 'Urn size', exact: true }).selectOption('L');
  await page.getByRole('combobox', { name: 'Screen anchor', exact: true }).selectOption('tl');
  await page.getByRole('combobox', { name: 'Urn colour', exact: true }).selectOption('azure');
  await page.getByRole('combobox', { name: 'Art style', exact: true }).selectOption('pixel');
  await page.getByRole('spinbutton', { name: 'Reveal timing in ms', exact: true }).fill('750');
  await expect(page.locator('.lottery-shape-preview')).toHaveAttribute('data-anchor', 'tl');
  await expect(page.locator('.lottery-shape-preview')).toHaveAttribute('data-size', 'L');
  await expect(page.locator('.lottery-shape-preview img')).toHaveAttribute('src', '/art/preset-pixel-urn.webp');
  await auditFields(page);
  await auditStyles(page, desktopSurfaces);
  await page.getByRole('button', { name: 'Preview this draw', exact: true }).click();
  await expect(page.getByText('Proposal · not sealed', { exact: true })).toBeVisible();
  const hold = page.getByRole('button', { name: 'Hold to seal', exact: true });
  await hold.focus();
  await page.keyboard.down('Space');
  await expect(page.getByText('Entry list frozen · simulated', { exact: true })).toBeVisible();
  await page.keyboard.up('Space');
  await expect(page.getByRole('textbox', { name: 'Draw name', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Start simulated draw', exact: true }).click();
  const result = page.getByRole('region', { name: 'Current SIMULATED cast', exact: true });
  await expect(result).toContainText('SIMULATED');
  await expect(result.locator('[data-current-winner]')).toHaveCount(3);
  await page.getByRole('button', { name: 'Read current simulated writ', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Current simulated writ', exact: true })).toContainText('Not a cc-verify proof');
  return result;
}

test('lottery configure, preview, seal, simulated cast and writ journey', async ({ page }) => {
  const verify = await guardPage(page);
  try {
    await configureAndCast(page);
  } finally { await page.goto('about:blank'); verify(); }
});

test('lottery simulated cast OBS journey', async ({ page }) => {
  test.fixme(true, 'fixture has no accepted-core transport; parked for the owner: fixture-to-core handoff');
  const verify = await guardPage(page);
  try {
    const result = await configureAndCast(page);
    // The native Rust page is covered separately by lots_overlay_page.rs.
    const overlay = page.getByRole('link', { name: 'Open draw in OBS', exact: true });
    await expect(overlay).toBeVisible();
    const url = await overlay.getAttribute('href');
    expect(url).toMatch(/\/lots\/hall-questions\?scale=/);
    if (!url) throw new Error('Missing accepted core OBS URL');
    const winners = await result.locator('[data-current-winner]').allTextContents();
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto(url);
    for (const winner of winners) await expect(page.locator('main')).toContainText(winner);
    for (const viewport of [{ width: 1920, height: 1080 }, { width: 1280, height: 720 }]) {
      await page.setViewportSize(viewport);
      await auditStyles(page, [{ name: 'draw plate', selector: 'main' }], { canvas: 'obs-transparent' });
      expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight)).toBe(true);
    }
  } finally { await page.goto('about:blank'); verify(); }
});
