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

const dock = (page: Page) => page.locator('.cc-steward-dock');
const option = (page: Page, text: string) => dock(page).locator('.cc-steward-option', { hasText: text }).first();
async function holdToSeal(page: Page, done: RegExp) {
  const hold = dock(page).getByRole('button', { name: /^hold to seal/i });
  await hold.focus(); await page.keyboard.down('Space');
  await expect(dock(page)).toContainText(done);
  await page.keyboard.up('Space');
}
const openMore = (page: Page) => page.locator('.visuals-more > summary').click();

test('Beacons: the picture is the live beacon; Tune a beacon drafts into it and seals on the hold', async ({ page }) => {
  await page.goto('/#/chamber/visuals');
  await expect(page.locator('.cc-rampart > [data-stamp="simulated"]')).toHaveText('Simulated');
  const picture = page.getByRole('region', { name: 'Beacon picture' });
  await expect(picture).toContainText('Offering altar');
  await expect(picture.locator('.visuals-stage__blaze')).toContainText('39%');
  await expect(picture.locator('.visuals-monitor__sim')).toHaveText('Simulated');
  const plates = page.getByRole('radiogroup', { name: 'Beacon visuals' });
  await plates.getByRole('radio').first().focus();
  await page.keyboard.press('ArrowRight');
  await expect(plates.getByRole('radio').nth(1)).toHaveAttribute('aria-checked', 'true');
  await expect(picture.locator('.visuals-stage__name')).toHaveText('Gilded camera frame');
  await page.keyboard.press('Home');
  await dock(page).getByRole('button', { name: 'Tune a beacon', exact: true }).click();
  await option(page, 'Gilded camera frame').click();
  await expect(picture.locator('.visuals-monitor__stamp')).toHaveText('Simulated draft · not on air');
  await expect(picture.locator('.visuals-stage__name')).toHaveText('Gilded camera frame');
  await option(page, 'Subscriptions').click();
  const eager = option(page, 'Eager');
  await expect(eager).toContainText(/Full at 40 · Sample night: .* · Gift wave: /);
  await eager.click();
  await option(page, 'Halves every 15 min').click();
  await expect(picture).toHaveAttribute('data-mode', 'night');
  await expect(dock(page)).toContainText('Sub train');
  await dock(page).getByRole('button', { name: 'Looks right', exact: true }).click();
  await expect(dock(page)).toContainText('0→0% · 3→30% · 12→70% · 40→100%');
  // Nothing acted yet: the card in the picker still shows the old route.
  await expect(plates.getByRole('radio').nth(1)).toContainText('gift subscriptions');
  await holdToSeal(page, /Sealed\. The Gilded camera frame now answers eager/);
  await expect(picture).toHaveAttribute('data-mode', 'rest');
  await expect(picture.locator('.visuals-stage__tags')).toContainText('subscriptions');
  await expect(picture.locator('.visuals-stage__tags')).toContainText('Halves every 15 min');
  await auditStyles(page, desktopSurfaces);
});

test('Beacons: Test fire predicts the reaction, fires only on the hold, and Play demo plays a SIMULATED night', async ({ page }) => {
  await page.goto('/#/chamber/visuals');
  const picture = page.getByRole('region', { name: 'Beacon picture' });
  await dock(page).getByRole('button', { name: 'Test fire', exact: true }).click();
  await option(page, 'Offering altar').click();
  await expect(option(page, 'A 50-gift bomb')).toContainText('39% → 82% blaze');
  await option(page, 'A 50-gift bomb').click();
  await expect(picture.locator('.visuals-monitor__stamp')).toHaveText('Simulated test · not fired yet');
  await expect(picture.locator('.visuals-stage__blaze')).toContainText('3982%');
  await holdToSeal(page, /Fired a 50-gift bomb at the Offering altar\. It burns at 82% now\./);
  await expect(picture.locator('.visuals-stage__blaze')).toHaveText(/^82%/);
  await dock(page).getByRole('button', { name: 'Play demo', exact: true }).click();
  await expect(dock(page)).toContainText('Let support change how your stream looks');
  await option(page, 'Gift wave on the camera frame').click();
  await expect(picture.locator('.visuals-monitor__stamp')).toHaveText('Simulated demo night');
  await expect(picture).toHaveAttribute('data-mode', 'night');
  // Reduced motion: the night rests at its peak and the Steward reads that moment.
  await expect(dock(page).locator('.visuals-narration')).toContainText('gilded camera frame');
  await expect(picture.getByRole('list', { name: 'Latest simulated offerings' })).toBeVisible();
  await dock(page).getByRole('button', { name: 'Seen it', exact: true }).click();
  await option(page, 'Fit it to nights like this').click();
  await holdToSeal(page, /That was the demo\. On the gift wave the gilded camera frame peaks/);
  await expect(picture.locator('.visuals-stage__name')).toHaveText('Gilded camera frame');
  await auditStyles(page, desktopSurfaces);
});

test('Beacons workbench behind More: tune points, appearance, test fire and copy a simulated source', async ({ page }) => {
  await page.goto('/#/chamber/visuals');
  await openMore(page);
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
  await openMore(page);
  const replay = page.getByRole('article', { name: 'Night replay' });
  const verdict = replay.locator('.visuals-replay-verdict [role="status"]');
  await expect(replay).toContainText('SIMULATED');
  await expect(replay).toContainText('Money affects visuals only');
  await replay.getByRole('button', { name: 'Gift wave', exact: true }).click();
  await expect(verdict).toContainText('At full blaze for 8 of 48 minutes · full from minute 30');
  // The lane runs with reduced motion: the night is drawn whole and Play stays off.
  await expect(replay.getByRole('button', { name: 'Play', exact: true })).toBeDisabled();
  await replay.getByRole('slider', { name: /^Scrub the night/ }).fill('1860');
  await expect(replay.getByText('Gift wave · 31:00 / 48:00')).toBeVisible();
  await expect(replay.locator('.visuals-replay-stamp')).toHaveText('At full blaze');
  await expect(replay.locator('[data-pinned-band]')).not.toHaveCount(0);
  await expect(replay.locator('[data-first-lit]')).toHaveText('first lit · 12:05');
  const fit = replay.getByRole('button', { name: "Fit the top point to this night's peak · move it to 167", exact: true });
  await fit.click();
  await expect(verdict).toContainText('Peak 99% at minute 33 · never at full blaze');
  await expect(verdict).toContainText('Dashed, the sample curve: tops out');
  await expect(replay.locator('[data-trace="before"]')).toHaveCount(1);
  await expect(replay.locator('.visuals-replay-peak-label')).toContainText('peak 99%');
  await replay.getByRole('button', { name: 'Back to the sample curve', exact: true }).click();
  await expect(verdict).toContainText('At full blaze for 8 of 48 minutes');
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

test('Beacons: Replay a night as a guided flow, with the fit offered only when the night earns it', async ({ page }) => {
  await page.goto('/#/chamber/visuals');
  const picture = page.getByRole('region', { name: 'Beacon picture' });
  await page.getByRole('button', { name: 'Replay a night', exact: true }).click();
  await option(page, 'Offering altar').click();
  await expect(option(page, 'Gift wave')).toContainText('full blaze for 8 min');
  await expect(option(page, 'Sub train')).toContainText('stays dark');
  await option(page, 'Gift wave').click();
  await expect(picture).toHaveAttribute('data-mode', 'night');
  await expect(picture.locator('.visuals-monitor__pin')).toHaveText('At full blaze');
  await dock(page).getByRole('button', { name: 'Seen it', exact: true }).click();
  await option(page, "Fit the top point to this night's peak · move it to 167").click();
  await expect(dock(page)).toContainText('peaks 99%');
  await holdToSeal(page, /Sealed\. The Offering altar now fits the gift wave/);
  await dock(page).getByRole('button', { name: /^Lower/ }).click();
  await openMore(page);
  const replay = page.getByRole('article', { name: 'Night replay' });
  await replay.getByRole('button', { name: 'Gift wave', exact: true }).click();
  await expect(replay.locator('.visuals-replay-verdict [role="status"]')).toContainText('never at full blaze');
  await expect(replay).toContainText('Sealed · this is the curve');
});
