import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { guardPage } from './network.ts';
import { auditFields, auditStyles, desktopSurfaces } from './styles.ts';

const diagnostics = new WeakMap<Page, () => void>();
test.beforeEach(async ({ page }) => {
  diagnostics.set(page, await guardPage(page));
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true,
      value: { writeText: async (value: string) => { document.documentElement.dataset.copiedSource = value; } } });
  });
});
test.afterEach(async ({ page }) => {
  await page.goto('about:blank');
  const verify = diagnostics.get(page);
  if (!verify) throw new Error('Missing diagnostic guard');
  verify();
});

test('Beacons streamer journey: tune, test fire, inspect and copy a simulated source', async ({ page }) => {
  await page.goto('/#/chamber/visuals');
  await expect(page.locator('.cc-sample')).toHaveText('Simulated');
  const plates = page.getByRole('radiogroup', { name: 'Beacon visuals' });
  await plates.getByRole('radio').first().focus();
  await page.keyboard.press('ArrowRight');
  await expect(plates.getByRole('radio').nth(1)).toHaveAttribute('aria-checked', 'true');
  await page.keyboard.press('Home');
  const editor = page.getByRole('form', { name: 'Kindling curve editor' });
  await expect(editor).toBeVisible(); // Expected red on base: fixture curve is read-only.
  const point = editor.getByRole('button', { name: /^Control point 2:/ });
  await point.focus();
  await page.keyboard.press('Shift+ArrowUp');
  await page.keyboard.press('Enter');
  await expect(point).toHaveAttribute('aria-label', /35% intensity/);
  const curve = editor.getByRole('group', { name: 'Editable contribution to intensity curve' });
  const bounds = await curve.boundingBox();
  const handle = await point.boundingBox();
  if (!bounds || !handle) throw new Error('Missing curve drag geometry');
  const preview = page.getByRole('region', { name: 'Beacon appearance preview' });
  const before = await preview.getAttribute('data-intensity');
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width * 0.3, bounds.y + bounds.height * 0.2, { steps: 8 });
  await expect(preview).not.toHaveAttribute('data-intensity', before ?? '');
  await page.mouse.up();
  await editor.getByLabel('Decay', { exact: true }).selectOption('exponential');
  await editor.getByLabel('Half-life (seconds)').fill('60');
  await editor.getByRole('button', { name: 'Save curve locally' }).click();
  await page.getByLabel('Gift-sub weighting').selectOption('2');
  await page.getByLabel('Size', { exact: true }).selectOption('L');
  await page.getByLabel('Anchor', { exact: true }).selectOption('bottom-right');
  await page.getByLabel('Colour', { exact: true }).selectOption('azure');
  await page.getByLabel('Art style', { exact: true }).selectOption('preset-pixel-altar');
  await page.getByRole('button', { name: 'Save visual style locally', exact: true }).click();
  await expect(page.getByLabel('Art style', { exact: true })).toHaveValue('preset-pixel-altar');
  await page.getByLabel('Burst timing (ms)').fill('1200');
  await expect(preview).toHaveAttribute('data-size', 'L');
  await expect(preview).toHaveAttribute('data-anchor', 'bottom-right');
  await expect(preview).toHaveAttribute('data-colour', 'azure');
  await expect(preview.locator('img')).toHaveAttribute('src', '/art/preset-pixel-altar.webp');
  await expect(preview).toHaveAttribute('data-burst-ms', '1200');
  await page.getByRole('button', { name: 'Test fire: 50 gifts' }).click();
  await expect(page.locator('.visuals-bench [role="status"]').first()).toContainText('Simulated 50 gift events');
  await expect(page.locator('.visuals-fire-output')).toContainText('100% blaze');
  await expect(page.getByRole('table', { name: 'Simulated Beacons contribution events' })).toHaveAttribute('aria-rowcount', '650');
  expect(await page.locator('[data-contribution-row]').count()).toBeLessThan(20);
  await page.getByRole('button', { name: 'Advance simulated clock 60 s' }).click();
  await expect(page.locator('.visuals-bench [role="status"]').first()).toContainText('decay applied locally');
  await page.getByRole('button', { name: 'Copy browser-source URL for Offering altar' }).click();
  await expect(page.locator('.visuals-core-source-status')).toContainText('SIMULATED example URL copied for Offering altar');
  await expect(page.locator('html')).toHaveAttribute('data-copied-source', 'http://localhost:4821/fixture-not-live/offering-altar?scale=1&anchor=br');
  await page.getByRole('button', { name: 'End test fire' }).click();
  await expect(page.getByLabel('Gift-sub weighting')).toHaveValue('2');
  await expect(page.getByLabel('Size', { exact: true })).toHaveValue('L');
  await auditStyles(page, desktopSurfaces);
  await auditFields(page);
});
