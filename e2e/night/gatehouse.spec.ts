import { test, expect } from '@playwright/test';
import { SHELL_ORIGIN, buildNightCore, startNightCore } from './launch.ts';
import { guardNight, viteOrigin } from './support.ts';

// Generated SIMULATED duel ballots -> the core's shadow pipeline (rules-only
// verdicts) -> the Gatehouse room and the open /gatehouse/current vote bar.
// The core has no direction seeds configured, so every ballot lands in one
// "Other" direction: the bar proves aggregate delivery, not a two-sided split.
test.beforeAll(async () => {
  test.setTimeout(900_000);
  await buildNightCore();
});

test('Gatehouse: simulated chat reaches the room and the open /gatehouse/current vote bar', async ({ page, context }) => {
  const core = await startNightCore({ lotsBeacon: 'off' });
  try {
    const verify = await guardNight(page, core);
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: SHELL_ORIGIN });
    await core.openDesktop(page, viteOrigin(), '#/chamber/moderator');
    await expect(page.getByText('No opinion directions in the core window.', { exact: true })).toBeVisible();

    // The vote-bar browser source comes from the room's own copy action.
    await page.getByRole('button', { name: 'Copy vote-bar browser source URL', exact: true }).click();
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toContain('/gatehouse/current');
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(new URL(copied).origin).toBe(core.overlayOrigin);
    const overlay = await context.newPage();
    await overlay.goto(copied);
    const bar = overlay.getByRole('main', { name: 'Consensus vote bar', exact: true });
    await expect(bar).toBeVisible();
    await expect(bar.locator('.vote-direction')).toHaveCount(0);

    core.chat('ballots', 9);
    const room = page.getByRole('region', { name: 'The live room', exact: true }).first();
    await expect(async () => {
      await page.getByRole('button', { name: 'Refresh Gatehouse', exact: true }).click();
      await expect(room.getByRole('button', { name: 'Pass · 9 lines', exact: true })).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 30_000 });
    const rows = page.getByRole('table', { name: 'Core chat messages', exact: true }).getByRole('row');
    await expect(rows).toHaveCount(9);
    for (const text of await rows.allTextContents()) expect(text).toMatch(/SIMULATED duel ballot (left|right)/);
    await expect(page.getByText('Other · 100.0%', { exact: true })).toBeVisible();

    // The already-open vote bar updates through /push/gatehouse, without a reload.
    await expect(bar.locator('.vote-direction')).toHaveCount(1);
    await expect(bar.locator('.vote-direction span')).toHaveText('Direction 1 · 100%');
    // Aggregate only: no chat text, login or user id reaches the OBS page.
    const html = await overlay.content();
    expect(html).not.toContain('duel ballot');
    expect(html).not.toContain('simulated_viewer');
    await overlay.close();
    await page.goto('about:blank');
    await verify();
  } finally { await core.close(); }
});
