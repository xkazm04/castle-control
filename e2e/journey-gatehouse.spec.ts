import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { guardPage } from './network.ts';
import { auditFields, auditStyles, desktopSurfaces } from './styles.ts';

async function seal(page: Page) {
  const button = page.getByRole('button', { name: 'Hold to seal', exact: true });
  await button.focus();
  await page.keyboard.down('Space');
  await expect(page.getByRole('button', { name: 'Hold to seal', exact: true })).toHaveCount(0);
  await page.keyboard.up('Space');
}

test('Gatehouse shadow journey and transparent stream previews', async ({ page }) => {
  const verify = await guardPage(page);
  try {
    await page.goto('/#/chamber/moderator');
    await expect(page.locator('.cc-sample')).toHaveText('Simulated');
    await expect(page.locator('.moderator-room')).toContainText('SIMULATED');
    await page.getByRole('textbox', { name: 'Watching rule name' }).fill('Links for review');
    await page.getByRole('textbox', { name: 'Watching match pattern' }).fill('https?://');
    await page.getByRole('button', { name: 'Propose watching rule', exact: true }).click();
    await seal(page);
    await expect(page.locator('.moderator-orders')).toContainText('Links for review');
    await page.getByRole('combobox', { name: 'Applied chat delay', exact: true }).selectOption('6');
    await seal(page);
    await expect(page.locator('.moderator-moat .cc-hero-figure')).toHaveAttribute('data-text', '6');
    await page.getByRole('button', { name: 'Play simulated chat', exact: true }).click();
    await expect(page.locator('[data-chat-arrivals]')).not.toHaveText('0 new simulated lines');
    await page.getByRole('button', { name: 'Pause simulated chat', exact: true }).click();
    await expect(page.locator('.moderator-held')).toContainText('Held for review');
    await page.getByRole('button', { name: 'Propose Pass', exact: true }).click();
    await seal(page);
    await expect(page.locator('.moderator-held-plate')).toContainText('The portcullis is clear');
    await expect(page.locator('[data-review-feedback]')).toContainText('Released');
    await page.getByRole('button', { name: 'Propose Undo', exact: true }).click();
    await seal(page);
    await expect(page.locator('[data-review-feedback]')).toContainText('undo');
    await page.getByRole('button', { name: 'Emotes only', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Emotes only', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('link', { name: 'Run the drill', exact: true }).click();
    await expect(page.locator('.moderator-drill')).toContainText('Recording gap');
    await expect(page.locator('.moderator-drill')).toContainText('live parity: pending capture evidence');
    await page.getByRole('link', { name: '← Back to the Gatehouse', exact: true }).click();
    for (const layer of ['Chat overlay', 'Vote bar']) {
      await page.getByRole('combobox', { name: `${layer} size`, exact: true }).selectOption('L');
      await page.getByRole('combobox', { name: `${layer} anchor`, exact: true }).selectOption('top-right');
      await page.getByRole('combobox', { name: `${layer} colour`, exact: true }).selectOption('gules');
      await page.getByRole('combobox', { name: `${layer} art style`, exact: true }).selectOption('pixel');
      await page.getByRole('spinbutton', { name: `${layer} show after (ms)`, exact: true }).fill('-5');
      await page.getByRole('spinbutton', { name: `${layer} hide after (ms)`, exact: true }).fill('999999');
      await page.getByRole('spinbutton', { name: `${layer} hide after (ms)`, exact: true }).press('Tab');
    }
    for (const resolution of ['1920x1080', '1280x720']) {
      const preview = page.locator(`[data-output-frame="${resolution}"]`);
      await expect(preview).toBeVisible();
      await expect(preview).toHaveAttribute('data-transparent', 'true');
      await expect(preview.locator('[data-output-layer="vote"]')).toHaveAttribute('data-size', 'L');
      await expect(preview.locator('[data-output-layer="chat"]')).toHaveAttribute('data-anchor', 'top-right');
      await expect(preview.locator('image')).toHaveAttribute('href', '/art/preset-pixel-votebar.webp');
      await expect(preview).toContainText('SIMULATED');
    }
    await expect(page.getByRole('spinbutton', { name: 'Vote bar show after (ms)', exact: true })).toHaveValue('0');
    await expect(page.getByRole('spinbutton', { name: 'Vote bar hide after (ms)', exact: true })).toHaveValue('60000');
    await expect(page.locator('.moderator-output')).toContainText('Session only');
    await auditStyles(page, desktopSurfaces);
    await auditFields(page);
  } finally {
    await page.goto('about:blank');
    verify();
  }
});
