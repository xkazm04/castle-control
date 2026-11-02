import { test, expect } from '@playwright/test';
import { SHELL_ORIGIN, buildNightCore, startNightCore } from './launch.ts';
import { guardNight, viteOrigin } from './support.ts';

// Dress rehearsal's Gatehouse chapter, through the UI: the streamer writes a rule,
// arms it, generated SIMULATED crowd chat breaks it, the moderator proposes a ban
// for that generated chatter, and the streamer confirms it. The rehearsal core has
// no Twitch session, so the confirmed ban is a SIMULATED record and nothing is sent.
test.beforeAll(async () => { test.setTimeout(900_000); await buildNightCore(); });

test('Dress rehearsal: an armed rule proposes a SIMULATED ban that the streamer confirms', async ({ page }) => {
  test.setTimeout(180_000);
  const core = await startNightCore({ rehearsal: true, lotsBeacon: 'off' });
  try {
    const verify = await guardNight(page, core);
    await core.openDesktop(page, viteOrigin(), '#/chamber/moderator');
    const review = page.getByRole('region', { name: 'Ban review · SIMULATED', exact: true });
    await expect(review).toContainText('Arm a rule to let the moderator propose bans from generated chat.');

    // 1. Write the rule on the bench (in the Gatehouse drawer) and save it as watching.
    await page.getByRole('button', { name: 'Live room · more of the Gatehouse', exact: true }).click();
    const bench = page.getByRole('region', { name: 'Rule bench', exact: true });
    await bench.getByLabel('Watching rule name', { exact: true }).fill('No boss spoilers');
    await bench.getByLabel('Watching match pattern', { exact: true }).fill('spoiler|boss dies');
    await bench.getByLabel('Draft action', { exact: true }).selectOption('ban');
    await bench.getByRole('button', { name: 'Save as watching', exact: true }).click();
    await expect(bench.getByText(/no-boss-spoilers/).first()).toBeVisible();

    // 2. Arm it; the click is the acknowledgement the core logs before the mode changes.
    await page.getByRole('button', { name: 'Arm in rehearsal: No boss spoilers', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Back to watching: No boss spoilers', exact: true })).toBeVisible();
    await expect.poll(async () => (await core.invoke(core.contract.gatehouseRulesList, {})).rules
      .find(rule => rule.rule_id === 'no-boss-spoilers')?.mode).toBe('armed');
    await page.keyboard.press('Escape');

    // 3. Generated chat: the rehearsal crowd slider.
    await page.goto(`${SHELL_ORIGIN}/#/rehearsal`);
    const crowd = page.getByRole('region', { name: 'Live rehearsal controls', exact: true })
      .getByRole('slider', { name: /SIMULATED chat per minute/ });
    await expect(crowd).toBeEnabled();
    await crowd.fill('300');
    // The slider commits after a short debounce; leave the page only once the core runs the crowd.
    await expect.poll(async () => (await core.invoke(core.contract.rehearsalStart, {})).crowd_per_minute).toBe(300);
    await page.goto(`${SHELL_ORIGIN}/#/chamber/moderator`);

    // 4. The moderator proposes a ban for the generated spoiler chatter.
    const proposal = review.getByRole('article', { name: 'Proposed ban · SIMULATED', exact: true }).first();
    await expect(proposal).toBeVisible({ timeout: 30_000 });
    await expect(proposal).toContainText('SIMULATED spoiler:');
    await expect(proposal).toContainText('SIMULATED viewer 900000001');
    await expect(proposal).toContainText('No boss spoilers');
    // Nothing is decided before the streamer acts.
    const decisions = review.getByRole('list', { name: 'Ban decisions · SIMULATED', exact: true });
    await expect(decisions).toHaveCount(0);

    // 5. The streamer confirms; the outcome is a SIMULATED record only.
    await proposal.getByRole('button', { name: 'Confirm SIMULATED ban', exact: true }).click();
    await expect(decisions).toContainText(
      'SIMULATED ban recorded · SIMULATED viewer 900000001 · No boss spoilers · rehearsal store only, nothing sent to Twitch');
    await test.info().attach('ban-review', { body: await review.screenshot(), contentType: 'image/png' });
    const status = await core.invoke(core.contract.statusGet, {});
    expect(status).toMatchObject({ simulated: true, twitch_connected: false });
    await core.invoke(core.contract.rehearsalCrowdSet, { per_minute: 0 });
    await page.goto('about:blank'); await verify();
  } catch (error) {
    await test.info().attach('before-core-close', { body: await page.screenshot(), contentType: 'image/png' });
    throw error;
  } finally { await core.close(); }
});
