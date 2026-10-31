import { test, expect } from '@playwright/test';
import { guardPage } from './network.ts';
import { auditStyles, desktopSurfaces } from './styles.ts';

const drill = '/#/chamber/moderator/drill';
const held = 'Held 3 of 40 · simulated';

test('the drill opens on a finished moat: three stamps, a labelled gap and one live count', async ({ page }) => {
  const verify = await guardPage(page);
  try {
    await page.goto(drill);
    const moat = page.getByRole('group', { name: 'Moat timeline, simulated replay', exact: true });
    await expect(page.getByRole('status').filter({ hasText: held })).toHaveCount(1);
    await expect(moat.getByRole('button', { name: /^Held, not on air: simulated-message-\d+, rule [a-z-]+\. Inspect\.$/ })).toHaveCount(3);
    await expect(moat.locator('.moat-gap-label')).toHaveText('RECORDING GAP');
    await expect(moat.locator('.moat-gap-note')).toHaveText('missing, not replayed');
    await expect(page.getByText('message text is never shown')).toBeVisible();
    // The table is still the accessible equivalent, and it names the same rules.
    await expect(page.getByRole('table', { name: 'Simulated replay outcomes', exact: true })).toContainText('rule · links · Delete message');
    // The e2e lane runs with reduced motion: the finished frame, Play off, the scrubber live.
    await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeDisabled();
    await expect(page.getByText('Reduced motion is on')).toBeVisible();
    await auditStyles(page, desktopSurfaces);
  } finally { verify(); }
});

test('a stamp opens its inspector, and the inspector opens the rule bench on that rule', async ({ page }) => {
  const verify = await guardPage(page);
  try {
    await page.goto(drill);
    const inspector = page.getByRole('complementary', { name: 'Selected message', exact: true });
    await expect(inspector).toContainText('Nothing selected');
    const stamp = page.getByRole('button', { name: /rule repeats\. Inspect\.$/ });
    await stamp.focus();
    await page.keyboard.press('Enter');
    await expect(stamp).toHaveAttribute('aria-pressed', 'true');
    await expect(inspector).toContainText('Time out');
    await expect(inspector).toContainText('repeats');
    await expect(inspector).toContainText('No message text is stored or shown');
    await inspector.getByRole('link', { name: 'Open rule repeats in the rule bench', exact: true }).click();
    await expect(page).toHaveURL(/#\/chamber\/moderator$/);
    const bench = page.getByRole('region', { name: 'Rule bench', exact: true });
    await expect(bench.getByRole('combobox', { name: 'Watching rule' })).toHaveValue('repeats');
  } finally { verify(); }
});

test('the night report is not on screen and prints on its own sheet', async ({ page }) => {
  const verify = await guardPage(page);
  try {
    await page.addInitScript(() => {
      // Keep the report that print would have received, so the sheet can be inspected.
      window.print = () => { document.body.append(document.querySelector('[data-moat-report]')?.cloneNode(true) ?? ''); };
    });
    await page.goto(drill);
    await expect(page.locator('[data-moat-report]')).toHaveCount(0);
    await page.getByRole('button', { name: 'Print night report', exact: true }).click();
    const sheet = page.locator('[data-moat-report]');
    await expect(sheet).toHaveCount(1);
    await expect(sheet).toBeHidden();
    await page.emulateMedia({ media: 'print' });
    await expect(sheet).toBeVisible();
    await expect(sheet.getByRole('heading', { name: 'Gatehouse night report' })).toBeVisible();
    await expect(sheet.getByRole('row')).toHaveCount(4);
    await expect(page.locator('.moderator-drill')).toBeHidden();
  } finally { verify(); }
});

test.describe('with motion allowed', () => {
  test.use({ reducedMotion: 'no-preference' });

  test('Play runs the replay and the count climbs to the end; the scrubber and End key step it', async ({ page }) => {
    const verify = await guardPage(page);
    try {
      await page.goto(drill);
      const moat = page.getByRole('group', { name: 'Moat timeline, simulated replay', exact: true });
      const stamps = moat.getByRole('button', { name: /^Held, not on air:/ });
      await expect(stamps).toHaveCount(3);
      await page.getByRole('button', { name: '60×', exact: true }).click();
      await expect(page.getByRole('button', { name: '60×', exact: true })).toHaveAttribute('aria-pressed', 'true');
      await page.getByRole('button', { name: 'Play', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
      // The replay restarts from the beginning, so the stamps leave and drop again.
      await expect(page.getByRole('status').filter({ hasText: 'Held 0 of 40' })).toHaveCount(1);
      await expect(page.getByRole('status').filter({ hasText: held })).toHaveCount(1, { timeout: 15_000 });
      await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
      await expect(stamps).toHaveCount(3);
      const slider = page.getByRole('slider', { name: 'Replay position', exact: true });
      await slider.fill('0');
      await expect(stamps).toHaveCount(0);
      await expect(page.getByRole('status').filter({ hasText: 'Held 0 of 40' })).toHaveCount(1);
      await slider.press('End');
      await expect(stamps).toHaveCount(3);
      await expect(slider).toHaveAttribute('aria-valuetext', /40 of 40$/);
    } finally { verify(); }
  });

  test('Space on the focused Play button plays and never seals', async ({ page }) => {
    const verify = await guardPage(page);
    try {
      await page.goto(drill);
      await page.getByRole('button', { name: 'Play', exact: true }).focus();
      await page.keyboard.press('Space');
      await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
      await page.keyboard.press('Space');
      await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
    } finally { verify(); }
  });
});
