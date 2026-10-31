import { test, expect } from '@playwright/test';
import { guardPage } from './network.ts';
import { auditFields, auditStyles, desktopSurfaces } from './styles.ts';

test('local Map Room journey: inspect tiles and banners, edit the map, inspect locked stages', async ({ page }) => {
  const verify = await guardPage(page);
  try {
    await page.goto('/#/chamber/studio');
    await expect(page.locator('.cc-sample')).toHaveText('Simulated');
    const room = page.getByRole('region', { name: 'Map Room work', exact: true });
    await expect(room).toBeVisible();
    const tile = room.locator('[data-hex-tile="D4"]');
    await tile.focus();
    await page.keyboard.press('Enter');
    await expect(tile).toHaveAttribute('aria-pressed', 'true');
    await expect(room.getByLabel('Selected tile', { exact: true })).toContainText('Now: inspecting D4');
    const banner = room.getByRole('button', { name: 'Inspect House Tallow banner', exact: true });
    await banner.focus();
    await page.keyboard.press('Space');
    await expect(banner).toHaveAttribute('aria-pressed', 'true');
    await expect(room.locator('[data-hex-tile="F1"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(room.getByLabel('Selected tile', { exact: true })).toContainText('House Tallow');

    const size = room.getByLabel('Map size', { exact: true });
    await size.selectOption('l');
    await expect(room.locator('[data-hex-tile]')).toHaveCount(96);
    await room.locator('[data-hex-tile="L8"]').click();
    await size.selectOption('s');
    await expect(room.locator('[data-hex-tile]')).toHaveCount(24);
    await expect(room.locator('[data-hex-tile="A1"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(room.getByLabel('Selected tile', { exact: true })).toContainText('Now: inspecting A1');
    // Native selects/number fields use the same keyboard path as other kit fields.
    await room.getByLabel('Map anchor', { exact: true }).selectOption('bottom_right');
    await room.getByLabel('Preset colour', { exact: true }).selectOption('azure');
    await room.getByLabel('Art style', { exact: true }).selectOption('pixel');
    await room.getByLabel('Reveal timing (ms)', { exact: true }).fill('850');
    const preview = room.getByRole('figure', { name: 'Session-only map preview' });
    await expect(preview).toHaveAttribute('data-size', 's');
    await expect(preview).toHaveAttribute('data-anchor', 'bottom_right');
    await expect(preview).toHaveAttribute('data-colour', 'azure');
    await expect(preview).toHaveAttribute('data-reveal-ms', '850');
    await expect(preview.locator('img')).toHaveAttribute('src', '/art/preset-pixel-hexmap.webp');
    await expect(preview).toContainText('SIMULATED');
    await expect(room.getByRole('status', { name: 'Map design status' })).toContainText('Session only');
    await room.getByLabel('Reveal timing (ms)', { exact: true }).fill('-1');
    await expect(room.getByRole('alert')).toContainText('whole number from 0 to 60000');
    await expect(preview).toHaveAttribute('data-reveal-ms', '850');
    await room.getByLabel('Reveal timing (ms)', { exact: true }).fill('0');
    await expect(preview).toHaveAttribute('data-reveal-ms', '0');
    await room.getByRole('button', { name: 'Replay local reveal', exact: true }).click();
    await expect(preview).toHaveAttribute('data-reveal-run', '1');

    for (const stage of ['Muster', 'Proclaimed', 'Sand table']) {
      const control = room.getByRole('button', { name: `Inspect ${stage} requirements`, exact: true });
      await control.focus();
      await page.keyboard.press('Enter');
      await expect(control).toHaveAttribute('aria-pressed', 'true');
      await expect(room.locator('.cc-proclamation')).toContainText(`Requirements · ${stage}`);
      await expect(room.locator('[data-rung="0"]')).toHaveAttribute('data-current', 'true');
      await expect(room.locator('[data-rung="1"]')).toHaveAttribute('data-locked', 'true');
      await expect(room.locator('[data-rung="2"]')).toHaveAttribute('data-locked', 'true');
    }
    await expect(room).toContainText('WP 4.0 is pending');
    await auditStyles(page, desktopSurfaces);
    await auditFields(page);
    await room.getByRole('button', { name: 'Reset local design', exact: true }).click();
    await expect(room.locator('[data-hex-tile]')).toHaveCount(54);
    await expect(preview).toHaveAttribute('data-anchor', 'centre');
    await expect(preview.locator('img')).toHaveAttribute('src', '/art/preset-heraldic-hexmap.webp');
  } finally { await page.goto('about:blank'); verify(); }
});
