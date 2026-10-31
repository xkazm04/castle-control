import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { guardPage } from './network.ts';
import { auditFields, auditStyles, desktopSurfaces } from './styles.ts';
import { buildCoreLauncher, startCore } from './core-launch.ts';

// The desktop fixture journey stays independent of the real-core OBS proof.
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
  } catch (error) {
    await page.goto('about:blank').catch(cleanupError => {
      console.error('Failed to navigate away after the Lots journey error:', cleanupError);
    });
    throw error;
  }
  await page.goto('about:blank');
  verify();
});

test.describe('lottery CORE simulated cast OBS journey', () => {
  test.beforeAll(async () => {
    test.setTimeout(600_000); // A cold Cargo build happens before browser assertions.
    await buildCoreLauncher();
  });
  test('accepted seal and cast render the real core winners', async ({ page }) => {
    const core = await startCore();
    try {
      const verify = await guardPage(page, core.overlayOrigin);
      try {
        // Node carries the capability through invokeMethod. Vite/browser origins
        // remain untrusted and receive neither RPC access nor a session token.
        const contract = core.contract;
        const draw = await core.invoke(contract.lotsDrawUpsert, { draw: {
          draw_id: 'simulated-core-draw', name: 'SIMULATED audience questions',
          policy: { content: 'question', paid_entry: false, paid_weight: false,
            subscriber_only: false, channel_points: false, free_entry_equal_odds: true,
            regions: [], prize_value_usd_cents: 0, registration_confirmed: false,
            official_rules: true, twitch_disclaimer: true },
          rules: { pool: { kind: 'chatters' }, winner_count: 3, cooldown_s: 0,
            cohort_caps: [], weight_curve: { kind: 'equal' }, free_join_equal_odds: true },
        } });
        expect(await core.invoke(contract.lotsDrawCheck, { policy: draw.policy }))
          .toEqual({ result: 'ok', reasons: [] });
        // The last generated participant proves the Rust intake finished before
        // sealing; no fixture endpoint can create or replace an entry.
        await expect.poll(async () => (await core.invoke(contract.lotsRollLookup,
          { draw_id: draw.draw_id, user_id: '111' })).entry?.user_id).toBe('111');
        const sealed = await core.invoke(contract.lotsRollSeal,
          { draw_id: draw.draw_id, source: 'drand_quicknet', margin_s: 1 });
        expect(sealed.sealed.roll.entries).toHaveLength(12);
        // Winners are proof handles (Twitch user ids), not logins.
        const generated = Array.from({ length: 12 }, (_, i) => String(100 + i));
        const handles = sealed.sealed.roll.entries.map(e => e.handle);
        expect([...handles].sort()).toEqual([...generated].sort());
        const cast = await core.invoke(contract.lotsCast, { draw_run_id: sealed.draw_run_id });
        expect(cast.cast.seal).toBe(sealed.sealed.seal);
        expect(cast.cast.winners).toHaveLength(3);
        expect(new Set(cast.cast.winners).size).toBe(3);
        for (const winner of cast.cast.winners) {
          expect(generated).toContain(winner);
          expect(handles).toContain(winner);
        }
        // Both configured projects exercise this page at their actual viewport.
        await page.goto(`${core.overlayOrigin}/lots/${draw.draw_id}?scale=1&anchor=tl`);
        await expect(page.locator('main')).toHaveAttribute('data-simulated', 'true');
        await expect(page.locator('.draw-scene .simulated')).toHaveText('SIMULATED');
        await expect(page.locator('[data-draw-winner]')).toHaveText(cast.cast.winners);
        const island = await page.locator('#cc-cast').textContent();
        if (!island) throw new Error('Missing accepted cast on the real core page');
        expect(contract.parseMethodResult(contract.lotsCast, island)).toEqual(cast);
        await auditStyles(page, [{ name: 'draw plate', selector: 'main' }], { canvas: 'obs-transparent' });
        expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight)).toBe(true);
      } catch (error) {
        await page.goto('about:blank').catch(cleanupError => {
          console.error('Failed to navigate away after the Lots core journey error:', cleanupError);
        });
        throw error;
      }
      await page.goto('about:blank');
      // The overlay document and its same-origin /bundle.js must both be walked.
      expect(verify()).toBeGreaterThanOrEqual(2);
    } finally { await core.close(); }
  });
});
