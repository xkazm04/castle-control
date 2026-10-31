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
  await expect(page.locator('.cc-rampart > [data-stamp="simulated"]')).toHaveText('Simulated');
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

test('Beacons night replay: a pinned night, a fit, the way back, and a sealed Steward proposal', async ({ page }) => {
  await page.goto('/#/chamber/visuals');
  const replay = page.getByRole('article', { name: 'Night replay' });
  const verdict = replay.locator('.visuals-replay-verdict [role="status"]');
  await expect(replay).toContainText('SIMULATED');
  await expect(replay).toContainText('Money affects visuals only');
  await replay.getByRole('button', { name: 'Gift wave', exact: true }).click();
  await expect(verdict).toContainText('Pinned at max for 8 of 48 minutes · first pinned at minute 30');
  // The lane runs with reduced motion: the night is drawn whole and Play stays off.
  await expect(replay.getByRole('button', { name: 'Play', exact: true })).toBeDisabled();
  await replay.getByRole('slider', { name: /^Scrub the night/ }).fill('1860');
  await expect(replay.getByText('Gift wave · 31:00 / 48:00')).toBeVisible();
  await expect(replay.locator('.visuals-replay-stamp')).toHaveText('Pinned at max');
  await expect(replay.locator('[data-pinned-band]')).not.toHaveCount(0);
  await expect(replay.locator('[data-first-lit]')).toHaveText('first lit · 12:05');
  const fit = replay.getByRole('button', { name: "Fit the top point to this night's peak · move it to 167", exact: true });
  await fit.click();
  await expect(verdict).toContainText('Peak 99% at minute 33 · never pinned');
  await expect(verdict).toContainText('Dashed, the sample curve: saturates');
  await expect(replay.locator('[data-trace="before"]')).toHaveCount(1);
  await expect(replay.locator('.visuals-replay-peak-label')).toContainText('peak 99%');
  await replay.getByRole('button', { name: 'Back to the sample curve', exact: true }).click();
  await expect(verdict).toContainText('Pinned at max for 8 of 48 minutes');
  await expect(replay.locator('[data-trace="before"]')).toHaveCount(0);
  await fit.click();
  await replay.getByRole('button', { name: 'Send curve to the Steward', exact: true }).click();
  await expect(replay).toContainText('Draft · revision 1 · not on air');
  const hold = page.getByRole('button', { name: /hold to seal/i });
  await expect(hold).toHaveCount(1);
  await hold.focus(); await page.keyboard.down('Space');
  await expect(replay).toContainText('Sealed · this is the curve');
  await page.keyboard.up('Space');
  await replay.getByRole('button', { name: 'Sub train', exact: true }).click();
  await expect(verdict).toContainText('Never lit · the night peaks at 9.9 weighted subs');
  await expect(replay.locator('.visuals-replay-stamp')).toHaveText('Never lit tonight');
  await expect(replay.locator('[data-first-lit]')).toHaveCount(0);
  await auditStyles(page, desktopSurfaces);
  await auditFields(page);
});
