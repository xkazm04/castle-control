import { test, expect } from '@playwright/test';
import { buildNightCore, startNightCore } from './launch.ts';
import { guardNight } from './support.ts';
import { dressRehearsalInUi } from './rehearsal-flow.ts';

test.beforeAll(async () => { test.setTimeout(900_000); await buildNightCore(); });

test('Dress rehearsal connects a masked password, runs generated scenarios, adds SIMULATED overlays and clears owned sources', async ({ page }) => {
  test.setTimeout(180_000);
  const core = await startNightCore({ rehearsal: true, lotsBeacon: 'off' });
  try {
    const verify = await guardNight(page, core, ['lots.cast:conflict']);
    await dressRehearsalInUi(page, core);
    const removedAgain = await core.invoke(core.contract.obsRehearsalClear, {});
    expect(removedAgain.removed).toBe(0);
    await page.goto('about:blank'); await verify();
  } catch (error) {
    // The automatic failure screenshot is taken after finally closes the core, so it always shows
    // "Core connection interrupted" and the outside view. Keep the page as it was at the failure.
    await test.info().attach('before-core-close', { body: await page.screenshot(), contentType: 'image/png' });
    throw error;
  } finally { await core.close(); }
});
